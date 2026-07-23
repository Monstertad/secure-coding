// 신고 관련 라우팅
// - 신고 등록/본인 신고 내역 조회
// - controllers/reportController.js로 위임

const express = require('express');
const { body } = require('express-validator');

const reportController = require('../controllers/reportController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { csrfProtection, attachCsrfToken } = require('../middleware/csrf');

const router = express.Router();

const reportValidators = [
  body('targetType').isIn(['USER', 'PRODUCT', 'MESSAGE']).withMessage('잘못된 신고 대상 유형입니다.'),
  body('targetId').isInt({ min: 1 }).withMessage('잘못된 대상 번호입니다.'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('신고 사유를 입력해주세요.')
    .isLength({ max: 1000 })
    .withMessage('신고 사유는 1000자 이하로 입력해주세요.'),
];

router.get('/new', requireAuth, csrfProtection, attachCsrfToken, reportController.newForm);
router.post('/', requireAuth, csrfProtection, attachCsrfToken, reportValidators, validate, reportController.create);
router.get('/my', requireAuth, csrfProtection, attachCsrfToken, reportController.myReports);

module.exports = router;
