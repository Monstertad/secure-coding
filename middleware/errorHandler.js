// 공통 에러 처리 미들웨어
// - 스택 트레이스 등 내부 정보를 클라이언트에 노출하지 않고 로깅만 수행

const { logError } = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // CSRF 토큰 검증 실패 (csurf)
  if (err.code === 'EBADCSRFTOKEN') {
    logError('csrf_error', err, { path: req.path, method: req.method });
    return res.status(403).render('error', {
      status: 403,
      message: '요청이 유효하지 않습니다. 페이지를 새로고침한 후 다시 시도해주세요.',
      errors: [],
    });
  }

  logError('unhandled_error', err, { path: req.path, method: req.method });

  const status = Number.isInteger(err.status) ? err.status : 500;
  return res.status(status).render('error', {
    status,
    // 500(예상치 못한 서버 오류)은 내부 메시지를 감추고, 그 외 의도된 상태코드만 메시지를 노출한다.
    message: status === 500 ? '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' : err.message,
    errors: [],
  });
}

module.exports = errorHandler;
