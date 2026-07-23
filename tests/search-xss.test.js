// 검색창 Reflected XSS 테스트
// - 상품 검색(/products?q=)과 회원 조회 검색(/users?q=)은 입력한 검색어를 검색창(input value)에
//   그대로 되돌려 보여준다(views/products/list.ejs, views/users/users.ejs의 value="<%= keyword %>").
//   EJS <%= %>의 자동 이스케이프가 없다면 속성 탈출(attribute breakout)을 통한
//   Reflected XSS로 이어질 수 있으므로, 실제로 안전하게 이스케이프되어 출력되는지 확인한다.

const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const { createTestUser } = require('./helpers');

afterAll(async () => {
  await pool.end();
});

describe('Reflected XSS - 상품 검색 (/products?q=)', () => {
  test('검색어에 <script> 태그를 넣어도 실행 가능한 형태로 반영되지 않는다', async () => {
    const res = await request(app).get('/products?q=' + encodeURIComponent('<script>alert(1)</script>'));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('검색어로 속성값 탈출(")을 시도해도 이스케이프되어 속성 밖으로 빠져나가지 못한다', async () => {
    const payload = '"><script>alert(1)</script>';
    const res = await request(app).get('/products?q=' + encodeURIComponent(payload));

    expect(res.status).toBe(200);
    // "> 가 이스케이프 없이 그대로 반영됐다면 value="...">에서 속성이 조기 종료되고
    // 뒤따르는 <script> 태그가 실제 DOM에 살아있게 된다.
    expect(res.text).not.toContain(payload);
    expect(res.text).toContain('&#34;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('Reflected XSS - 회원 조회 검색 (/users?q=)', () => {
  test('검색어에 <script> 태그를 넣어도 실행 가능한 형태로 반영되지 않는다', async () => {
    const user = await createTestUser(app, request, pool);
    const res = await user.agent.get('/users?q=' + encodeURIComponent('<script>alert(1)</script>'));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('검색어로 속성값 탈출(")을 시도해도 이스케이프되어 속성 밖으로 빠져나가지 못한다', async () => {
    const user = await createTestUser(app, request, pool);
    const payload = '"><img src=x onerror=alert(1)>';
    const res = await user.agent.get('/users?q=' + encodeURIComponent(payload));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain(payload);
    expect(res.text).toContain('&#34;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });
});
