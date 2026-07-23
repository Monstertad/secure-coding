// 상품 CRUD 관련 테스트

const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const { extractCsrf, createTestUser, createTestProduct, fakeJpegBuffer } = require('./helpers');

afterAll(async () => {
  await pool.end();
});

describe('상품 등록', () => {
  test('로그인하지 않으면 등록 페이지 접근 시 로그인 페이지로 리다이렉트된다', async () => {
    const res = await request(app).get('/products/new');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('정상적인 정보로 등록하면 상세 페이지로 리다이렉트된다', async () => {
    const seller = await createTestUser(app, request, pool);
    const { res, productId } = await createTestProduct(seller.agent, { title: '테스트 노트북', price: 100000 });

    expect(res.status).toBe(302);
    expect(productId).toBeTruthy();
    expect(res.headers.location).toBe(`/products/${productId}`);
  });

  test('허용되지 않는 확장자(.php)는 400으로 거부된다', async () => {
    const seller = await createTestUser(app, request, pool);
    const newPage = await seller.agent.get('/products/new');
    const csrf = extractCsrf(newPage.text);

    const res = await seller.agent
      .post('/products')
      .field('title', 'php 업로드 시도')
      .field('description', 'x')
      .field('price', '1000')
      .field('_csrf', csrf)
      .attach('image', Buffer.from('<?php echo 1; ?>'), { filename: 'shell.php', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });

  test('확장자/MIME은 jpg지만 실제 내용이 이미지가 아니면 거부된다 (매직바이트 검증)', async () => {
    const seller = await createTestUser(app, request, pool);
    const newPage = await seller.agent.get('/products/new');
    const csrf = extractCsrf(newPage.text);

    const res = await seller.agent
      .post('/products')
      .field('title', '위조 이미지 업로드')
      .field('description', 'x')
      .field('price', '1000')
      .field('_csrf', csrf)
      .attach('image', Buffer.from('<?php system($_GET["c"]); ?>'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain('이미지 파일 형식');
  });

  test('가격이 음수이거나 제목이 비어있으면 거부된다', async () => {
    const seller = await createTestUser(app, request, pool);
    const newPage = await seller.agent.get('/products/new');
    const csrf = extractCsrf(newPage.text);

    const res = await seller.agent
      .post('/products')
      .field('title', '')
      .field('description', 'x')
      .field('price', '-100')
      .field('_csrf', csrf)
      .attach('image', fakeJpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });
});

describe('상품 조회/검색', () => {
  test('등록한 상품이 목록과 검색 결과에 나타난다', async () => {
    const seller = await createTestUser(app, request, pool);
    const title = `키보드${Date.now()}`;
    await createTestProduct(seller.agent, { title, price: 5000 });

    const list = await request(app).get('/products');
    expect(list.text).toContain(title);

    const search = await request(app).get('/products?q=' + encodeURIComponent(title));
    expect(search.text).toContain(title);

    const miss = await request(app).get('/products?q=' + encodeURIComponent('존재하지않는검색어xyz'));
    expect(miss.text).not.toContain(title);
  });

  test('존재하지 않는 상품은 404를 반환한다', async () => {
    const res = await request(app).get('/products/999999999');
    expect(res.status).toBe(404);
  });

  test('숫자가 아닌 id로 접근하면 400을 반환한다', async () => {
    const res = await request(app).get('/products/abc');
    expect(res.status).toBe(400);
  });
});

describe('상품 수정/삭제 (소유권 검증, IDOR 방지)', () => {
  test('상품 소유자가 아니면 수정 폼 접근과 수정 요청 모두 차단된다', async () => {
    const seller = await createTestUser(app, request, pool);
    const other = await createTestUser(app, request, pool);
    const { productId } = await createTestProduct(seller.agent, { title: '수정테스트 상품', price: 1000 });

    const editFormAsOther = await other.agent.get(`/products/${productId}/edit`);
    expect(editFormAsOther.status).toBe(403);

    // "other" 자신의 유효한 CSRF 토큰으로 시도해도(CSRF 통과) 소유자 검증에서 막혀야 한다.
    const otherOwnPage = await other.agent.get(`/products/${productId}`);
    const otherCsrf = extractCsrf(otherOwnPage.text);
    const res = await other.agent
      .post(`/products/${productId}/edit`)
      .field('title', 'HACKED')
      .field('description', 'x')
      .field('price', '1')
      .field('_csrf', otherCsrf);
    expect(res.status).toBe(403);

    const detail = await request(app).get(`/products/${productId}`);
    expect(detail.text).not.toContain('HACKED');
  });

  test('상품 소유자가 아니면 삭제할 수 없다', async () => {
    const seller = await createTestUser(app, request, pool);
    const other = await createTestUser(app, request, pool);
    const { productId } = await createTestProduct(seller.agent, { title: '삭제테스트 상품', price: 1000 });

    const otherOwnPage = await other.agent.get(`/products/${productId}`);
    const otherCsrf = extractCsrf(otherOwnPage.text);
    const res = await other.agent.post(`/products/${productId}/delete`).type('form').send({ _csrf: otherCsrf });
    expect(res.status).toBe(403);

    const detail = await request(app).get(`/products/${productId}`);
    expect(detail.status).toBe(200); // 삭제되지 않고 그대로 조회됨
  });

  test('소유자는 자신의 상품을 수정/삭제할 수 있다', async () => {
    const seller = await createTestUser(app, request, pool);
    const { productId } = await createTestProduct(seller.agent, { title: '원래 제목', price: 1000 });

    const editPage = await seller.agent.get(`/products/${productId}/edit`);
    const editCsrf = extractCsrf(editPage.text);
    const updateRes = await seller.agent
      .post(`/products/${productId}/edit`)
      .field('title', '수정된 제목')
      .field('description', '수정됨')
      .field('price', '2000')
      .field('_csrf', editCsrf);
    expect(updateRes.status).toBe(302);

    const detail = await request(app).get(`/products/${productId}`);
    expect(detail.text).toContain('수정된 제목');

    const detailForDelete = await seller.agent.get(`/products/${productId}`);
    const deleteCsrf = extractCsrf(detailForDelete.text);
    const deleteRes = await seller.agent
      .post(`/products/${productId}/delete`)
      .type('form')
      .send({ _csrf: deleteCsrf });
    expect(deleteRes.status).toBe(302);

    const afterDelete = await request(app).get(`/products/${productId}`);
    expect(afterDelete.status).toBe(404);

    const list = await request(app).get('/products');
    expect(list.text).not.toContain('수정된 제목');
  });
});
