// 입력값 Sanitizing 유틸
// - 사용자 입력에서 위험한 HTML/스크립트 태그 제거 또는 이스케이프 (XSS 방지 보조)
// - 뷰 렌더링은 EJS `<%= %>`의 자동 이스케이프가 1차 방어선이며,
//   이 유틸은 저장/로깅 전 입력값을 정규화하는 보조 방어선(Defense in Depth)이다.

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
  '=': '&#61;',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`=]/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

// 로그 인젝션(CRLF Injection) 및 제어문자를 이용한 터미널/로그 조작 방지
function stripControlChars(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// 앞뒤 공백 제거 + 제어문자 제거를 결합한 기본 입력값 정규화
function normalizeInput(value) {
  return stripControlChars(String(value ?? '')).trim();
}

module.exports = { escapeHtml, stripControlChars, normalizeInput };
