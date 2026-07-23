// 로그인 여부 확인 미들웨어
// - 세션에 사용자 정보가 없으면 로그인 페이지로 리다이렉트/401 응답

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  return res.redirect('/login');
}

module.exports = { requireAuth };
