// 암호화 관련 유틸
// - bcrypt 비밀번호 해시/비교 함수 래핑

const bcrypt = require('bcrypt');

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

/**
 * 평문 비밀번호를 bcrypt 해시로 변환한다.
 * bcrypt는 salt를 자체적으로 생성/포함하므로 별도의 salt 컬럼이 필요 없다.
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * 평문 비밀번호와 저장된 해시를 비교한다. (상수 시간 비교는 bcrypt 내부에서 처리)
 */
async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, comparePassword };
