// 인증 관련 라우팅
// - POST /register, POST /login, POST /logout 등
// - 요청을 controllers/authController.js로 위임

const express = require('express');
const { body } = require('express-validator');

const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { isValidUsername, isStrongPassword } = require('../utils/validator');
const { csrfProtection, attachCsrfToken } = require('../middleware/csrf');

const router = express.Router();

// 주의: 이 라우터는 app.use('/', authRoutes)로 루트 경로에 마운트되어 있어,
// 여기서 router.use(...)로 미들웨어를 걸면 '/'로 시작하는 모든 요청
// (예: 이후 등록되는 /products 등 다른 라우터로 갈 요청까지) 이 라우터를 먼저 통과하며
// 실행되어 버린다. 그래서 CSRF 보호는 라우터 전체가 아니라 각 라우트에 개별적으로 적용한다.

const registerValidators = [
  body('username')
    .trim()
    .custom((value) => isValidUsername(value))
    .withMessage('아이디는 영문으로 시작하는 4~20자의 영문/숫자/밑줄(_)만 사용할 수 있습니다.'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('올바른 이메일 형식이 아닙니다.')
    .isLength({ max: 255 })
    .withMessage('이메일이 너무 깁니다.'),
  body('password')
    .custom((value) => isStrongPassword(value))
    .withMessage('비밀번호는 10~72자이며, 영문 대문자/소문자/숫자/특수문자 중 3종류 이상을 포함해야 합니다.'),
  body('passwordConfirm')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('비밀번호가 일치하지 않습니다.'),
];

const loginValidators = [
  body('email').trim().isEmail().withMessage('올바른 이메일 형식이 아닙니다.'),
  body('password').notEmpty().withMessage('비밀번호를 입력해주세요.'),
];

router.get('/register', csrfProtection, attachCsrfToken, authController.showRegisterForm);
router.post(
  '/register',
  registerLimiter,
  csrfProtection,
  attachCsrfToken,
  registerValidators,
  validate,
  authController.register
);

router.get('/login', csrfProtection, attachCsrfToken, authController.showLoginForm);
router.post(
  '/login',
  loginLimiter,
  csrfProtection,
  attachCsrfToken,
  loginValidators,
  validate,
  authController.login
);

router.post('/logout', csrfProtection, authController.logout);

module.exports = router;
