// express-rate-limit 기반 요청 횟수 제한 미들웨어
// - 로그인 등 민감한 엔드포인트에 적용하여 Brute Force 공격 방지
//
// 제한 횟수(max)는 환경변수로 조절 가능하다. 기본값은 운영 환경 기준으로 안전하게 잡은 값이며,
// 자동화 테스트(tests/)처럼 짧은 시간에 다수의 계정을 만들어야 하는 경우
// .env에서 *_RATE_LIMIT_MAX 값을 높여 사용한다 (README.md "테스트 실행 방법" 참고).
// 반대로 보안 테스트(tests/security.test.js)에서 429 발생 자체를 검증할 때는
// 이 값과 무관하게 자체적으로 낮은 한도의 임시 앱 인스턴스를 만들어 검증한다.

const rateLimit = require('express-rate-limit');

// 로그인: 10분에 N회로 제한 (계정당이 아닌 IP 기준 - 크리덴셜 스터핑/무차별 대입 완화)
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// 회원가입: 1시간에 N회로 제한 (자동화된 대량 가입 방지)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REGISTER_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// 송금: 1분에 N회로 제한 (금전 관련 작업이므로 자동화된 남용 시도를 더 엄격히 제한)
const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.TRANSFER_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '송금 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

module.exports = { loginLimiter, registerLimiter, transferLimiter };
