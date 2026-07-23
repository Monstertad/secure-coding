// 채팅 페이지 라우팅
// - 전체 채팅방, 1:1 DM 채팅 진입 페이지
// - controllers/chatController.js로 위임 (실제 실시간 통신은 sockets/chat.js)

const express = require('express');
const { param } = require('express-validator');

const chatController = require('../controllers/chatController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { csrfProtection, attachCsrfToken } = require('../middleware/csrf');

const router = express.Router();

router.get('/', requireAuth, csrfProtection, attachCsrfToken, chatController.globalRoom);

router.get(
  '/dm/:userId',
  requireAuth,
  param('userId').isInt({ min: 1 }).withMessage('잘못된 사용자입니다.').toInt(),
  validate,
  csrfProtection,
  attachCsrfToken,
  chatController.dmRoom
);

module.exports = router;
