// 테스트 공통 유틸
// - CSRF 토큰 추출, 고유 계정 생성, 로그인/상품 등록 헬퍼
// 실제 목적: 각 테스트 파일에서 "로그인된 사용자"를 만드는 반복 작업을 줄이고,
// 매 테스트 실행마다 고유한 계정을 생성해 이전 실행 데이터와 충돌하지 않도록 한다.

function extractCsrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

// /admin/reports 목록 페이지(HTML)에서 특정 대상(target_type/target_id)에 해당하는
// 신고 id를 찾는다. 여러 테스트/테스트 파일이 동시에 신고를 만들 수 있으므로,
// "목록의 첫 번째 항목"이 아니라 실제 대상 문자열을 기준으로 정확히 찾아야 한다.
function extractReportIdForTarget(html, targetType, targetId) {
  const markerRegex = new RegExp(`${targetType} #${targetId}(?!\\d)`);
  const markerMatch = markerRegex.exec(html);
  if (!markerMatch) return null;
  const rest = html.slice(markerMatch.index);
  const resolveMatch = rest.match(/\/admin\/reports\/(\d+)\/resolve/);
  return resolveMatch ? resolveMatch[1] : null;
}

function uniqueSuffix() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function registerUser(agent, { username, email, password = 'Abcdef123!' }) {
  const regPage = await agent.get('/register');
  const csrf = extractCsrf(regPage.text);
  return agent
    .post('/register')
    .type('form')
    .send({ username, email, password, passwordConfirm: password, _csrf: csrf });
}

async function loginUser(agent, { email, password = 'Abcdef123!', rememberMe = false }) {
  const loginPage = await agent.get('/login');
  const csrf = extractCsrf(loginPage.text);
  const payload = { email, password, _csrf: csrf };
  if (rememberMe) payload.rememberMe = '1';
  return agent.post('/login').type('form').send(payload);
}

// 회원가입 + 로그인까지 완료된 supertest agent와 사용자 정보를 반환한다.
async function createTestUser(app, request, pool, opts = {}) {
  const suffix = uniqueSuffix();
  const username = (opts.username || `user${suffix}`).slice(0, 20);
  const email = opts.email || `${username}@example.com`;
  const password = opts.password || 'Abcdef123!';

  const agent = request.agent(app);
  await registerUser(agent, { username, email, password });
  await loginUser(agent, { email, password });

  const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
  return { agent, username, email, password, id: rows[0].id };
}

// 관리자 권한으로 승격 후 세션을 갱신(재로그인)한 사용자를 반환한다.
// (세션에는 로그인 시점의 role이 저장되므로, DB에서 역할을 바꾼 뒤에는 재로그인해야 반영된다)
async function createAdminUser(app, request, pool, opts = {}) {
  const user = await createTestUser(app, request, pool, opts);
  await pool.execute("UPDATE users SET role = 'ADMIN' WHERE id = ?", [user.id]);
  await loginUser(user.agent, { email: user.email, password: user.password });
  return user;
}

// 최소한의 유효한 JPEG 매직 넘버로 시작하는 더미 이미지 버퍼
function fakeJpegBuffer() {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50, 0)]);
}

async function createTestProduct(agent, { title, price, description = '테스트 상품 설명입니다.' }) {
  const newPage = await agent.get('/products/new');
  const csrf = extractCsrf(newPage.text);
  const res = await agent
    .post('/products')
    .field('title', title)
    .field('description', description)
    .field('price', String(price))
    .field('_csrf', csrf)
    .attach('image', fakeJpegBuffer(), { filename: 'test.jpg', contentType: 'image/jpeg' });

  const productId = res.headers.location ? res.headers.location.split('/').pop() : null;
  return { res, productId };
}

module.exports = {
  extractCsrf,
  extractReportIdForTarget,
  uniqueSuffix,
  registerUser,
  loginUser,
  createTestUser,
  createAdminUser,
  createTestProduct,
  fakeJpegBuffer,
};
