// 상품 관련 라우팅
// - 목록/상세/등록/수정/삭제
// - controllers/productController.js로 위임

const express = require('express');
const { body, param, query } = require('express-validator');

const productController = require('../controllers/productController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { csrfProtection, attachCsrfToken } = require('../middleware/csrf');
const { upload } = require('../config/multer');

const router = express.Router();

const idParamValidator = [param('id').isInt({ min: 1 }).withMessage('잘못된 상품 번호입니다.').toInt()];

const productBodyValidators = [
  body('title').trim().notEmpty().withMessage('제목을 입력해주세요.').isLength({ max: 200 }).withMessage('제목은 200자 이하로 입력해주세요.'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('설명은 2000자 이하로 입력해주세요.'),
  body('price').isFloat({ min: 0, max: 100000000 }).withMessage('가격은 0 이상의 숫자로 입력해주세요.'),
];

const searchValidators = [
  query('q').optional().trim().isLength({ max: 100 }),
  query('minPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  query('maxPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
];

// multer는 자체 에러(용량 초과, 허용되지 않은 형식 등)를 next(err)가 아닌 콜백으로 전달하므로
// 감싸서 공통 에러 페이지로 응답한다.
function withUpload(field) {
  const middleware = upload.single(field);
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) {
        return res.status(400).render('error', {
          status: 400,
          message: err.message || '파일 업로드 중 오류가 발생했습니다.',
          errors: [],
        });
      }
      return next();
    });
  };
}

router.get('/', searchValidators, validate, csrfProtection, attachCsrfToken, productController.list);

router.get('/new', requireAuth, csrfProtection, attachCsrfToken, productController.createForm);
router.post(
  '/',
  requireAuth,
  withUpload('image'),
  csrfProtection,
  attachCsrfToken,
  productBodyValidators,
  validate,
  productController.create
);

router.get('/:id', idParamValidator, validate, csrfProtection, attachCsrfToken, productController.detail);

router.get(
  '/:id/edit',
  requireAuth,
  idParamValidator,
  validate,
  csrfProtection,
  attachCsrfToken,
  productController.editForm
);
router.post(
  '/:id/edit',
  requireAuth,
  idParamValidator,
  validate,
  withUpload('image'),
  csrfProtection,
  attachCsrfToken,
  productBodyValidators,
  validate,
  productController.update
);
router.post(
  '/:id/delete',
  requireAuth,
  idParamValidator,
  validate,
  csrfProtection,
  attachCsrfToken,
  productController.remove
);

module.exports = router;
