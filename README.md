# secure-coding
중고거래 플랫폼 (시큐어 코딩 과제) - Express + MySQL + EJS

## 요구사항
- Node.js 18 이상
- MySQL 또는 MariaDB (8.x / 10.x 이상 권장)

## 설치
```bash
npm install
```

## 환경 변수 설정
`.env.example`을 복사해 `.env`를 만들고 값을 채운다. `.env`는 git에 커밋하지 않는다.

```bash
cp .env.example .env
```

| 변수 | 설명 | 기본값 |
|---|---|---|
| PORT | 서버 포트 | 3000 |
| NODE_ENV | 실행 환경 (development / production) | development |
| DB_HOST | DB 호스트 | localhost |
| DB_PORT | DB 포트 | 3306 |
| DB_USER | DB 사용자 | app_user |
| DB_PASSWORD | DB 비밀번호 | (필수 입력) |
| DB_NAME | DB 이름 | tiny_secondhand |
| SESSION_SECRET | 세션 서명 시크릿 (미설정 시 서버 기동 실패) | (필수 입력) |
| BCRYPT_SALT_ROUNDS | bcrypt 해시 salt rounds | 12 |
| LOGIN_RATE_LIMIT_MAX | 로그인 레이트리밋 (10분당 최대 요청 수) | 10 |
| REGISTER_RATE_LIMIT_MAX | 회원가입 레이트리밋 (1시간당 최대 요청 수) | 20 |
| TRANSFER_RATE_LIMIT_MAX | 송금 레이트리밋 (1분당 최대 요청 수) | 10 |

레이트리밋 관련 변수는 생략하면 운영 환경 기준 기본값을 사용한다. 자동화 테스트처럼 짧은 시간에 다수의 계정/요청을 만들어야 하는 환경에서만 값을 높여서 사용한다.

## 데이터베이스 설정
`sql/schema.sql`을 실행해 데이터베이스와 테이블을 생성한다.

```bash
mysql -u root -p < sql/schema.sql
```

필요 시 샘플 데이터를 넣는다 (선택 사항).

```bash
mysql -u root -p < sql/seed.sql
```

`sql/seed.sql`의 `password_hash` 값은 형식만 보여주는 예시 문자열이며 실제 bcrypt 해시가 아니므로, 해당 계정으로는 로그인할 수 없다. 로그인 테스트가 필요하면 `/register` 화면에서 직접 계정을 생성한다.

## 실행 방법
```bash
# 개발 모드 (nodemon, 파일 변경 시 자동 재시작)
npm run dev

# 프로덕션 모드
npm start
```

서버가 기동되면 `http://localhost:{PORT}` (기본값 3000)으로 접속한다.

## 테스트 실행 방법
테스트는 DB 접근을 모킹하지 않고 `.env`가 가리키는 실제 MySQL을 사용하므로, 실행 전 `sql/schema.sql`이 적용된 DB가 준비되어 있어야 한다.

```bash
npm test
```

## 구현 범위
현재 `app.js`에 라우터가 연결되어 실제로 동작하는 기능은 회원가입/로그인(auth), 상품(products), 채팅(chat), 신고(reports), 관리자(admin), 송금(transfer)이다. 아래 디렉터리 구조에 있는 `routes/users.js`, `controllers/userController.js`, `views/users/`는 아직 라우터에 연결되지 않은 미구현 상태다.

``` tiny-secondhand-platform/
│
├── README.md
├── package.json
├── .gitignore
├── .env
│
├── app.js
├── server.js
│
├── config/
│   ├── db.js
│   ├── session.js
│   └── multer.js
│
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── products.js
│   ├── chat.js
│   ├── reports.js
│   ├── admin.js
│   └── transfer.js
│
├── controllers/
│   ├── authController.js
│   ├── userController.js
│   ├── productController.js
│   ├── chatController.js
│   ├── reportController.js
│   ├── adminController.js
│   └── transferController.js
│
├── services/
│   ├── authService.js
│   ├── productService.js
│   ├── reportService.js
│   └── transferService.js
│
├── models/
│   ├── userModel.js
│   ├── productModel.js
│   ├── reportModel.js
│   ├── messageModel.js
│   └── transferModel.js
│
├── middleware/
│   ├── auth.js
│   ├── admin.js
│   ├── validate.js
│   ├── rateLimiter.js
│   ├── uploadFilter.js
│   └── errorHandler.js
│
├── utils/
│   ├── logger.js
│   ├── sanitizer.js
│   ├── validator.js
│   └── crypto.js
│
├── uploads/
│   └── products/
│
├── public/
│   ├── css/
│   ├── js/
│   └── images/
│
├── views/
│   ├── partials/
│   │     header.ejs
│   │     footer.ejs
│   │
│   ├── auth/
│   │     login.ejs
│   │     register.ejs
│   │
│   ├── users/
│   │     profile.ejs
│   │     users.ejs
│   │
│   ├── products/
│   │     list.ejs
│   │     detail.ejs
│   │     create.ejs
│   │     edit.ejs
│   │
│   ├── chat/
│   │     global.ejs
│   │     dm.ejs
│   │
│   ├── reports/
│   │     report.ejs
│   │
│   ├── admin/
│   │     dashboard.ejs
│   │     users.ejs
│   │     reports.ejs
│   │     products.ejs
│   │
│   └── index.ejs
│
├── sockets/
│   └── chat.js
│
├── sql/
│   ├── schema.sql
│   └── seed.sql
│
└── tests/
    ├── auth.test.js
    ├── product.test.js
    └── security.test.js 
```
## DB

[users]
id
username
email
password_hash
bio
role
status
balance
created_at
updated_at
-status
ACTIVE
SUSPENDED
DORMANT
-role
USERADMIN

[products]
id
title
description
price
seller_id
image
status
created_at
updated_at
-status
SALE
SOLD
DELETED

[reports]id
reporter_id
target_type
target_id
reason
status
created_at
-status
WAITING
APPROVED
REJECTED

[messages]
id
sender_id
receiver_id
room_id
content
created_at(receiver_id가 NULL이면 전체 채팅)

[transfers]
id
sender_id
receiver_id
amount
product_id
created_at