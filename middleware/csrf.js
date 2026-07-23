// CSRF 보호 공통 미들웨어
// - csurf는 req.body._csrf(또는 쿼리/헤더)를 읽어 토큰을 검증하므로,
//   multer처럼 별도의 body 파서가 필요한 라우트에서는 반드시 해당 파서 "뒤"에 위치시켜야 한다.
//   (그래서 app.js에 전역으로 걸지 않고, 각 라우터에서 필요한 시점에 명시적으로 적용한다)

const csrf = require('csurf');

const csrfProtection = csrf();

function attachCsrfToken(req, res, next) {
  res.locals.csrfToken = req.csrfToken();
  next();
}

module.exports = { csrfProtection, attachCsrfToken };
