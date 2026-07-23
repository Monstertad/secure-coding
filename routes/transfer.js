// 송금(포인트/캐시) 관련 라우팅
// - 송금 요청 처리
// - controllers/transferController.js로 위임

const express = require('express');
const { body, param } = require('express-validator');

const transferController = require('../controllers/transferController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { transferLimiter } = require('../middleware/rateLimiter');
const { csrfProtection, attachCsrfToken } = require('../middleware/csrf');

const router = express.Router();

const sendValidators = [
  body('receiverId').isInt({ min: 1 }).withMessage('잘못된 받는 사람입니다.'),
  body('amount').isFloat({ min: 0.01, max: 100000000 }).withMessage('송금액을 올바르게 입력해주세요.'),
];

router.get('/send', requireAuth, csrfProtection, attachCsrfToken, transferController.sendForm);
router.post(
  '/send',
  requireAuth,
  transferLimiter,
  csrfProtection,
  attachCsrfToken,
  sendValidators,
  validate,
  transferController.send
);

router.get('/history', requireAuth, csrfProtection, attachCsrfToken, transferController.history);

router.post(
  '/products/:id/purchase',
  requireAuth,
  transferLimiter,
  param('id').isInt({ min: 1 }).withMessage('잘못된 상품 번호입니다.').toInt(),
  validate,
  csrfProtection,
  attachCsrfToken,
  transferController.purchase
);

module.exports = router;
