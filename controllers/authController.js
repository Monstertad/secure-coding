// 인증 요청 처리
// - 입력값 형식 확인 후 services/authService.js 호출
// - 로그인 성공 시 세션 생성, 실패 시 공통 에러 메시지 반환(계정 존재 여부 노출 방지)

const authService = require('../services/authService');
const { DEFAULT_MAX_AGE, REMEMBER_ME_MAX_AGE } = require('../config/session');

function showRegisterForm(req, res) {
  res.render('auth/register', { errors: [], values: { username: '', email: '' } });
}

async function register(req, res, next) {
  const { username, email, password } = req.body;

  try {
    await authService.registerUser({ username, email, password });
    return res.redirect('/login?registered=1');
  } catch (err) {
    if (err instanceof authService.AuthError) {
      return res.status(err.status).render('auth/register', {
        errors: [err.message],
        values: { username, email },
      });
    }
    return next(err);
  }
}

function showLoginForm(req, res) {
  res.render('auth/login', {
    errors: [],
    values: { email: '' },
    registered: req.query.registered === '1',
  });
}

async function login(req, res, next) {
  const { email, password, rememberMe } = req.body;

  try {
    const user = await authService.authenticateUser({ email, password });

    // 세션 고정(Session Fixation) 공격 방지: 로그인 성공 시 세션 ID를 반드시 재발급한다.
    req.session.regenerate((regenerateErr) => {
      if (regenerateErr) return next(regenerateErr);

      // 세션에는 최소한의 식별 정보만 저장한다 (비밀번호 해시 등 민감정보 저장 금지)
      req.session.user = { id: user.id, username: user.username, role: user.role };

      // "로그인 상태 유지" 체크 여부에 따라 세션(쿠키) 만료시간을 다르게 설정
      req.session.cookie.maxAge = rememberMe ? REMEMBER_ME_MAX_AGE : DEFAULT_MAX_AGE;

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        return res.redirect('/');
      });
    });
  } catch (err) {
    if (err instanceof authService.AuthError) {
      return res.status(err.status).render('auth/login', {
        errors: [err.message],
        values: { email },
        registered: false,
      });
    }
    return next(err);
  }
}

function logout(req, res, next) {
  if (!req.session) {
    return res.redirect('/login');
  }
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid');
    return res.redirect('/login');
  });
}

module.exports = { showRegisterForm, register, showLoginForm, login, logout };
