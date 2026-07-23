// 업로드 파일 검사 미들웨어
// - 허용된 이미지 확장자/MIME 타입만 통과시켜 악성 파일 업로드 방지
// - 여기서 하는 검사는 클라이언트가 보낸 값(확장자/Content-Type) 기준 1차 필터일 뿐이며,
//   위조 가능하므로 services/productService.js에서 실제 파일 시그니처(magic number)를
//   재검증하는 2차 방어선을 둔다 (Defense in Depth).

const path = require('path');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function uploadFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error('허용되지 않는 파일 형식입니다. (jpg, png, webp, gif만 업로드할 수 있습니다.)');
    err.status = 400;
    return cb(err);
  }

  return cb(null, true);
}

module.exports = uploadFilter;
