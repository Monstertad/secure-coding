-- DB 테이블 스키마 정의
-- users, products, reports, messages, transfers 테이블 생성 스크립트
--
-- 공통 원칙
-- - 문자셋: utf8mb4 (한글/이모지 등 전체 유니코드 지원)
-- - 엔진: InnoDB (FK 제약, 트랜잭션 필수 - 특히 transfers 처리 시 잔액 검증/커밋/롤백에 사용)
-- - 금액(price, amount, balance)은 부동소수점 오차를 피하기 위해 DECIMAL 사용 (FLOAT/DOUBLE 금지)
-- - 회원/상품은 실제 DELETE 대신 status 컬럼으로 논리 삭제(soft delete) 처리 → FK 참조 무결성 및 이력 보존
-- - CHECK 제약은 애플리케이션 레벨 검증(express-validator 등)을 대체하지 않는 최후 방어선(Defense in Depth)

CREATE DATABASE IF NOT EXISTS tiny_secondhand
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tiny_secondhand;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(30)   NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  password_hash CHAR(60)      NOT NULL,             -- bcrypt 해시는 항상 60자 고정 길이
  bio           VARCHAR(500)  NULL,
  role          ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
  status        ENUM('ACTIVE', 'SUSPENDED', 'DORMANT') NOT NULL DEFAULT 'ACTIVE',
  balance       DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT chk_users_balance_non_negative CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- products
-- ------------------------------------------------------------
CREATE TABLE products (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200)  NOT NULL,
  description TEXT          NULL,
  price       DECIMAL(15, 2) NOT NULL,
  seller_id   INT UNSIGNED  NOT NULL,
  image       VARCHAR(255)  NULL,                   -- 실제 파일 경로가 아닌 저장된 파일명만 기록 (Path Traversal 방지)
  status      ENUM('SALE', 'SOLD', 'DELETED') NOT NULL DEFAULT 'SALE',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_products_seller_id (seller_id),
  KEY idx_products_status (status),
  CONSTRAINT fk_products_seller
    FOREIGN KEY (seller_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_products_price_non_negative CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- reports
-- target_type/target_id는 신고 대상이 회원/상품/채팅 메시지로 다양하므로
-- 폴리모픽 참조로 설계 (단일 FK를 걸 수 없어 애플리케이션 계층에서 대상 존재 여부를 검증)
-- ------------------------------------------------------------
CREATE TABLE reports (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_id INT UNSIGNED NOT NULL,
  target_type ENUM('USER', 'PRODUCT', 'MESSAGE') NOT NULL,
  target_id   INT UNSIGNED NOT NULL,
  reason      VARCHAR(1000) NOT NULL,
  status      ENUM('WAITING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'WAITING',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_reports_target (target_type, target_id),
  KEY idx_reports_status (status),
  CONSTRAINT fk_reports_reporter
    FOREIGN KEY (reporter_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- messages
-- receiver_id가 NULL이면 전체 채팅, 값이 있으면 1:1 DM
-- ------------------------------------------------------------
CREATE TABLE messages (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id   INT UNSIGNED NOT NULL,
  receiver_id INT UNSIGNED NULL,
  room_id     VARCHAR(100) NULL,                    -- 1:1 DM 방 구분자 (예: 두 사용자 id 조합); 전체 채팅은 NULL
  content     VARCHAR(2000) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_messages_room_id (room_id),
  KEY idx_messages_sender_receiver (sender_id, receiver_id),
  CONSTRAINT fk_messages_sender
    FOREIGN KEY (sender_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_messages_receiver
    FOREIGN KEY (receiver_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- transfers
-- ------------------------------------------------------------
CREATE TABLE transfers (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id   INT UNSIGNED NOT NULL,
  receiver_id INT UNSIGNED NOT NULL,
  amount      DECIMAL(15, 2) NOT NULL,
  product_id  INT UNSIGNED NULL,                    -- 상품 거래에 연계된 송금이 아니면 NULL
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_transfers_sender_id (sender_id),
  KEY idx_transfers_receiver_id (receiver_id),
  KEY idx_transfers_product_id (product_id),
  CONSTRAINT fk_transfers_sender
    FOREIGN KEY (sender_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_transfers_receiver
    FOREIGN KEY (receiver_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_transfers_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT chk_transfers_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_transfers_sender_receiver_diff CHECK (sender_id <> receiver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
