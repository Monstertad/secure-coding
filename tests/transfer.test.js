// 송금/구매 관련 테스트
// - 정상 흐름, 잔액/자기송금/음수금액/존재하지 않는 대상 검증
// - [핵심] 동시 구매 경쟁 상태(Race Condition) 방지 검증
// - [핵심] 트랜잭션 중간 오류 발생 시 롤백(Atomicity) 검증

const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const transferModel = require('../models/transferModel');
const { extractCsrf, createTestUser, createTestProduct } = require('./helpers');

afterAll(async () => {
  await pool.end();
});

async function getBalance(userId) {
  const [rows] = await pool.query('SELECT balance FROM users WHERE id = ?', [userId]);
  return Number(rows[0].balance);
}

async function setBalance(userId, amount) {
  await pool.execute('UPDATE users SET balance = ? WHERE id = ?', [amount, userId]);
}

describe('상품 구매', () => {
  test('정상적으로 구매하면 잔액이 이동하고 상품이 SOLD로 변경된다', async () => {
    const seller = await createTestUser(app, request, pool);
    const buyer = await createTestUser(app, request, pool);
    await setBalance(buyer.id, 100000);

    const { productId } = await createTestProduct(seller.agent, { title: '구매테스트 상품', price: 15000 });
    const sellerBefore = await getBalance(seller.id);
    const buyerBefore = await getBalance(buyer.id);

    const detail = await buyer.agent.get(`/products/${productId}`);
    const csrf = extractCsrf(detail.text);
    const res = await buyer.agent.post(`/transfer/products/${productId}/purchase`).type('form').send({ _csrf: csrf });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/products/${productId}?purchased=1`);
    expect(await getBalance(seller.id)).toBe(sellerBefore + 15000);
    expect(await getBalance(buyer.id)).toBe(buyerBefore - 15000);

    const afterDetail = await request(app).get(`/products/${productId}`);
    expect(afterDetail.text).toContain('판매완료');
  });

  test('이미 판매된 상품은 다시 구매할 수 없다', async () => {
    const seller = await createTestUser(app, request, pool);
    const buyer1 = await createTestUser(app, request, pool);
    const buyer2 = await createTestUser(app, request, pool);
    await setBalance(buyer1.id, 100000);
    await setBalance(buyer2.id, 100000);

    const { productId } = await createTestProduct(seller.agent, { title: '재구매 방지 테스트', price: 5000 });

    const detail1 = await buyer1.agent.get(`/products/${productId}`);
    const firstBuy = await buyer1.agent
      .post(`/transfer/products/${productId}/purchase`)
      .type('form')
      .send({ _csrf: extractCsrf(detail1.text) });
    expect(firstBuy.status).toBe(302);

    const detail2 = await buyer2.agent.get(`/products/${productId}`);
    const secondBuy = await buyer2.agent
      .post(`/transfer/products/${productId}/purchase`)
      .type('form')
      .send({ _csrf: extractCsrf(detail2.text) });
    expect(secondBuy.status).toBe(400);
    expect(secondBuy.text).toContain('이미 판매');
  });

  test('본인이 등록한 상품은 구매할 수 없다', async () => {
    const seller = await createTestUser(app, request, pool);
    const { productId } = await createTestProduct(seller.agent, { title: '자기구매 방지 테스트', price: 1000 });

    const detail = await seller.agent.get(`/products/${productId}`);
    const csrf = extractCsrf(detail.text);
    const res = await seller.agent.post(`/transfer/products/${productId}/purchase`).type('form').send({ _csrf: csrf });

    expect(res.status).toBe(400);
    expect(res.text).toContain('본인이 등록한');
  });

  test('잔액이 부족하면 구매할 수 없고, 잔액도 변하지 않는다', async () => {
    const seller = await createTestUser(app, request, pool);
    const buyer = await createTestUser(app, request, pool); // 기본 잔액 0
    const { productId } = await createTestProduct(seller.agent, { title: '고가 상품', price: 50000 });

    const balanceBefore = await getBalance(buyer.id);
    const detail = await buyer.agent.get(`/products/${productId}`);
    const csrf = extractCsrf(detail.text);
    const res = await buyer.agent.post(`/transfer/products/${productId}/purchase`).type('form').send({ _csrf: csrf });

    expect(res.status).toBe(400);
    expect(res.text).toContain('잔액이 부족');
    expect(await getBalance(buyer.id)).toBe(balanceBefore);
  });

  test('[Race Condition] 두 사용자가 동시에 같은 상품을 구매하면 정확히 한 명만 성공한다', async () => {
    const seller = await createTestUser(app, request, pool);
    const buyerA = await createTestUser(app, request, pool);
    const buyerB = await createTestUser(app, request, pool);
    await setBalance(buyerA.id, 100000);
    await setBalance(buyerB.id, 100000);

    const { productId } = await createTestProduct(seller.agent, { title: '한정판 동시구매 테스트', price: 10000 });

    const [detailA, detailB] = await Promise.all([
      buyerA.agent.get(`/products/${productId}`),
      buyerB.agent.get(`/products/${productId}`),
    ]);
    const csrfA = extractCsrf(detailA.text);
    const csrfB = extractCsrf(detailB.text);

    const sellerBefore = await getBalance(seller.id);
    const buyerABefore = await getBalance(buyerA.id);
    const buyerBBefore = await getBalance(buyerB.id);

    // 실제로 동시에 요청을 보낸다 (순차 실행이 아님)
    const [resA, resB] = await Promise.all([
      buyerA.agent.post(`/transfer/products/${productId}/purchase`).type('form').send({ _csrf: csrfA }),
      buyerB.agent.post(`/transfer/products/${productId}/purchase`).type('form').send({ _csrf: csrfB }),
    ]);

    // 보고서/시연용 캡처 로그
    // eslint-disable-next-line no-console
    console.log(
      '[Concurrent Purchase Test] ' +
        `Attempt A: ${resA.status === 302 ? 'SUCCESS' : `REJECTED(${resA.status})`}, ` +
        `Attempt B: ${resB.status === 302 ? 'SUCCESS' : `REJECTED(${resB.status})`}`
    );

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([302, 400]); // 정확히 하나는 성공(302), 하나는 거부(400)

    const sellerAfter = await getBalance(seller.id);
    const buyerAAfter = await getBalance(buyerA.id);
    const buyerBAfter = await getBalance(buyerB.id);

    expect(sellerAfter - sellerBefore).toBe(10000); // 판매자는 정확히 1건분만 입금
    const totalDeducted = buyerABefore - buyerAAfter + (buyerBBefore - buyerBAfter);
    expect(totalDeducted).toBe(10000); // 구매자 쪽 차감 합계도 정확히 1건분 (이중 지불 없음)

    const [transferRows] = await pool.query('SELECT COUNT(*) AS cnt FROM transfers WHERE product_id = ?', [
      productId,
    ]);
    expect(transferRows[0].cnt).toBe(1); // 거래 기록도 정확히 1건만 생성됨

    console.log(
      `[Concurrent Purchase Test] Seller Balance +${sellerAfter - sellerBefore}, ` +
        `Total Buyer Deduction -${totalDeducted}, Transfer Records: ${transferRows[0].cnt}`
    );
  }, 20000);
});

describe('일반 송금', () => {
  test('정상적으로 송금하면 양쪽 잔액이 정확히 이동한다', async () => {
    const sender = await createTestUser(app, request, pool);
    const receiver = await createTestUser(app, request, pool);
    await setBalance(sender.id, 50000);

    const sendPage = await sender.agent.get('/transfer/send');
    const csrf = extractCsrf(sendPage.text);
    const res = await sender.agent
      .post('/transfer/send')
      .type('form')
      .send({ receiverId: receiver.id, amount: '10000', _csrf: csrf });

    expect(res.status).toBe(302);
    expect(await getBalance(sender.id)).toBe(40000);
    expect(await getBalance(receiver.id)).toBe(10000);

    const history = await sender.agent.get('/transfer/history');
    expect(history.text).toContain('10,000원');
  });

  test('본인에게는 송금할 수 없다', async () => {
    const user = await createTestUser(app, request, pool);
    await setBalance(user.id, 50000);

    const sendPage = await user.agent.get('/transfer/send');
    const csrf = extractCsrf(sendPage.text);
    const res = await user.agent
      .post('/transfer/send')
      .type('form')
      .send({ receiverId: user.id, amount: '100', _csrf: csrf });

    expect(res.status).toBe(400);
    expect(res.text).toContain('본인에게는');
  });

  test('존재하지 않는 사용자에게는 송금할 수 없다', async () => {
    const sender = await createTestUser(app, request, pool);
    await setBalance(sender.id, 50000);

    const sendPage = await sender.agent.get('/transfer/send');
    const csrf = extractCsrf(sendPage.text);
    const res = await sender.agent
      .post('/transfer/send')
      .type('form')
      .send({ receiverId: 999999999, amount: '100', _csrf: csrf });

    expect(res.status).toBe(404);
  });

  test('0 이하 또는 음수 금액은 거부된다', async () => {
    const sender = await createTestUser(app, request, pool);
    const receiver = await createTestUser(app, request, pool);
    await setBalance(sender.id, 50000);

    const sendPage = await sender.agent.get('/transfer/send');
    const csrf = extractCsrf(sendPage.text);
    const res = await sender.agent
      .post('/transfer/send')
      .type('form')
      .send({ receiverId: receiver.id, amount: '-100', _csrf: csrf });

    expect(res.status).toBe(400);
    expect(await getBalance(sender.id)).toBe(50000); // 잔액 변화 없음
  });

  test('보유 잔액보다 큰 금액은 송금할 수 없다', async () => {
    const sender = await createTestUser(app, request, pool);
    const receiver = await createTestUser(app, request, pool);
    await setBalance(sender.id, 1000);

    const sendPage = await sender.agent.get('/transfer/send');
    const csrf = extractCsrf(sendPage.text);
    const res = await sender.agent
      .post('/transfer/send')
      .type('form')
      .send({ receiverId: receiver.id, amount: '5000', _csrf: csrf });

    expect(res.status).toBe(400);
    expect(res.text).toContain('잔액이 부족');
  });
});

describe('[Atomicity] 트랜잭션 롤백', () => {
  test('송금 처리 중간(거래 기록 저장 직전)에 오류가 발생하면 전체가 롤백되어 잔액이 원상복구된다', async () => {
    const sender = await createTestUser(app, request, pool);
    const receiver = await createTestUser(app, request, pool);
    await setBalance(sender.id, 20000);

    const senderBefore = await getBalance(sender.id);
    const receiverBefore = await getBalance(receiver.id);

    // 실제 커넥션을 하나 빌려와서 "INSERT INTO transfers" 구문에서만 강제로 실패하도록 만든다.
    // beginTransaction/UPDATE(잔액 차감·입금)/rollback은 전부 실제로 수행되므로,
    // "커밋 직전에 실패"하는 상황을 그대로 재현해 실제 롤백 여부를 검증할 수 있다.
    const realConn = await pool.getConnection();
    const originalQuery = realConn.query.bind(realConn);
    const querySpy = jest.spyOn(realConn, 'query').mockImplementation((sql, params) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO transfers')) {
        throw new Error('강제 오류 (Atomicity 테스트)');
      }
      return originalQuery(sql, params);
    });
    const getConnectionSpy = jest.spyOn(pool, 'getConnection').mockResolvedValueOnce(realConn);

    await expect(
      transferModel.sendPoints({ senderId: sender.id, receiverId: receiver.id, amount: '5000.00' })
    ).rejects.toThrow('강제 오류');

    querySpy.mockRestore();
    getConnectionSpy.mockRestore();
    // realConn은 transferModel.sendPoints의 finally 블록에서 이미 release()되었다.

    expect(await getBalance(sender.id)).toBe(senderBefore); // 차감이 롤백되어 원래대로
    expect(await getBalance(receiver.id)).toBe(receiverBefore); // 입금도 반영되지 않음

    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM transfers WHERE sender_id = ? AND receiver_id = ?', [
      sender.id,
      receiver.id,
    ]);
    expect(rows[0].cnt).toBe(0); // 거래 기록도 남지 않음

    console.log(
      `[Atomicity Test] BEGIN -> balance UPDATE x2 -> INSERT FAILED -> ROLLBACK. ` +
        `Sender balance restored to ${senderBefore}, Receiver balance restored to ${receiverBefore}, Transfer rows: 0`
    );
  });
});
