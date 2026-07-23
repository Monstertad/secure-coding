// users 테이블 접근 계층
// - 모든 쿼리는 Prepared Statement로 작성 (SQL Injection 방지)

const pool = require('../config/db');

async function createUser({ username, email, passwordHash }) {
  const [result] = await pool.execute(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
    [username, email, passwordHash]
  );
  return result.insertId;
}

async function findByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id, username, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function findByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT id, username, email, password_hash, role, status FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, username, email, bio, role, status, balance, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function updateStatus(id, status) {
  await pool.execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
}

async function findAll({ limit, offset }) {
  const [rows] = await pool.query(
    'SELECT id, username, email, role, status, balance, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  return rows;
}

async function countAll() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM users');
  return rows[0].total;
}

module.exports = {
  createUser,
  findByEmail,
  findByUsername,
  findById,
  updateStatus,
  findAll,
  countAll,
};
