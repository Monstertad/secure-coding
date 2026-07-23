// 파일 업로드(Multer) 설정
// - 저장 경로(uploads/products), 파일명 랜덤화, 용량 제한 설정
// - 실제 확장자/MIME 검사는 middleware/uploadFilter.js에서 수행

const path = require('path');
const nodeCrypto = require('crypto');
const multer = require('multer');
const uploadFilter = require('../middleware/uploadFilter');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'products');

// 클라이언트가 보낸 원본 파일명/확장자는 절대 신뢰하지 않는다.
// 저장 파일명은 (검증된 MIME으로부터 매핑한 고정 확장자) + (랜덤 16바이트 hex)로만 생성한다.
// -> 경로 조작(Path Traversal), 이중 확장자(예: shell.php.jpg) 공격을 원천 차단.
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const ext = MIME_TO_EXT[file.mimetype] || '';
    const randomName = nodeCrypto.randomBytes(16).toString('hex');
    cb(null, `${randomName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter: uploadFilter,
});

module.exports = { upload, UPLOAD_DIR };
