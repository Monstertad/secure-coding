// 관리자 기능 테스트
// - 3단계 접근 제어(비로그인/일반유저/관리자)
// - 회원 상태 변경(정지→로그인 차단→재활성화), 상품 직접 삭제, 신고 처리

const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const {
  extractCsrf,
  extractReportIdForTarget,
  createTestUser,
  createAdminUser,
  createTestProduct,
  loginUser,
} = require('./helpers');

afterAll(async () => {
  await pool.end();
});

describe('관리자 페이지 접근 제어', () => {
  test('비로그인 상태로 접근하면 로그인 페이지로 리다이렉트(또는 401)된다', async () => {
    const htmlRes = await request(app).get('/admin');
    expect(htmlRes.status).toBe(302);
    expect(htmlRes.headers.location).toBe('/login');

    const jsonRes = await request(app).get('/admin').set('Accept', 'application/json');
    expect(jsonRes.status).toBe(401);
  });

  test('일반 사용자로 접근하면 403이 반환된다', async () => {
    const user = await createTestUser(app, request, pool);

    const dashboard = await user.agent.get('/admin');
    expect(dashboard.status).toBe(403);

    const users = await user.agent.get('/admin/users');
    expect(users.status).toBe(403);

    const products = await user.agent.get('/admin/products');
    expect(products.status).toBe(403);

    const reports = await user.agent.get('/admin/reports');
    expect(reports.status).toBe(403);
  });

  test('관리자로 접근하면 200이 반환된다', async () => {
    const admin = await createAdminUser(app, request, pool);

    const dashboard = await admin.agent.get('/admin');
    expect(dashboard.status).toBe(200);
    expect(dashboard.text).toContain('대기 중인 신고');
  });
});

describe('회원 관리', () => {
  test('회원을 정지시키면 로그인이 차단되고, 재활성화하면 다시 로그인할 수 있다', async () => {
    const admin = await createAdminUser(app, request, pool);
    const target = await createTestUser(app, request, pool);

    const usersPage = await admin.agent.get('/admin/users');
    expect(usersPage.text).toContain(target.username);

    let csrf = extractCsrf(usersPage.text);
    const suspendRes = await admin.agent
      .post(`/admin/users/${target.id}/status`)
      .type('form')
      .send({ status: 'SUSPENDED', _csrf: csrf });
    expect(suspendRes.status).toBe(302);

    const blockedLogin = await loginUser(request.agent(app), { email: target.email });
    expect(blockedLogin.status).toBe(401);

    const usersPage2 = await admin.agent.get('/admin/users');
    csrf = extractCsrf(usersPage2.text);
    const reactivateRes = await admin.agent
      .post(`/admin/users/${target.id}/status`)
      .type('form')
      .send({ status: 'ACTIVE', _csrf: csrf });
    expect(reactivateRes.status).toBe(302);

    const allowedLogin = await loginUser(request.agent(app), { email: target.email });
    expect(allowedLogin.status).toBe(302);
  });

  test('관리자는 자기 자신의 계정 상태를 변경할 수 없다', async () => {
    const admin = await createAdminUser(app, request, pool);

    const usersPage = await admin.agent.get('/admin/users');
    const csrf = extractCsrf(usersPage.text);
    const res = await admin.agent
      .post(`/admin/users/${admin.id}/status`)
      .type('form')
      .send({ status: 'DORMANT', _csrf: csrf });

    expect(res.status).toBe(400);
  });
});

describe('상품 관리', () => {
  test('관리자는 신고 없이도 임의의 상품을 직접 삭제할 수 있다', async () => {
    const admin = await createAdminUser(app, request, pool);
    const seller = await createTestUser(app, request, pool);
    const title = `관리자삭제테스트${Date.now()}`;
    const { productId } = await createTestProduct(seller.agent, { title, price: 1000 });

    const productsPage = await admin.agent.get('/admin/products');
    expect(productsPage.text).toContain(title);

    const csrf = extractCsrf(productsPage.text);
    const deleteRes = await admin.agent.post(`/admin/products/${productId}/delete`).type('form').send({ _csrf: csrf });
    expect(deleteRes.status).toBe(302);

    const detail = await request(app).get(`/products/${productId}`);
    expect(detail.status).toBe(404); // 상세 접근 안됨

    const list = await request(app).get('/products');
    expect(list.text).not.toContain(`/products/${productId}"`); // 목록에서 제외

    // 검색 결과 페이지는 검색어를 입력창에 그대로 반영해 보여주므로(reflected input),
    // 페이지 전체에 제목 문자열이 있는지가 아니라 실제 상품 카드 링크가 없는지로 검증한다.
    const search = await request(app).get('/products?q=' + encodeURIComponent(title));
    expect(search.text).not.toContain(`/products/${productId}"`);
    expect(search.text).toContain('조건에 맞는 상품이 없습니다');
  });
});

describe('신고 처리', () => {
  test('상품 신고를 승인하면 해당 상품이 삭제된다', async () => {
    const admin = await createAdminUser(app, request, pool);
    const seller = await createTestUser(app, request, pool);
    const reporter = await createTestUser(app, request, pool);
    const { productId } = await createTestProduct(seller.agent, { title: '신고당할 상품', price: 1000 });

    const reportPage = await reporter.agent.get(`/reports/new?targetType=PRODUCT&targetId=${productId}`);
    const reportCsrf = extractCsrf(reportPage.text);
    const reportRes = await reporter.agent
      .post('/reports')
      .type('form')
      .send({ targetType: 'PRODUCT', targetId: productId, reason: '가품입니다', _csrf: reportCsrf });
    expect(reportRes.status).toBe(302);

    const adminReportsPage = await admin.agent.get('/admin/reports');
    expect(adminReportsPage.text).toContain(`PRODUCT #${productId}`);

    // 다른 테스트(파일)가 동시에 만든 신고가 목록에 섞여 있을 수 있으므로,
    // "목록의 첫 항목"이 아니라 이번에 만든 상품에 대한 신고를 정확히 찾는다.
    const reportId = extractReportIdForTarget(adminReportsPage.text, 'PRODUCT', productId);
    expect(reportId).toBeTruthy();
    const resolveCsrf = extractCsrf(adminReportsPage.text);

    const resolveRes = await admin.agent
      .post(`/admin/reports/${reportId}/resolve`)
      .type('form')
      .send({ action: 'approve', _csrf: resolveCsrf });
    expect(resolveRes.status).toBe(302);

    const detail = await request(app).get(`/products/${productId}`);
    expect(detail.status).toBe(404);
  });

  test('사용자 신고를 승인하면 해당 사용자가 휴면 처리되어 로그인할 수 없다', async () => {
    const admin = await createAdminUser(app, request, pool);
    const badUser = await createTestUser(app, request, pool);
    const reporter = await createTestUser(app, request, pool);

    const reportPage = await reporter.agent.get(`/reports/new?targetType=USER&targetId=${badUser.id}`);
    const reportCsrf = extractCsrf(reportPage.text);
    await reporter.agent
      .post('/reports')
      .type('form')
      .send({ targetType: 'USER', targetId: badUser.id, reason: '욕설', _csrf: reportCsrf });

    const adminReportsPage = await admin.agent.get('/admin/reports');
    const reportId = extractReportIdForTarget(adminReportsPage.text, 'USER', badUser.id);
    expect(reportId).toBeTruthy();
    const resolveCsrf = extractCsrf(adminReportsPage.text);

    await admin.agent
      .post(`/admin/reports/${reportId}/resolve`)
      .type('form')
      .send({ action: 'approve', _csrf: resolveCsrf });

    const blockedLogin = await loginUser(request.agent(app), { email: badUser.email });
    expect(blockedLogin.status).toBe(401);
  });

  test('신고를 반려하면 대상에 아무런 조치가 취해지지 않는다', async () => {
    const admin = await createAdminUser(app, request, pool);
    const seller = await createTestUser(app, request, pool);
    const reporter = await createTestUser(app, request, pool);
    const { productId } = await createTestProduct(seller.agent, { title: '반려될 상품', price: 1000 });

    const reportPage = await reporter.agent.get(`/reports/new?targetType=PRODUCT&targetId=${productId}`);
    const reportCsrf = extractCsrf(reportPage.text);
    await reporter.agent
      .post('/reports')
      .type('form')
      .send({ targetType: 'PRODUCT', targetId: productId, reason: '오인 신고', _csrf: reportCsrf });

    const adminReportsPage = await admin.agent.get('/admin/reports');
    const reportId = extractReportIdForTarget(adminReportsPage.text, 'PRODUCT', productId);
    expect(reportId).toBeTruthy();
    const resolveCsrf = extractCsrf(adminReportsPage.text);

    await admin.agent
      .post(`/admin/reports/${reportId}/resolve`)
      .type('form')
      .send({ action: 'reject', _csrf: resolveCsrf });

    const detail = await request(app).get(`/products/${productId}`);
    expect(detail.status).toBe(200); // 삭제되지 않음
  });
});
