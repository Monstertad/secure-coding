// transfers 테이블 접근 계층
// - 잔액 검증, 커밋/롤백을 포함한 원자적(atomic) 송금 트랜잭션 처리
// - 모든 쿼리는 Prepared Statement로 작성 (SQL Injection 방지)

const pool = require('../config/db');

class TransferError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TransferError';
    this.code = code;
  }
}

// 두 사용자 row를 잠글 때 항상 id 오름차순으로 잠근다.
// 잠금 순서를 고정하지 않으면 A->B, B->A 송금이 동시에 일어날 때 서로 다른 순서로
// 잠금을 시도하며 교착 상태(Deadlock)에 빠질 수 있다.
function lockOrder(idA, idB) {
  return [idA, idB].sort((a, b) => a - b);
}

// 상품 구매: 상품/구매자/판매자 row를 SELECT ... FOR UPDATE로 잠근 뒤,
// DB에 저장된 가격·판매자 정보만 신뢰해서 송금 금액을 결정한다.
// (클라이언트가 보낸 금액이나 seller id는 절대 사용하지 않는다 - 가격 조작 방지)
async function purchaseProduct({ buyerId, productId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [productRows] = await conn.query(
      'SELECT id, seller_id, price, status FROM products WHERE id = ? FOR UPDATE',
      [productId]
    );
    const product = productRows[0];
    if (!product) throw new TransferError('PRODUCT_NOT_FOUND', '상품을 찾을 수 없습니다.');
    if (product.status !== 'SALE') {
      throw new TransferError('PRODUCT_NOT_AVAILABLE', '이미 판매되었거나 삭제된 상품입니다.');
    }
    if (product.seller_id === buyerId) {
      throw new TransferError('SELF_PURCHASE', '본인이 등록한 상품은 구매할 수 없습니다.');
    }

    const sellerId = product.seller_id;
    const amount = product.price;

    const [userRows] = await conn.query(
      'SELECT id, balance FROM users WHERE id IN (?, ?) FOR UPDATE',
      lockOrder(buyerId, sellerId)
    );
    const buyer = userRows.find((u) => u.id === buyerId);
    if (!buyer) throw new TransferError('BUYER_NOT_FOUND', '구매자 정보를 찾을 수 없습니다.');
    if (Number(buyer.balance) < Number(amount)) {
      throw new TransferError('INSUFFICIENT_BALANCE', '잔액이 부족합니다.');
    }

    await conn.query('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, buyerId]);
    await conn.query('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, sellerId]);

    const [updateResult] = await conn.query(
      "UPDATE products SET status = 'SOLD' WHERE id = ? AND status = 'SALE'",
      [productId]
    );
    if (updateResult.affectedRows === 0) {
      // FOR UPDATE로 이미 잠갔으므로 정상적으로는 도달하지 않지만, 방어적으로 재확인한다.
      throw new TransferError('PRODUCT_NOT_AVAILABLE', '이미 판매되었거나 삭제된 상품입니다.');
    }

    const [insertResult] = await conn.query(
      'INSERT INTO transfers (sender_id, receiver_id, amount, product_id) VALUES (?, ?, ?, ?)',
      [buyerId, sellerId, amount, productId]
    );

    await conn.commit();
    return { transferId: insertResult.insertId, amount, sellerId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// 상품과 무관한 일반 포인트 송금
async function sendPoints({ senderId, receiverId, amount }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [userRows] = await conn.query(
      'SELECT id, balance FROM users WHERE id IN (?, ?) FOR UPDATE',
      lockOrder(senderId, receiverId)
    );
    const sender = userRows.find((u) => u.id === senderId);
    const receiver = userRows.find((u) => u.id === receiverId);
    if (!sender) throw new TransferError('SENDER_NOT_FOUND', '보내는 사람 정보를 찾을 수 없습니다.');
    if (!receiver) throw new TransferError('RECEIVER_NOT_FOUND', '받는 사람을 찾을 수 없습니다.');
    if (Number(sender.balance) < Number(amount)) {
      throw new TransferError('INSUFFICIENT_BALANCE', '잔액이 부족합니다.');
    }

    await conn.query('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, senderId]);
    await conn.query('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, receiverId]);

    const [insertResult] = await conn.query(
      'INSERT INTO transfers (sender_id, receiver_id, amount, product_id) VALUES (?, ?, ?, NULL)',
      [senderId, receiverId, amount]
    );

    await conn.commit();
    return insertResult.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function findHistoryForUser(userId, limit) {
  const [rows] = await pool.query(
    `SELECT t.id, t.sender_id, su.username AS sender_username,
            t.receiver_id, ru.username AS receiver_username,
            t.amount, t.product_id, t.created_at
     FROM transfers t
     JOIN users su ON su.id = t.sender_id
     JOIN users ru ON ru.id = t.receiver_id
     WHERE t.sender_id = ? OR t.receiver_id = ?
     ORDER BY t.created_at DESC
     LIMIT ?`,
    [userId, userId, limit]
  );
  return rows;
}

module.exports = { TransferError, purchaseProduct, sendPoints, findHistoryForUser };
