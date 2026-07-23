// reports 테이블 접근 계층
// - 모든 쿼리는 Prepared Statement로 작성 (SQL Injection 방지)

const pool = require('../config/db');

async function insertReport({ reporterId, targetType, targetId, reason }) {
  const [result] = await pool.execute(
    'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)',
    [reporterId, targetType, targetId, reason]
  );
  return result.insertId;
}

async function findByReporter(reporterId) {
  const [rows] = await pool.execute(
    'SELECT id, target_type, target_id, reason, status, created_at FROM reports WHERE reporter_id = ? ORDER BY created_at DESC',
    [reporterId]
  );
  return rows;
}

async function findPending(limit) {
  const [rows] = await pool.query(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at, u.username AS reporter_username
     FROM reports r
     JOIN users u ON u.id = r.reporter_id
     WHERE r.status = 'WAITING'
     ORDER BY r.created_at ASC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, reporter_id, target_type, target_id, reason, status, created_at FROM reports WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function updateStatus(id, status) {
  await pool.execute('UPDATE reports SET status = ? WHERE id = ?', [status, id]);
}

module.exports = { insertReport, findByReporter, findPending, findById, updateStatus };
