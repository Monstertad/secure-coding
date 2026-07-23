// 송금 처리 비즈니스 로직
// - 잔액 검증, 트랜잭션(commit/rollback) 처리
// - 송금 기록 저장 및 로그(utils/logger.js) 기록

const transferModel = require('../models/transferModel');
const userModel = require('../models/userModel');
const { logEvent } = require('../utils/logger');

const AMOUNT_MAX = 100000000; // 1억
const HISTORY_LIMIT = 50;

class TransferValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'TransferValidationError';
    this.status = status;
  }
}

function assertValidAmount(amount) {
  // 부동소수점 오차로 오탐하지 않도록, 숫자로 변환하기 전에 문자열 형태로
  // "정수부 + 소수점 둘째 자리까지"만 허용되는지 먼저 검사한다 (DECIMAL(15,2)와 일치).
  const str = String(amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new TransferValidationError('송금액은 소수점 둘째 자리까지의 숫자로 입력해주세요.');
  }
  const numeric = Number(str);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > AMOUNT_MAX) {
    throw new TransferValidationError('송금액은 0보다 크고 1억 이하의 숫자여야 합니다.');
  }
}

function mapTransferError(err) {
  if (err instanceof transferModel.TransferError) {
    const status = err.code.endsWith('_NOT_FOUND') ? 404 : 400;
    return new TransferValidationError(err.message, status);
  }
  return err;
}

async function sendPoints({ senderId, receiverId, amount }) {
  if (!Number.isInteger(receiverId) || receiverId <= 0) {
    throw new TransferValidationError('잘못된 받는 사람입니다.');
  }
  if (receiverId === senderId) {
    throw new TransferValidationError('본인에게는 송금할 수 없습니다.');
  }
  assertValidAmount(amount);

  const receiver = await userModel.findById(receiverId);
  if (!receiver) {
    throw new TransferValidationError('받는 사람을 찾을 수 없습니다.', 404);
  }

  try {
    const transferId = await transferModel.sendPoints({
      senderId,
      receiverId,
      amount: Number(amount).toFixed(2),
    });
    logEvent('transfer_send', { transferId, senderId, receiverId, amount });
    return transferId;
  } catch (err) {
    throw mapTransferError(err);
  }
}

async function purchaseProduct({ buyerId, productId }) {
  try {
    const result = await transferModel.purchaseProduct({ buyerId, productId });
    logEvent('transfer_purchase', {
      transferId: result.transferId,
      productId,
      buyerId,
      sellerId: result.sellerId,
      amount: result.amount,
    });
    return result;
  } catch (err) {
    throw mapTransferError(err);
  }
}

async function listHistory(userId) {
  return transferModel.findHistoryForUser(userId, HISTORY_LIMIT);
}

module.exports = { TransferValidationError, sendPoints, purchaseProduct, listHistory };
