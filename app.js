// Express 애플리케이션 설정 파일
// - 미들웨어(helmet, session, csurf, rate limiter 등) 등록
// - 라우터(routes/) 연결
// - 뷰 엔진(EJS) 설정
// - 공통 에러 핸들러(middleware/errorHandler.js) 등록

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');

const { sessionMiddleware } = require('./config/session');
const { UPLOAD_DIR } = require('./config/multer');
const { csrfProtection, attachCsrfToken } = require('./middleware/csrf');
const userModel = require('./models/userModel');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const chatRoutes = require('./routes/chat');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const transferRoutes = require('./routes/transfer');
const userRoutes = require('./routes/users');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// 프록시(nginx 등) 뒤에서 운영 시 Secure 쿠키/클라이언트 IP 판단을 위해 필요
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));
// 업로드된 상품 이미지 제공. 파일명은 서버가 랜덤 생성한 값만 사용되므로 Path Traversal 여지가 없다.
app.use('/uploads/products', express.static(UPLOAD_DIR, { index: false }));

app.use(sessionMiddleware);

// res.locals 기본값 설정: CSRF 미들웨어는 라우터별로(필요한 body 파서 뒤에) 적용되므로,
// 아직 적용되지 않은 시점에도 뷰(header.ejs 등)가 undefined 참조로 깨지지 않도록 먼저 초기화한다.
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.csrfToken = null;
  next();
});

app.get('/', csrfProtection, attachCsrfToken, async (req, res, next) => {
  try {
    let balance = null;
    if (req.session.user) {
      const user = await userModel.findById(req.session.user.id);
      balance = user ? user.balance : null;
    }
    res.render('index', { balance });
  } catch (err) {
    next(err);
  }
});

// 주의: 아래 라우터들은 모두 넓은 prefix('/')로 마운트되는 authRoutes보다 뒤에 있어도
// 문제 없다 - authRoutes는 더 이상 라우터 전체에 걸친 미들웨어를 사용하지 않고
// 각 라우트에 개별적으로 CSRF 보호를 적용하므로, 매칭되지 않는 경로는 그대로 다음으로 넘어간다.
app.use('/', authRoutes);
app.use('/products', productRoutes);
app.use('/chat', chatRoutes);
app.use('/reports', reportRoutes);
app.use('/admin', adminRoutes);
app.use('/transfer', transferRoutes);
app.use('/users', userRoutes);

app.use((req, res) => {
  res.status(404).render('error', { status: 404, message: '페이지를 찾을 수 없습니다.', errors: [] });
});

app.use(errorHandler);

module.exports = app;
