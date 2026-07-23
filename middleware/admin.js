// 관리자 권한 확인 미들웨어
// - 세션 사용자의 role이 ADMIN이 아니면 접근 차단(403)

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'ADMIN') {
    return next();
  }
  return res.status(403).render('error', { status: 403, message: '관리자만 접근할 수 있습니다.', errors: [] });
}

module.exports = { requireAdmin };
