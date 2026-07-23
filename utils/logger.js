// 공통 로깅 유틸
// - 로그인, 신고, 송금 등 주요 이벤트 기록
// - 비밀번호/세션ID 등 민감정보는 절대 기록하지 않는다.
// - 사용자 입력이 로그에 섞여도 개행문자를 제거하여 로그 위조(Log Injection)를 방지한다.

const { stripControlChars } = require('./sanitizer');

function sanitizeForLog(value) {
  return stripControlChars(String(value)).slice(0, 500);
}

function sanitizeMeta(meta) {
  const safe = {};
  for (const [key, value] of Object.entries(meta)) {
    safe[key] = typeof value === 'string' ? sanitizeForLog(value) : value;
  }
  return safe;
}

function logEvent(event, meta = {}) {
  const entry = { time: new Date().toISOString(), level: 'info', event, ...sanitizeMeta(meta) };
  console.log(JSON.stringify(entry));
}

function logError(event, err, meta = {}) {
  const entry = {
    time: new Date().toISOString(),
    level: 'error',
    event,
    error: err && err.message ? sanitizeForLog(err.message) : String(err),
    ...sanitizeMeta(meta),
  };
  console.error(JSON.stringify(entry));
}

module.exports = { logEvent, logError };
