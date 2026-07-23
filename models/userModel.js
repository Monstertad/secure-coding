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

async function findPasswordHashById(id) {
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? rows[0].password_hash : null;
}

async function updateBio(id, bio) {
  await pool.execute('UPDATE users SET bio = ? WHERE id = ?', [bio, id]);
}

async function updatePasswordHash(id, passwordHash) {
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
}

// 검색어의 %, _, \ 는 LIKE 와일드카드로 해석되므로 리터럴로 취급되도록 이스케이프한다.
function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// 일반 회원 조회(사용자 조회 페이지)용: 이메일/비밀번호 해시/잔액/상태 등
// 민감하거나 불필요한 정보는 절대 포함하지 않는다. 정지/휴면 계정은 노출하지 않는다.
async function searchPublic({ keyword, limit, offset }) {
  const conditions = ["status = 'ACTIVE'"];
  const params = [];

  if (keyword) {
    conditions.push('username LIKE ?');
    params.push(`%${escapeLikePattern(keyword)}%`);
  }

  const where = conditions.join(' AND ');

  const [rows] = await pool.query(
    `SELECT id, username, bio, created_at FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, params);

  return { items: rows, total: countRows[0].total };
}

module.exports = {
  createUser,
  findByEmail,
  findByUsername,
  findById,
  updateStatus,
  findAll,
  countAll,
  findPasswordHashById,
  updateBio,
  updatePasswordHash,
  searchPublic,
};
