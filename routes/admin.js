// 관리자 전용 라우팅
// - 대시보드, 회원관리, 상품관리, 신고관리
// - admin 미들웨어로 관리자 권한 확인 후 controllers/adminController.js로 위임

const express = require('express');
const { param, body } = require('express-validator');

const adminController = require('../controllers/adminController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { csrfProtection, attachCsrfToken } = require('../middleware/csrf');

const router = express.Router();

// 이 라우터의 모든 경로는 로그인 + 관리자 권한이 반드시 필요하다.
router.use(requireAuth, requireAdmin);

router.get('/', csrfProtection, attachCsrfToken, adminController.dashboard);

router.get('/reports', csrfProtection, attachCsrfToken, adminController.reportList);
router.post(
  '/reports/:id/resolve',
  param('id').isInt({ min: 1 }).withMessage('잘못된 신고 번호입니다.').toInt(),
  body('action').isIn(['approve', 'reject']).withMessage('잘못된 요청입니다.'),
  validate,
  csrfProtection,
  attachCsrfToken,
  adminController.resolveReport
);

router.get('/users', csrfProtection, attachCsrfToken, adminController.userList);
router.post(
  '/users/:id/status',
  param('id').isInt({ min: 1 }).withMessage('잘못된 회원 번호입니다.').toInt(),
  body('status').isIn(['ACTIVE', 'SUSPENDED', 'DORMANT']).withMessage('잘못된 상태값입니다.'),
  validate,
  csrfProtection,
  attachCsrfToken,
  adminController.updateUserStatus
);

router.get('/products', csrfProtection, attachCsrfToken, adminController.productList);
router.post(
  '/products/:id/delete',
  param('id').isInt({ min: 1 }).withMessage('잘못된 상품 번호입니다.').toInt(),
  validate,
  csrfProtection,
  attachCsrfToken,
  adminController.deleteProduct
);

module.exports = router;
