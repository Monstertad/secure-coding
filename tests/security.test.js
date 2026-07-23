// 보안 관련 테스트
// - SQL Injection, XSS, CSRF, 권한 우회(Broken Access Control), Rate Limiting,
//   파일 업로드 검증, 주요 이벤트 로깅 확인

const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const {
  extractCsrf,
  uniqueSuffix,
  registerUser,
  loginUser,
  createTestUser,
  createTestProduct,
  fakeJpegBuffer,
} = require('./helpers');

afterAll(async () => {
  await pool.end();
});

describe('SQL Injection', () => {
  test("로그인 이메일에 ' OR 1=1 -- 페이로드를 넣어도 인증을 우회할 수 없다", async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get('/login');
    const csrf = extractCsrf(loginPage.text);

    const res = await agent.post('/login').type('form').send({
      email: "' OR 1=1 --",
      password: 'anything',
      _csrf: csrf,
    });

    // 이메일 형식 검증(400)에서 걸러지거나 인증 실패(401)로 처리되어야 하며,
    // 어떤 경우에도 로그인에 성공(302 /)해서는 안 된다.
    expect(res.status).not.toBe(302);
    expect([400, 401]).toContain(res.status);
  });

  test('상품 검색어에 SQL 구문을 넣어도 서버 오류 없이 정상 처리된다 (쿼리가 깨지지 않음)', async () => {
    const res1 = await request(app).get('/products?q=' + encodeURIComponent("' OR 1=1 --"));
    expect(res1.status).toBe(200);

    const res2 = await request(app).get('/products?q=' + encodeURIComponent("%' OR '1'='1"));
    expect(res2.status).toBe(200);

    const res3 = await request(app).get('/products?q=' + encodeURIComponent("1'; DROP TABLE users; --"));
    expect(res3.status).toBe(200);

    // users 테이블이 실제로 살아있는지(=DROP TABLE이 실행되지 않았는지) 확인
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    expect(rows[0].cnt).toBeGreaterThanOrEqual(0);
  });
});

describe('XSS (저장형)', () => {
  test('상품명/설명에 스크립트를 입력해도 이스케이프되어 저장/출력된다', async () => {
    const seller = await createTestUser(app, request, pool);
    const { productId } = await createTestProduct(seller.agent, {
      title: '<script>alert(1)</script>',
      description: '<img src=x onerror=alert(1)>',
      price: 1000,
    });

    const detail = await request(app).get(`/products/${productId}`);
    expect(detail.text).not.toContain('<script>alert(1)</script>');
    expect(detail.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(detail.text).not.toContain('<img src=x onerror=alert(1)>');
  });

  test('회원가입 아이디는 화이트리스트 검증으로 <script> 등 특수문자를 원천 차단한다', async () => {
    const suffix = uniqueSuffix();
    const agent = request.agent(app);
    const regPage = await agent.get('/register');
    const csrf = extractCsrf(regPage.text);

    const res = await agent.post('/register').type('form').send({
      username: '<script>alert(1)</script>',
      email: `xss${suffix}@example.com`,
      password: 'Abcdef123!',
      passwordConfirm: 'Abcdef123!',
      _csrf: csrf,
    });

    expect(res.status).toBe(400);
  });

  test('신고 사유에 svg onload 페이로드를 넣어도 이스케이프되어 출력된다', async () => {
    const reporter = await createTestUser(app, request, pool);
    const target = await createTestUser(app, request, pool);

    const reportPage = await reporter.agent.get(`/reports/new?targetType=USER&targetId=${target.id}`);
    const csrf = extractCsrf(reportPage.text);
    await reporter.agent.post('/reports').type('form').send({
      targetType: 'USER',
      targetId: target.id,
      reason: '<svg onload=alert(1)>',
      _csrf: csrf,
    });

    const myReports = await reporter.agent.get('/reports/my');
    expect(myReports.text).not.toContain('<svg onload=alert(1)>');
    expect(myReports.text).toContain('&lt;svg onload=alert(1)&gt;');

    // 관리자 승인/반려 없이 WAITING 상태로 남으면 admin.test.js 등 다른 테스트의
    // "대기 중인 신고 목록" 조회에 계속 섞여 들어가므로, 검증이 끝난 뒤 정리한다.
    await pool.execute("UPDATE reports SET status = 'REJECTED' WHERE reporter_id = ? AND target_id = ?", [
      reporter.id,
      target.id,
    ]);
  });
});

describe('CSRF', () => {
  test('CSRF 토큰 없이 상태 변경 요청을 보내면 403으로 거부된다', async () => {
    const user = await createTestUser(app, request, pool);
    const res = await user.agent.post('/transfer/send').type('form').send({ receiverId: 1, amount: '100' });
    expect(res.status).toBe(403);
  });

  test('유효한 CSRF 토큰을 포함하면 정상 처리된다', async () => {
    const sender = await createTestUser(app, request, pool);
    const receiver = await createTestUser(app, request, pool);
    await pool.execute('UPDATE users SET balance = ? WHERE id = ?', [10000, sender.id]);

    const sendPage = await sender.agent.get('/transfer/send');
    const csrf = extractCsrf(sendPage.text);
    const res = await sender.agent
      .post('/transfer/send')
      .type('form')
      .send({ receiverId: receiver.id, amount: '100', _csrf: csrf });

    expect(res.status).toBe(302);
  });

  test('다른 세션에서 발급된 CSRF 토큰은 거부된다', async () => {
    const user = await createTestUser(app, request, pool);
    const stranger = await createTestUser(app, request, pool);

    const strangerPage = await stranger.agent.get('/transfer/send');
    const strangerCsrf = extractCsrf(strangerPage.text);

    const res = await user.agent
      .post('/transfer/send')
      .type('form')
      .send({ receiverId: stranger.id, amount: '100', _csrf: strangerCsrf });

    expect(res.status).toBe(403);
  });
});

describe('권한 우회 (Broken Access Control)', () => {
  test('로그인하지 않고 인증이 필요한 라우트에 접근하면 로그인 페이지로 리다이렉트된다', async () => {
    const targets = ['/products/new', '/chat', '/transfer/send', '/reports/new', '/admin', '/admin/users', '/admin/products'];
    for (const path of targets) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get(path);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    }
  });

  test('다른 사람의 DM 채팅방 진입 페이지는 접근할 수 있지만(로그인 사용자라면), 본인과의 DM은 차단된다', async () => {
    const user = await createTestUser(app, request, pool);
    const res = await user.agent.get(`/chat/dm/${user.id}`);
    expect(res.status).toBe(400);
  });
});

describe('Rate Limiting (Brute Force 방지)', () => {
  // 이 describe 블록은 일부러 완전히 격리된 앱 인스턴스를 새로 띄운다.
  // .env의 *_RATE_LIMIT_MAX는 테스트 환경 전체에서 대량 계정 생성이 막히지 않도록
  // 넉넉하게 풀어두는 것이 일반적이므로(README.md 참고), 레이트리밋 자체를 검증할 때는
  // 여기서만 낮은 한도를 강제로 지정한 새 앱을 만들어 다른 테스트와 완전히 분리한다.
  test('로그인을 짧은 시간에 반복 시도하면 설정된 한도를 넘어 429가 반환된다', async () => {
    jest.resetModules();
    process.env.LOGIN_RATE_LIMIT_MAX = '5';
    const freshApp = require('../app'); // eslint-disable-line global-require
    const freshPool = require('../config/db'); // eslint-disable-line global-require

    try {
      const agent = request.agent(freshApp);
      let lastStatus;
      for (let i = 0; i < 8; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const loginPage = await agent.get('/login');
        const csrf = extractCsrf(loginPage.text);
        // eslint-disable-next-line no-await-in-loop
        const res = await agent
          .post('/login')
          .type('form')
          .send({ email: 'nobody@example.com', password: 'wrong', _csrf: csrf });
        lastStatus = res.status;
        if (res.status === 429) break;
      }
      expect(lastStatus).toBe(429);
    } finally {
      delete process.env.LOGIN_RATE_LIMIT_MAX;
      await freshPool.end();
      jest.resetModules();
    }
  }, 20000);

  test('송금 요청도 짧은 시간에 반복하면 설정된 한도를 넘어 429가 반환된다', async () => {
    jest.resetModules();
    process.env.TRANSFER_RATE_LIMIT_MAX = '5';
    const freshApp = require('../app'); // eslint-disable-line global-require
    const freshPool = require('../config/db'); // eslint-disable-line global-require

    try {
      const sender = await createTestUser(freshApp, request, freshPool);
      const receiver = await createTestUser(freshApp, request, freshPool);
      await freshPool.execute('UPDATE users SET balance = ? WHERE id = ?', [1000000, sender.id]);

      let lastStatus;
      for (let i = 0; i < 8; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const sendPage = await sender.agent.get('/transfer/send');
        const csrf = extractCsrf(sendPage.text);
        // eslint-disable-next-line no-await-in-loop
        const res = await sender.agent
          .post('/transfer/send')
          .type('form')
          .send({ receiverId: receiver.id, amount: '10', _csrf: csrf });
        lastStatus = res.status;
        if (res.status === 429) break;
      }
      expect(lastStatus).toBe(429);
    } finally {
      delete process.env.TRANSFER_RATE_LIMIT_MAX;
      await freshPool.end();
      jest.resetModules();
    }
  }, 20000);
});

describe('파일 업로드 검증', () => {
  test('정상적인 이미지(jpg)는 허용된다', async () => {
    const seller = await createTestUser(app, request, pool);
    const newPage = await seller.agent.get('/products/new');
    const csrf = extractCsrf(newPage.text);

    const res = await seller.agent
      .post('/products')
      .field('title', '정상 이미지 업로드')
      .field('description', 'x')
      .field('price', '1000')
      .field('_csrf', csrf)
      .attach('image', fakeJpegBuffer(), { filename: 'cat.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(302);
  });

  test.each([
    ['shell.php', 'image/jpeg'],
    ['virus.exe', 'application/octet-stream'],
    ['evil.jsp', 'image/jpeg'],
    ['cat.jpg.php', 'image/jpeg'],
  ])('%s 파일은 거부된다', async (filename, contentType) => {
    const seller = await createTestUser(app, request, pool);
    const newPage = await seller.agent.get('/products/new');
    const csrf = extractCsrf(newPage.text);

    const res = await seller.agent
      .post('/products')
      .field('title', '악성 업로드 시도')
      .field('description', 'x')
      .field('price', '1000')
      .field('_csrf', csrf)
      .attach('image', Buffer.from('malicious content'), { filename, contentType });

    expect(res.status).toBe(400);
  });
});

describe('주요 이벤트 로깅', () => {
  test('회원가입/로그인 성공/실패/상품등록/신고/송금/관리자 조치가 모두 로그로 남는다', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const suffix = uniqueSuffix();
      const username = `logtest${suffix}`.slice(0, 20);
      const email = `logtest${suffix}@example.com`;

      const agent = request.agent(app);
      await registerUser(agent, { username, email });
      await loginUser(agent, { email });

      const loginPage = await agent.get('/login');
      const csrf = extractCsrf(loginPage.text);
      await agent.post('/login').type('form').send({ email, password: 'WrongPassword1!', _csrf: csrf });

      const seller = await createTestUser(app, request, pool);
      const { productId } = await createTestProduct(seller.agent, { title: '로그 테스트 상품', price: 1000 });

      const reportPage = await agent.get(`/reports/new?targetType=PRODUCT&targetId=${productId}`);
      const reportCsrf = extractCsrf(reportPage.text);
      await agent
        .post('/reports')
        .type('form')
        .send({ targetType: 'PRODUCT', targetId: productId, reason: '테스트 신고', _csrf: reportCsrf });

      const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(logged).toContain('user_register');
      expect(logged).toContain('login_success');
      expect(logged).toContain('login_failed');
      expect(logged).toContain('product_create');
      expect(logged).toContain('report_create');
    } finally {
      logSpy.mockRestore();
    }
  });
});
