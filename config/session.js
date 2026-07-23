// express-session 설정
// - 세션 저장소, 쿠키 옵션(HttpOnly, Secure, SameSite) 설정
// - 세션 하이재킹/고정 공격 방어를 위한 옵션 포함
//
// 저장소: 현재는 express-session 기본 MemoryStore를 사용한다.
//   MemoryStore는 단일 프로세스 개발용이며 메모리 누수 경고가 있고,
//   서버 재시작 시 세션이 모두 소실되며 다중 인스턴스 환경에서 세션이 공유되지 않는다.
//   운영 배포 시에는 Redis(connect-redis) 등 영속 스토어로 교체해야 한다.

const session = require('express-session');

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
}

const isProduction = process.env.NODE_ENV === 'production';

// 기본 세션 유지시간 (로그인 유지를 체크하지 않은 경우)
const DEFAULT_MAX_AGE = 1000 * 60 * 60 * 2; // 2시간
// "로그인 상태 유지" 체크 시 세션 유지시간
const REMEMBER_ME_MAX_AGE = 1000 * 60 * 60 * 24 * 14; // 14일

const sessionMiddleware = session({
  name: 'sid', // 기본 쿠키명(connect.sid)을 노출하면 프레임워크 지문 수집에 악용될 수 있어 변경
  secret: process.env.SESSION_SECRET,
  resave: false, // 변경되지 않은 세션을 매 요청마다 저장하지 않음
  saveUninitialized: false, // 로그인 등 실제 데이터가 기록되기 전까지는 세션을 생성하지 않음 (불필요한 세션 남발 방지)
  rolling: true, // 활동이 있을 때마다 만료시간을 갱신 (idle timeout 효과)
  cookie: {
    httpOnly: true, // JS(document.cookie)에서 세션 쿠키 접근 불가 → XSS를 통한 세션 탈취 방지
    secure: isProduction, // 운영(HTTPS) 환경에서만 Secure 플래그로 평문 전송 방지
    sameSite: 'lax', // CSRF 방어 보조 (csurf 토큰 검증과 함께 이중 방어)
    maxAge: DEFAULT_MAX_AGE,
  },
});

module.exports = { sessionMiddleware, DEFAULT_MAX_AGE, REMEMBER_ME_MAX_AGE };
