// express-validator 기반 공통 입력값 검증 미들웨어
// - 각 라우트에서 정의한 검증 규칙 실행 후 에러 발생 시 요청 차단
// - 사용자 입력을 그대로 반사(reflect)하지 않고 사전에 정의된 에러 메시지만 응답에 사용한다.

const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const messages = result.array({ onlyFirstError: true }).map((e) => e.msg);

  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(400).json({ error: 'ValidationError', messages });
  }

  return res.status(400).render('error', {
    status: 400,
    message: '입력값을 확인해주세요.',
    errors: messages,
  });
}

module.exports = validate;
