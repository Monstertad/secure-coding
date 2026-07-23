// 회원 정보 관련 비즈니스 로직
// - 마이페이지 조회, 소개글 수정, 비밀번호 변경, 회원 검색

const userModel = require('../models/userModel');
const { hashPassword, comparePassword } = require('../utils/crypto');
const { normalizeInput } = require('../utils/sanitizer');
const { isStrongPassword } = require('../utils/validator');
const { logEvent } = require('../utils/logger');

const BIO_MAX = 500;
const PAGE_SIZE = 20; // 클라이언트가 페이지 크기를 조절하지 못하게 고정 (대량 조회로 인한 자원 고갈 방지)

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UserError';
    this.status = status;
  }
}

async function getProfile(userId) {
  const user = await userModel.findById(userId);
  if (!user) {
    throw new UserError('사용자를 찾을 수 없습니다.', 404);
  }
  return user;
}

async function updateBio({ userId, bio }) {
  const normalizedBio = normalizeInput(bio || '');
  if (normalizedBio.length > BIO_MAX) {
    throw new UserError(`소개글은 최대 ${BIO_MAX}자까지 입력할 수 있습니다.`);
  }

  await userModel.updateBio(userId, normalizedBio || null);
  logEvent('user_bio_update', { userId });
  return normalizedBio;
}

async function changePassword({ userId, currentPassword, newPassword }) {
  const currentHash = await userModel.findPasswordHashById(userId);
  if (!currentHash) {
    throw new UserError('사용자를 찾을 수 없습니다.', 404);
  }

  // 현재 비밀번호 확인 (본인 확인 없이 비밀번호를 바꿀 수 있으면 세션 탈취 시 계정을 완전히 탈취당함)
  const isMatch = await comparePassword(currentPassword, currentHash);
  if (!isMatch) {
    throw new UserError('현재 비밀번호가 일치하지 않습니다.', 401);
  }

  if (!isStrongPassword(newPassword)) {
    throw new UserError('새 비밀번호는 10~72자이며, 영문 대문자/소문자/숫자/특수문자 중 3종류 이상을 포함해야 합니다.');
  }

  const isSamePassword = await comparePassword(newPassword, currentHash);
  if (isSamePassword) {
    throw new UserError('새 비밀번호는 현재 비밀번호와 달라야 합니다.');
  }

  // bcrypt 재해시 (평문 비밀번호는 어디에도 저장하지 않는다)
  const newHash = await hashPassword(newPassword);
  await userModel.updatePasswordHash(userId, newHash);
  logEvent('user_password_change', { userId });
}

async function searchUsers({ q, page }) {
  const keyword = q ? normalizeInput(q).slice(0, 50) : '';

  const parsedPage = Number.parseInt(page, 10);
  const pageNum = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const offset = (pageNum - 1) * PAGE_SIZE;

  const { items, total } = await userModel.searchPublic({ keyword, limit: PAGE_SIZE, offset });

  return {
    items,
    total,
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    keyword,
  };
}

module.exports = { UserError, getProfile, updateBio, changePassword, searchUsers };
