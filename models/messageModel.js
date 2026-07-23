// messages 테이블 접근 계층
// - receiver_id가 NULL이면 전체 채팅, 값이 있으면 1:1 DM 메시지
// - 모든 쿼리는 Prepared Statement로 작성 (SQL Injection 방지)

const pool = require('../config/db');

async function insertMessage({ senderId, receiverId, roomId, content }) {
  const [result] = await pool.execute(
    'INSERT INTO messages (sender_id, receiver_id, room_id, content) VALUES (?, ?, ?, ?)',
    [senderId, receiverId, roomId, content]
  );
  return result.insertId;
}

// 전체 채팅: receiver_id/room_id가 모두 NULL인 메시지만 대상으로 한다.
async function getGlobalHistory(limit) {
  const [rows] = await pool.query(
    `SELECT m.id, m.sender_id, u.username AS sender_username, m.content, m.created_at
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.room_id IS NULL AND m.receiver_id IS NULL
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows.reverse();
}

async function getDmHistory(roomId, limit) {
  const [rows] = await pool.query(
    `SELECT m.id, m.sender_id, u.username AS sender_username, m.content, m.created_at
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.room_id = ?
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [roomId, limit]
  );
  return rows.reverse();
}

module.exports = { insertMessage, getGlobalHistory, getDmHistory };
