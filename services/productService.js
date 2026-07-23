// 상품 관련 비즈니스 로직
// - 가격/제목/설명 등 데이터 유효성 확인
// - 판매자 권한 확인 후 모델 계층 호출

const path = require('path');
const fs = require('fs/promises');

const productModel = require('../models/productModel');
const { UPLOAD_DIR } = require('../config/multer');
const { normalizeInput } = require('../utils/sanitizer');
const { logEvent } = require('../utils/logger');

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const PRICE_MAX = 100000000; // 1억
const PAGE_SIZE = 12; // 클라이언트가 페이지 크기를 조절하지 못하게 고정 (대량 조회로 인한 자원 고갈 방지)

class ProductError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ProductError';
    this.status = status;
  }
}

// 업로드된 파일의 실제 바이트(매직 넘버)를 검사한다.
// 클라이언트가 보낸 Content-Type/확장자는 위조 가능하므로 (middleware/uploadFilter.js는 1차 필터일 뿐)
// 디스크에 쓰인 실제 내용을 다시 검증하는 것이 최종 방어선이다.
const SIGNATURES = [
  { bytes: [0xff, 0xd8, 0xff] }, // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // PNG
  { bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
];

async function verifyImageSignature(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    await handle.read(buf, 0, 12, 0);

    if (SIGNATURES.some((sig) => buf.slice(0, sig.bytes.length).equals(Buffer.from(sig.bytes)))) {
      return true;
    }
    // WEBP: 'RIFF' .... 'WEBP'
    return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  } finally {
    await handle.close();
  }
}

async function removeUploadedFile(filename) {
  if (!filename) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIR, filename));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function assertValidProductInput({ title, description, price }) {
  if (!title || title.length > TITLE_MAX) {
    throw new ProductError(`제목은 1~${TITLE_MAX}자로 입력해주세요.`);
  }
  if (description && description.length > DESCRIPTION_MAX) {
    throw new ProductError(`설명은 최대 ${DESCRIPTION_MAX}자까지 입력할 수 있습니다.`);
  }

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > PRICE_MAX) {
    throw new ProductError('가격은 0 이상의 숫자로 입력해주세요.');
  }
}

async function validateUploadedImage(uploadedFile) {
  const valid = await verifyImageSignature(uploadedFile.path);
  if (!valid) {
    await removeUploadedFile(uploadedFile.filename);
    throw new ProductError('이미지 파일 형식이 올바르지 않습니다.');
  }
}

async function createProduct({ title, description, price, sellerId, uploadedFile }) {
  const normalizedTitle = normalizeInput(title);
  const normalizedDescription = description ? normalizeInput(description) : null;

  try {
    assertValidProductInput({ title: normalizedTitle, description: normalizedDescription, price });
    if (uploadedFile) {
      await validateUploadedImage(uploadedFile);
    }
  } catch (err) {
    if (uploadedFile) await removeUploadedFile(uploadedFile.filename);
    throw err;
  }

  const productId = await productModel.insertProduct({
    title: normalizedTitle,
    description: normalizedDescription,
    price: Number(price),
    sellerId,
    image: uploadedFile ? uploadedFile.filename : null,
  });

  logEvent('product_create', { productId, sellerId });
  return productId;
}

async function getProductDetail(id) {
  const product = await productModel.findById(id);
  if (!product || product.status === 'DELETED') {
    throw new ProductError('상품을 찾을 수 없습니다.', 404);
  }
  return product;
}

function assertOwnership(product, userId) {
  // IDOR 방지: 요청자가 실제 판매자 본인인지 확인 후에만 수정/삭제 허용
  if (product.seller_id !== userId) {
    throw new ProductError('본인이 등록한 상품만 처리할 수 있습니다.', 403);
  }
}

async function updateProduct(id, { title, description, price, uploadedFile }, userId) {
  const product = await getProductDetail(id);
  assertOwnership(product, userId);

  const normalizedTitle = normalizeInput(title);
  const normalizedDescription = description ? normalizeInput(description) : null;

  try {
    assertValidProductInput({ title: normalizedTitle, description: normalizedDescription, price });
    if (uploadedFile) {
      await validateUploadedImage(uploadedFile);
    }
  } catch (err) {
    if (uploadedFile) await removeUploadedFile(uploadedFile.filename);
    throw err;
  }

  await productModel.updateProduct(id, {
    title: normalizedTitle,
    description: normalizedDescription,
    price: Number(price),
    image: uploadedFile ? uploadedFile.filename : null,
  });

  // 새 이미지로 교체된 경우에만, DB 반영이 끝난 뒤 기존 파일을 정리한다.
  if (uploadedFile && product.image) {
    await removeUploadedFile(product.image);
  }

  logEvent('product_update', { productId: id, sellerId: userId });
}

async function deleteProduct(id, userId) {
  const product = await getProductDetail(id);
  assertOwnership(product, userId);
  await productModel.softDeleteProduct(id);
  logEvent('product_delete', { productId: id, sellerId: userId });
}

async function searchProducts({ q, minPrice, maxPrice, page }) {
  const keyword = q ? normalizeInput(q).slice(0, 100) : '';

  const parsedMin = minPrice !== undefined && minPrice !== '' ? Number(minPrice) : null;
  const parsedMax = maxPrice !== undefined && maxPrice !== '' ? Number(maxPrice) : null;
  const safeMin = Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : null;
  const safeMax = Number.isFinite(parsedMax) && parsedMax >= 0 ? parsedMax : null;

  const parsedPage = Number.parseInt(page, 10);
  const pageNum = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const offset = (pageNum - 1) * PAGE_SIZE;

  const { items, total } = await productModel.searchProducts({
    keyword,
    minPrice: safeMin,
    maxPrice: safeMax,
    limit: PAGE_SIZE,
    offset,
  });

  return {
    items,
    total,
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    keyword,
    minPrice: safeMin,
    maxPrice: safeMax,
  };
}

module.exports = {
  ProductError,
  createProduct,
  getProductDetail,
  updateProduct,
  deleteProduct,
  searchProducts,
  removeUploadedFile,
};
