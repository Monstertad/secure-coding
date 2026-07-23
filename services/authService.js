// 인증 관련 비즈니스 로직
// - bcrypt를 이용한 비밀번호 검증/해시 생성
// - 로그인 성공/실패 이력 기록(utils/logger.js 사용)

const userModel = require('../models/userModel');
const { hashPassword, comparePassword } = require('../utils/crypto');
const { normalizeInput } = require('../utils/sanitizer');
const { logEvent } = require('../utils/logger');

// 존재하지 않는 계정으로 로그인 시도할 때도 동일한 연산 비용(bcrypt 비교)을 지불하게 하여,
// 응답 시간 차이로 "가입된 이메일인지 여부"가 드러나는 타이밍 사이드채널을 막기 위한 더미 해시.
// (실제 사용자 비밀번호와는 무관한, 미리 생성해 둔 값)
const DUMMY_HASH = '$2b$12$lhycBolxk8WKWTXdLgx0GuHOTS65WtVVyoWEmXSdPmCdDa6JdW1N6';

const GENERIC_LOGIN_ERROR = '아이디(이메일) 또는 비밀번호가 올바르지 않습니다.';
const DUPLICATE_ACCOUNT_ERROR = '이미 사용 중인 아이디 또는 이메일입니다.';

class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}

async function registerUser({ username, email, password }) {
  const normalizedUsername = normalizeInput(username);
  const normalizedEmail = normalizeInput(email).toLowerCase();

  // 사전 중복 체크 (UX용) - 최종 방어는 DB unique 제약 + 아래 catch의 ER_DUP_ENTRY
  const [existingByEmail, existingByUsername] = await Promise.all([
    userModel.findByEmail(normalizedEmail),
    userModel.findByUsername(normalizedUsername),
  ]);
  if (existingByEmail || existingByUsername) {
    throw new AuthError(DUPLICATE_ACCOUNT_ERROR, 409);
  }

  const passwordHash = await hashPassword(password);

  try {
    const userId = await userModel.createUser({
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
    });
    logEvent('user_register', { userId, email: maskEmail(normalizedEmail) });
    return userId;
  } catch (err) {
    // 동시 요청으로 인한 TOCTOU 경쟁 상태는 DB unique 제약이 최종적으로 막아준다.
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AuthError(DUPLICATE_ACCOUNT_ERROR, 409);
    }
    throw err;
  }
}

async function authenticateUser({ email, password }) {
  const normalizedEmail = normalizeInput(email).toLowerCase();
  const user = await userModel.findByEmail(normalizedEmail);

  const hashToCompare = user ? user.password_hash : DUMMY_HASH;
  const isMatch = await comparePassword(password, hashToCompare);

  if (!user || !isMatch) {
    logEvent('login_failed', { email: maskEmail(normalizedEmail) });
    // 계정 미존재/비밀번호 불일치를 구분하지 않는다 (계정 존재 여부 노출 방지 - User Enumeration 방어)
    throw new AuthError(GENERIC_LOGIN_ERROR, 401);
  }

  if (user.status !== 'ACTIVE') {
    // 정지/휴면 계정 여부도 동일한 메시지로 응답하여 계정 상태를 외부에 노출하지 않는다.
    logEvent('login_blocked', { userId: user.id, status: user.status });
    throw new AuthError(GENERIC_LOGIN_ERROR, 401);
  }

  logEvent('login_success', { userId: user.id });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}

module.exports = { registerUser, authenticateUser, AuthError };
