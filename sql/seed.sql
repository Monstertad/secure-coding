-- 개발/테스트용 초기 데이터 삽입 스크립트
-- 주의: 아래 password_hash 값은 로컬 개발 환경 전용 예시이며, 운영 환경에는 절대 사용하지 않는다.
-- 실제 값은 bcrypt로 해시된 문자열이어야 하며(예: utils/crypto.js), 평문 비밀번호를 절대 저장하지 않는다.

USE tiny_secondhand;

INSERT INTO users (username, email, password_hash, role, status, balance) VALUES
  ('admin',  'admin@example.com',  '$2b$12$examplebcrypthashadminaccount0000000000000000000000', 'ADMIN', 'ACTIVE', 0),
  ('alice',  'alice@example.com',  '$2b$12$examplebcrypthashaliceaccount0000000000000000000000', 'USER',  'ACTIVE', 50000),
  ('bob',    'bob@example.com',    '$2b$12$examplebcrypthashbobaccount00000000000000000000000',  'USER',  'ACTIVE', 10000);

INSERT INTO products (title, description, price, seller_id, status) VALUES
  ('중고 노트북',   '2년 사용한 노트북입니다. 상태 양호.', 350000, 2, 'SALE'),
  ('전공 서적 세트', '자료구조/알고리즘 전공서 3권 세트.',  20000,  3, 'SALE');

INSERT INTO messages (sender_id, receiver_id, room_id, content) VALUES
  (2, NULL, NULL, '안녕하세요, 전체 채팅방입니다.'),
  (3, 2,    'dm-2-3', '노트북 아직 판매중인가요?');

INSERT INTO transfers (sender_id, receiver_id, amount, product_id) VALUES
  (3, 2, 350000, 1);
