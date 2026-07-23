// MySQL(MariaDB) 커넥션 풀 설정
// - mysql2/promise 기반 pool 생성
// - 모든 쿼리는 Prepared Statement(파라미터 바인딩)로만 실행되도록 강제
// - SQL Injection 방지의 핵심 지점
//
// 주의: 이 모듈이 로드되는 시점에는 process.env가 이미 채워져 있어야 한다.
//       (dotenv 로딩은 app.js 최상단에서 한 번만 수행)

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // 커넥션 문자열 조립이 아닌 파라미터 바인딩만 사용하므로 SQL Injection 여지가 없다.
  // (모든 모델 계층 쿼리는 pool.execute(sql, params) 형태로만 작성할 것)
});

module.exports = pool;
