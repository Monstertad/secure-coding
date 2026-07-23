// 회원 정보 관련 라우팅
// - 마이페이지 조회, 회원정보 수정, 비밀번호 변경
// - auth 미들웨어로 로그인 여부 확인 후 controllers/userController.js로 위임

const express = require('express');
const { body, query } = require('express-validator');

const userController = require('../controllers/userController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { isStrongPassword } = require('../utils/validator');
const { csrfProtection, attachCsrfToken } = require('../middleware/csrf');

const router = express.Router();

const searchValidators = [
  query('q').optional().trim().isLength({ max: 50 }),
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
];

const bioValidators = [
  body('bio')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('소개글은 최대 500자까지 입력할 수 있습니다.'),
];

const passwordValidators = [
  body('currentPassword').notEmpty().withMessage('현재 비밀번호를 입력해주세요.'),
  body('newPassword')
    .custom((value) => isStrongPassword(value))
    .withMessage('새 비밀번호는 10~72자이며, 영문 대문자/소문자/숫자/특수문자 중 3종류 이상을 포함해야 합니다.'),
  body('newPasswordConfirm')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('새 비밀번호가 일치하지 않습니다.'),
];

// 사용자 조회(회원 목록/검색) - 비로그인 사용자에게 회원 아이디를 노출하지 않도록 로그인 필수
router.get('/', requireAuth, searchValidators, validate, csrfProtection, attachCsrfToken, userController.list);

// 마이페이지
router.get('/me', requireAuth, csrfProtection, attachCsrfToken, userController.myPage);

// 소개글 수정
router.post(
  '/me/bio',
  requireAuth,
  csrfProtection,
  attachCsrfToken,
  bioValidators,
  validate,
  userController.updateBio
);

// 비밀번호 변경
router.post(
  '/me/password',
  requireAuth,
  csrfProtection,
  attachCsrfToken,
  passwordValidators,
  validate,
  userController.changePassword
);

module.exports = router;
