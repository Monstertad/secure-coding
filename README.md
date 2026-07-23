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

`SESSION_SECRET`은 추측 불가능한 무작위 값이어야 하며(미설정 시 서버가 기동되지 않는다), 아래 명령으로 생성해 `.env`에 붙여넣는다.

```bash
openssl rand -hex 32
```

```env
SESSION_SECRET=위에서_생성된_64자리_16진수_문자열
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

## Docker로 MySQL 실행하기 (선택)
로컬에 MySQL/MariaDB를 직접 설치하고 싶지 않다면, Docker로 MySQL만 띄워서 사용할 수 있다. 이 경우 `.env`의 `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`을 아래 컨테이너 설정과 동일하게 맞춰야 한다.

### docker run으로 실행
```bash
docker run -d \
  --name tiny-secondhand-mysql \
  -e MYSQL_ROOT_PASSWORD=root_password \
  -e MYSQL_DATABASE=tiny_secondhand \
  -e MYSQL_USER=app_user \
  -e MYSQL_PASSWORD=app_password \
  -p 3306:3306 \
  -v tiny-secondhand-mysql-data:/var/lib/mysql \
  mysql:8.0
```
`MYSQL_USER`/`MYSQL_PASSWORD`로 지정한 계정은 컨테이너가 처음 생성될 때 `MYSQL_DATABASE`(tiny_secondhand)에 대한 권한과 함께 자동으로 만들어지므로, 아래 "데이터베이스 설정"의 `CREATE USER`/`GRANT` 과정은 생략하고 바로 `schema.sql`을 적용하면 된다.

```bash
# 컨테이너가 완전히 기동될 때까지 몇 초 대기 후 실행
mysql -h127.0.0.1 -P3306 -uroot -proot_password < sql/schema.sql
```

`.env`는 다음과 같이 맞춘다.
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=app_user
DB_PASSWORD=app_password
DB_NAME=tiny_secondhand
```

### docker-compose로 실행
반복 사용한다면 `docker-compose.yml`을 만들어 관리하는 편이 편하다.

```yaml
# docker-compose.yml
services:
  db:
    image: mysql:8.0
    container_name: tiny-secondhand-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: tiny_secondhand
      MYSQL_USER: app_user
      MYSQL_PASSWORD: app_password
    ports:
      - "3306:3306"
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-proot_password"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  db-data:
```

```bash
docker-compose up -d
docker-compose ps                                        # db 서비스가 healthy 상태인지 확인
mysql -h127.0.0.1 -P3306 -uroot -proot_password < sql/schema.sql
```

컨테이너를 완전히 초기화하고 싶다면 `docker-compose down -v`로 볼륨까지 함께 삭제한다.

## 데이터베이스 설정
Docker를 사용하지 않고 로컬에 설치된 MySQL을 그대로 쓴다면, `app_user` 계정이 아직 없으므로 먼저 만들어야 한다 (Docker로 실행했다면 이미 자동 생성되어 있으므로 이 단계는 건너뛴다).

```bash
mysql -u root -p
```
```sql
CREATE USER 'app_user'@'localhost' IDENTIFIED BY '원하는_비밀번호';
GRANT ALL PRIVILEGES ON tiny_secondhand.* TO 'app_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
위에서 설정한 비밀번호를 `.env`의 `DB_PASSWORD`에도 동일하게 넣는다.

이제 `sql/schema.sql`을 실행해 데이터베이스와 테이블을 생성한다.

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

DB에는 로그인 가능한 계정이 아직 하나도 없으므로(위 "데이터베이스 설정" 참고), 처음 접속하면 `http://localhost:3000/register`에서 계정을 직접 만든 뒤 로그인해서 상품 등록/채팅 등 기능을 확인한다.

## 테스트 실행 방법
테스트는 DB 접근을 모킹하지 않고 `.env`가 가리키는 실제 MySQL을 사용하므로, 실행 전 `sql/schema.sql`이 적용된 DB가 준비되어 있어야 한다.

```bash
npm test
```

## 문제 해결 (Troubleshooting)
처음 실행할 때 자주 마주치는 오류와 원인이다.

| 증상 | 원인 / 해결 |
|---|---|
| 서버 실행 시 `SESSION_SECRET 환경변수가 설정되지 않았습니다` 오류 후 종료 | `.env`에 `SESSION_SECRET`이 비어있음. 위 "환경 변수 설정"의 `openssl rand -hex 32`로 값을 채운다. |
| `Error: connect ECONNREFUSED 127.0.0.1:3306` | MySQL이 아직 켜져 있지 않거나 `.env`의 `DB_PORT`가 실제 MySQL 포트와 다름. 로컬 설치라면 MySQL 서비스 실행 여부를, Docker라면 `docker ps`/`docker-compose ps`로 컨테이너 상태와 포트 매핑을 확인한다. |
| `Error: ER_ACCESS_DENIED_ERROR: Access denied for user 'app_user'@'localhost'` | `app_user` 계정이 없거나 `.env`의 `DB_PASSWORD`와 실제 비밀번호가 다름. 위 "데이터베이스 설정"의 `CREATE USER`/`GRANT` 단계를 다시 확인한다. |
| `Error: Unknown database 'tiny_secondhand'` | `sql/schema.sql`을 아직 실행하지 않았음. |
| `Error: listen EADDRINUSE: address already in use :::3000` | 이미 다른 프로세스가 3000번 포트를 쓰고 있음. `.env`의 `PORT`를 다른 값으로 바꾸거나 기존 프로세스를 종료한다. |
| `npm test` 실행 시 계정 생성 관련 테스트가 대량으로 429(rate limit)로 실패 | 테스트가 짧은 시간에 여러 계정을 생성해서 발생. `.env`에 `LOGIN_RATE_LIMIT_MAX`/`REGISTER_RATE_LIMIT_MAX`/`TRANSFER_RATE_LIMIT_MAX`를 넉넉히(예: 1000) 높여서 실행한다. |

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