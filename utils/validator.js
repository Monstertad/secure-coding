// 공통 입력값 검증 함수 모음
// - 이메일/비밀번호 형식, 길이 제한 등 재사용 가능한 검증 로직
//
// 정규식은 재앙적 백트래킹(ReDoS)이 발생하지 않는 단순한 패턴만 사용한다.

const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{3,19}$/; // 영문 시작, 총 4~20자 (영문/숫자/밑줄)

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 255 && EMAIL_REGEX.test(email);
}

function isValidUsername(username) {
  return typeof username === 'string' && USERNAME_REGEX.test(username);
}

/**
 * 비밀번호 정책 (NIST SP 800-63B 및 KISA 시큐어코딩 가이드 절충)
 * - 길이: 10~72자 (bcrypt는 72바이트를 초과하는 부분을 무시하므로 상한을 둔다)
 * - 영문 대문자/소문자/숫자/특수문자 중 3종류 이상 조합
 */
function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 10 || password.length > 72) return false;

  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1;

  return classes >= 3;
}

module.exports = {
  EMAIL_REGEX,
  USERNAME_REGEX,
  isValidEmail,
  isValidUsername,
  isStrongPassword,
};
