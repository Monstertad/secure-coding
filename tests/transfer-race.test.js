// 일반 송금(transferService.sendPoints / transferModel.sendPoints) 동시 요청 테스트
// - [핵심] 잔액이 "정확히 1건분"만 있는 발신자가 동시에 여러 건을 보내도
//   이중 지불 없이 정확히 한 건만 성공해야 한다 (Race Condition 방지 검증).
//   transfer.test.js에는 "상품 구매(purchaseProduct)" 동시성 테스트만 있고
//   "일반 송금(sendPoints)" 동시성 테스트가 없어 이 파일에서 별도로 검증한다.

const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const { extractCsrf, createTestUser } = require('./helpers');

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

describe('[Race Condition] 일반 송금(sendPoints) 동시 요청', () => {
  test('잔액이 1건분뿐인 발신자가 서로 다른 두 사람에게 동시에 같은 금액을 보내면 정확히 한 건만 성공한다', async () => {
    const sender = await createTestUser(app, request, pool);
    const receiverA = await createTestUser(app, request, pool);
    const receiverB = await createTestUser(app, request, pool);
    await setBalance(sender.id, 10000);

    const [pageA, pageB] = await Promise.all([sender.agent.get('/transfer/send'), sender.agent.get('/transfer/send')]);
    const csrfA = extractCsrf(pageA.text);
    const csrfB = extractCsrf(pageB.text);

    // 실제로 동시에 요청을 보낸다 (순차 실행이 아님)
    const [resA, resB] = await Promise.all([
      sender.agent.post('/transfer/send').type('form').send({ receiverId: receiverA.id, amount: '10000', _csrf: csrfA }),
      sender.agent.post('/transfer/send').type('form').send({ receiverId: receiverB.id, amount: '10000', _csrf: csrfB }),
    ]);

    // 보고서/시연용 캡처 로그
    // eslint-disable-next-line no-console
    console.log(
      '[Concurrent sendPoints Test] ' +
        `Attempt A: ${resA.status === 302 ? 'SUCCESS' : `REJECTED(${resA.status})`}, ` +
        `Attempt B: ${resB.status === 302 ? 'SUCCESS' : `REJECTED(${resB.status})`}`
    );

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([302, 400]); // 정확히 하나는 성공(302), 하나는 거부(400, 잔액 부족)

    const senderAfter = await getBalance(sender.id);
    expect(senderAfter).toBe(0); // 이중 차감 없이 정확히 1건분만 차감되어 0원

    const [transferRows] = await pool.query('SELECT COUNT(*) AS cnt FROM transfers WHERE sender_id = ?', [sender.id]);
    expect(transferRows[0].cnt).toBe(1); // 거래 기록도 정확히 1건만 생성됨

    console.log(`[Concurrent sendPoints Test] Sender Balance After: ${senderAfter}, Transfer Records: ${transferRows[0].cnt}`);
  }, 20000);

  test('같은 수신자에게 동시에 3건을 보내도 잔액은 절대 음수가 되지 않고 정확히 1건만 성공한다', async () => {
    const sender = await createTestUser(app, request, pool);
    const receiver = await createTestUser(app, request, pool);
    await setBalance(sender.id, 10000);

    const pages = await Promise.all([
      sender.agent.get('/transfer/send'),
      sender.agent.get('/transfer/send'),
      sender.agent.get('/transfer/send'),
    ]);
    const csrfTokens = pages.map((p) => extractCsrf(p.text));

    const results = await Promise.all(
      csrfTokens.map((csrf) =>
        sender.agent
          .post('/transfer/send')
          .type('form')
          .send({ receiverId: receiver.id, amount: '10000', _csrf: csrf })
      )
    );

    const successCount = results.filter((r) => r.status === 302).length;
    const rejectedCount = results.filter((r) => r.status === 400).length;
    expect(successCount).toBe(1);
    expect(rejectedCount).toBe(2);

    const senderAfter = await getBalance(sender.id);
    expect(senderAfter).toBeGreaterThanOrEqual(0); // DB CHECK 제약(chk_users_balance_non_negative)과 무관하게 음수가 되면 안 됨
    expect(senderAfter).toBe(0);

    const receiverAfter = await getBalance(receiver.id);
    expect(receiverAfter).toBe(10000); // 수신자는 정확히 1건분만 입금받음

    const [transferRows] = await pool.query('SELECT COUNT(*) AS cnt FROM transfers WHERE sender_id = ?', [sender.id]);
    expect(transferRows[0].cnt).toBe(1);
  }, 20000);
});
