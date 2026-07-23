// products 테이블 접근 계층
// - 모든 쿼리는 Prepared Statement/파라미터 바인딩으로만 작성 (SQL Injection 방지)

const pool = require('../config/db');

const LIST_COLUMNS = 'id, title, price, image, seller_id, status, created_at';
const DETAIL_COLUMNS = 'id, title, description, price, image, seller_id, status, created_at, updated_at';

async function insertProduct({ title, description, price, sellerId, image }) {
  const [result] = await pool.execute(
    'INSERT INTO products (title, description, price, seller_id, image) VALUES (?, ?, ?, ?, ?)',
    [title, description, price, sellerId, image]
  );
  return result.insertId;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${DETAIL_COLUMNS} FROM products WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

// 검색어의 %, _, \ 는 LIKE 와일드카드로 해석되므로 리터럴로 취급되도록 이스케이프한다.
function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function searchProducts({ keyword, minPrice, maxPrice, limit, offset }) {
  const conditions = ["status <> 'DELETED'"];
  const params = [];

  if (keyword) {
    conditions.push('(title LIKE ? OR description LIKE ?)');
    const pattern = `%${escapeLikePattern(keyword)}%`;
    params.push(pattern, pattern);
  }
  if (minPrice !== null) {
    conditions.push('price >= ?');
    params.push(minPrice);
  }
  if (maxPrice !== null) {
    conditions.push('price <= ?');
    params.push(maxPrice);
  }

  const where = conditions.join(' AND ');

  // LIMIT/OFFSET 값도 파라미터 바인딩으로 전달 (문자열 조합 금지)
  const [rows] = await pool.query(
    `SELECT ${LIST_COLUMNS} FROM products WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM products WHERE ${where}`,
    params
  );

  return { items: rows, total: countRows[0].total };
}

async function updateProduct(id, { title, description, price, image }) {
  if (image) {
    await pool.execute(
      'UPDATE products SET title = ?, description = ?, price = ?, image = ? WHERE id = ?',
      [title, description, price, image, id]
    );
  } else {
    await pool.execute(
      'UPDATE products SET title = ?, description = ?, price = ? WHERE id = ?',
      [title, description, price, id]
    );
  }
}

async function softDeleteProduct(id) {
  // 실제 DELETE 대신 논리 삭제 - FK 참조 무결성(신고/거래 이력) 보존
  await pool.execute("UPDATE products SET status = 'DELETED' WHERE id = ?", [id]);
}

// 관리자용: 상태와 무관하게(DELETED 포함) 전체 상품을 조회한다.
async function findAllForAdmin({ limit, offset }) {
  const [rows] = await pool.query(
    `SELECT p.id, p.title, p.price, p.status, p.created_at, u.username AS seller_username
     FROM products p
     JOIN users u ON u.id = p.seller_id
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows;
}

async function countAllForAdmin() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM products');
  return rows[0].total;
}

module.exports = {
  insertProduct,
  findById,
  searchProducts,
  updateProduct,
  softDeleteProduct,
  findAllForAdmin,
  countAllForAdmin,
};
