// 인증(회원가입/로그인/로그아웃) 관련 테스트
//
// 실행 전 준비: sql/schema.sql이 적용된 MySQL을 .env가 가리키고 있어야 한다.
// (README.md "테스트 실행 방법" 참고)

const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const { extractCsrf, uniqueSuffix, registerUser, loginUser } = require('./helpers');

afterAll(async () => {
  await pool.end();
});

async function setupRegisteredUser() {
  const suffix = uniqueSuffix();
  const username = `loginuser${suffix}`.slice(0, 20);
  const email = `login${suffix}@example.com`;
  const agent = request.agent(app);
  await registerUser(agent, { username, email });
  return { username, email };
}

describe('회원가입', () => {
  test('정상적인 정보로 가입하면 로그인 페이지로 리다이렉트된다', async () => {
    const suffix = uniqueSuffix();
    const agent = request.agent(app);
    const res = await registerUser(agent, {
      username: `reguser${suffix}`.slice(0, 20),
      email: `reg${suffix}@example.com`,
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?registered=1');
  });

  test('이미 사용 중인 아이디/이메일로 가입하면 409로 거부된다', async () => {
    const suffix = uniqueSuffix();
    const username = `dupuser${suffix}`.slice(0, 20);
    const email = `dup${suffix}@example.com`;

    await registerUser(request.agent(app), { username, email });

    const res = await registerUser(request.agent(app), { username, email: `other${suffix}@example.com` });
    expect(res.status).toBe(409);
    expect(res.text).toContain('이미 사용 중');
  });

  test('비밀번호 규칙(길이/문자 조합)을 위반하면 400으로 거부된다', async () => {
    const suffix = uniqueSuffix();
    const agent = request.agent(app);
    const regPage = await agent.get('/register');
    const csrf = extractCsrf(regPage.text);

    const res = await agent.post('/register').type('form').send({
      username: `weakpw${suffix}`.slice(0, 20),
      email: `weakpw${suffix}@example.com`,
      password: 'weak',
      passwordConfirm: 'weak',
      _csrf: csrf,
    });

    expect(res.status).toBe(400);
  });

  test('아이디 형식(영문 시작, 영문/숫자/밑줄)을 위반하면 400으로 거부된다', async () => {
    const suffix = uniqueSuffix();
    const agent = request.agent(app);
    const regPage = await agent.get('/register');
    const csrf = extractCsrf(regPage.text);

    const res = await agent.post('/register').type('form').send({
      username: '1234', // 숫자로 시작 - 허용되지 않음
      email: `badname${suffix}@example.com`,
      password: 'Abcdef123!',
      passwordConfirm: 'Abcdef123!',
      _csrf: csrf,
    });

    expect(res.status).toBe(400);
  });
});

describe('로그인', () => {
  test('정상적인 이메일/비밀번호로 로그인하면 세션이 생성된다', async () => {
    const { email } = await setupRegisteredUser();
    const agent = request.agent(app);
    const res = await loginUser(agent, { email });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const home = await agent.get('/');
    expect(home.text).toContain('환영합니다');
  });

  test('비밀번호가 틀리면 401과 함께 일반적인 오류 메시지로 거부된다', async () => {
    const { email } = await setupRegisteredUser();
    const agent = request.agent(app);
    const loginPage = await agent.get('/login');
    const csrf = extractCsrf(loginPage.text);

    const res = await agent.post('/login').type('form').send({ email, password: 'WrongPass1!', _csrf: csrf });
    expect(res.status).toBe(401);
    expect(res.text).toContain('올바르지 않습니다');
  });

  test('존재하지 않는 이메일도 비밀번호 오류와 동일한 메시지로 거부된다 (계정 존재 여부 비노출)', async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get('/login');
    const csrf = extractCsrf(loginPage.text);

    const res = await agent
      .post('/login')
      .type('form')
      .send({ email: 'no-such-user@example.com', password: 'anything', _csrf: csrf });
    expect(res.status).toBe(401);
    expect(res.text).toContain('올바르지 않습니다');
  });

  test('정지(SUSPENDED)된 계정은 로그인할 수 없다', async () => {
    const { email, username } = await setupRegisteredUser();
    await pool.execute("UPDATE users SET status = 'SUSPENDED' WHERE username = ?", [username]);

    const agent = request.agent(app);
    const res = await loginUser(agent, { email });
    expect(res.status).toBe(401);
    // 정지 상태를 별도로 노출하지 않고 일반 로그인 실패와 동일한 메시지를 사용한다.
    expect(res.text).toContain('올바르지 않습니다');
  });

  test('휴면(DORMANT) 처리된 계정도 동일하게 로그인할 수 없다', async () => {
    const { email, username } = await setupRegisteredUser();
    await pool.execute("UPDATE users SET status = 'DORMANT' WHERE username = ?", [username]);

    const agent = request.agent(app);
    const res = await loginUser(agent, { email });
    expect(res.status).toBe(401);
  });

  test('"로그인 상태 유지"를 체크하면 세션 쿠키 만료시간이 훨씬 길게 설정된다', async () => {
    const { email } = await setupRegisteredUser();
    const agent = request.agent(app);
    const res = await loginUser(agent, { email, rememberMe: true });

    const setCookie = res.headers['set-cookie'][0];
    const match = setCookie.match(/Expires=([^;]+)/);
    expect(match).toBeTruthy();

    const expiresAt = new Date(match[1]).getTime();
    const remainingMs = expiresAt - Date.now();
    // 기본 세션(2시간)보다 훨씬 긴 값(최소 1일 이상)이어야 한다
    expect(remainingMs).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  test('로그아웃 후에는 인증이 필요한 페이지에 접근할 수 없다', async () => {
    const { email } = await setupRegisteredUser();
    const agent = request.agent(app);
    await loginUser(agent, { email });

    const home = await agent.get('/');
    const logoutCsrf = extractCsrf(home.text);
    const logoutRes = await agent.post('/logout').type('form').send({ _csrf: logoutCsrf });
    expect(logoutRes.status).toBe(302);
    expect(logoutRes.headers.location).toBe('/login');

    const protectedPage = await agent.get('/products/new');
    expect(protectedPage.status).toBe(302);
    expect(protectedPage.headers.location).toBe('/login');
  });
});
