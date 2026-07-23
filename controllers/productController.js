// 상품 CRUD 요청 처리
// - 등록/수정/삭제 시 요청자가 실제 판매자(소유자)인지 확인

const productService = require('../services/productService');

async function list(req, res, next) {
  try {
    const result = await productService.searchProducts({
      q: req.query.q,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      page: req.query.page,
    });
    res.render('products/list', result);
  } catch (err) {
    next(err);
  }
}

function createForm(req, res) {
  res.render('products/create', { errors: [], values: { title: '', description: '', price: '' } });
}

async function create(req, res, next) {
  const { title, description, price } = req.body;

  try {
    const productId = await productService.createProduct({
      title,
      description,
      price,
      sellerId: req.session.user.id,
      uploadedFile: req.file,
    });
    return res.redirect(`/products/${productId}`);
  } catch (err) {
    if (err instanceof productService.ProductError) {
      return res.status(err.status).render('products/create', {
        errors: [err.message],
        values: { title, description, price },
      });
    }
    return next(err);
  }
}

async function detail(req, res, next) {
  try {
    const product = await productService.getProductDetail(req.params.id);
    const isOwner = !!(req.session.user && req.session.user.id === product.seller_id);
    res.render('products/detail', { product, isOwner, purchased: req.query.purchased === '1' });
  } catch (err) {
    if (err instanceof productService.ProductError) {
      return res
        .status(err.status)
        .render('error', { status: err.status, message: err.message, errors: [] });
    }
    return next(err);
  }
}

async function editForm(req, res, next) {
  try {
    const product = await productService.getProductDetail(req.params.id);
    if (!req.session.user || req.session.user.id !== product.seller_id) {
      return res
        .status(403)
        .render('error', { status: 403, message: '본인이 등록한 상품만 수정할 수 있습니다.', errors: [] });
    }
    res.render('products/edit', {
      errors: [],
      product,
      values: { title: product.title, description: product.description || '', price: product.price },
    });
  } catch (err) {
    if (err instanceof productService.ProductError) {
      return res
        .status(err.status)
        .render('error', { status: err.status, message: err.message, errors: [] });
    }
    return next(err);
  }
}

async function update(req, res, next) {
  const { title, description, price } = req.body;

  try {
    await productService.updateProduct(
      req.params.id,
      { title, description, price, uploadedFile: req.file },
      req.session.user.id
    );
    return res.redirect(`/products/${req.params.id}`);
  } catch (err) {
    if (err instanceof productService.ProductError) {
      if (err.status === 400) {
        const product = await productService.getProductDetail(req.params.id).catch(() => null);
        return res.status(400).render('products/edit', {
          errors: [err.message],
          product: product || { id: req.params.id, image: null },
          values: { title, description, price },
        });
      }
      return res
        .status(err.status)
        .render('error', { status: err.status, message: err.message, errors: [] });
    }
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    await productService.deleteProduct(req.params.id, req.session.user.id);
    return res.redirect('/products');
  } catch (err) {
    if (err instanceof productService.ProductError) {
      return res
        .status(err.status)
        .render('error', { status: err.status, message: err.message, errors: [] });
    }
    return next(err);
  }
}

module.exports = { list, createForm, create, detail, editForm, update, remove };
