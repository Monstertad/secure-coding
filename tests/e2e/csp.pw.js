// CSP(Content-Security-Policy) 브라우저 레벨 테스트 (Playwright)
// - jest/supertest(tests/*.test.js)는 응답 헤더 문자열과 렌더링된 HTML만 확인할 수 있어,
//   "실제 브라우저가 CSP를 인지해 인라인 스크립트를 차단하고, 그 결과로 채팅 기능
//   자체가 멈추지는 않는지"까지는 검증하지 못한다.
// - 이 테스트는 실제 Chromium으로 회원가입 -> 로그인 -> 전체 채팅방 진입까지 그대로 수행하며,
//   (1) script-src에 unsafe-inline이 없는지, (2) 브라우저에서 CSP 위반
//   (securitypolicyviolation)이 실제로 발생하지 않는지, (3) 외부 스크립트(/js/chat.js)가
//   정상 실행되어 socket.io 채팅이 실제로 동작하는지까지 한 번에 확인한다.
//
// 실행 방법 (이 저장소에는 기본 설치되어 있지 않음):
//   npm install -D @playwright/test
//   npx playwright install chromium
//   npx playwright test
//
// tests/*.test.js와 달리 DB는 실제 config/db.js 풀을 그대로 사용하므로,
// jest 테스트와 동일하게 .env에 설정된 실제 MySQL에 연결 가능한 상태에서 실행해야 한다.

const http = require('http');
const { test, expect } = require('@playwright/test');

const app = require('../../app');
const pool = require('../../config/db');
const { sessionMiddleware } = require('../../config/session');
const { initChatSocket } = require('../../sockets/chat');

let server;
let baseURL;

test.beforeAll(async () => {
  // helmet의 CSP는 app.js 미들웨어에서 적용되지만, socket.io는 server.js에서만
  // http 서버에 바인딩되므로 실제 배포 구조와 동일하게 직접 서버를 띄운다.
  server = http.createServer(app);
  initChatSocket(server, sessionMiddleware);
  await new Promise((resolve) => server.listen(0, resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function uniqueSuffix() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

test('전체 채팅방 페이지는 CSP 위반 없이 외부 스크립트가 실행되고, script-src에 unsafe-inline이 없다', async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `pwtest${suffix}@example.com`;
  const password = 'PlaywrightTest1!';

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // 브라우저가 CSP 위반을 감지하면 발생시키는 DOM 이벤트를, 어떤 스크립트보다도 먼저 구독해둔다.
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`);
    });
  });

  await page.goto(`${baseURL}/register`);
  await page.fill('#username', `pwtest${suffix}`.slice(0, 20));
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#passwordConfirm', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/login/);

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${baseURL}/`);

  let chatPageCsp = null;
  page.on('response', (res) => {
    if (res.url() === `${baseURL}/chat`) chatPageCsp = res.headers()['content-security-policy'];
  });

  await page.goto(`${baseURL}/chat`);
  await page.waitForSelector('#chat-form');

  // 실제 socket.io 연결 및 메시지 송수신까지 확인해, 예전에 있었던 "인라인 스크립트가
  // CSP에 막혀 채팅 자체가 동작하지 않는" 문제가 재발하지 않았는지 함께 검증한다.
  const messageText = `안녕하세요 ${suffix}`;
  await page.fill('#chat-input', messageText);
  await page.click('#chat-form button[type="submit"]');
  await expect(page.locator('#chat-messages')).toContainText(messageText, { timeout: 5000 });

  const violations = await page.evaluate(() => window.__cspViolations);
  expect(violations).toEqual([]);

  const cspRelatedConsoleErrors = consoleErrors.filter((msg) => /content security policy|refused to/i.test(msg));
  expect(cspRelatedConsoleErrors).toEqual([]);

  expect(chatPageCsp).toBeTruthy();
  const scriptSrcDirective = chatPageCsp.split(';').find((d) => d.trim().startsWith('script-src '));
  expect(scriptSrcDirective).toBeTruthy();
  expect(scriptSrcDirective).not.toContain('unsafe-inline');
  expect(chatPageCsp).toContain("script-src-attr 'none'");
});
