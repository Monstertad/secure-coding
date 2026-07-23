// 신고 처리 비즈니스 로직
// - 중복 신고 방지, 신고 상태(WAITING/APPROVED/REJECTED) 변경 처리

const reportModel = require('../models/reportModel');
const userModel = require('../models/userModel');
const productModel = require('../models/productModel');
const { normalizeInput } = require('../utils/sanitizer');
const { logEvent } = require('../utils/logger');

const REASON_MAX = 1000;
const TARGET_TYPES = new Set(['USER', 'PRODUCT', 'MESSAGE']);

class ReportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ReportError';
    this.status = status;
  }
}

async function assertTargetExists(targetType, targetId) {
  if (targetType === 'USER') {
    const user = await userModel.findById(targetId);
    if (!user) throw new ReportError('신고 대상 사용자를 찾을 수 없습니다.', 404);
    return;
  }
  if (targetType === 'PRODUCT') {
    const product = await productModel.findById(targetId);
    if (!product || product.status === 'DELETED') {
      throw new ReportError('신고 대상 상품을 찾을 수 없습니다.', 404);
    }
    return;
  }
  // MESSAGE: 메시지 단건 조회 모델이 없으므로 존재 여부 확인은 생략하고 신고만 접수한다.
  // (채팅 메시지는 삭제 기능이 없어 신고 후 관리자가 검토만 수행)
}

async function createReport({ reporterId, targetType, targetId, reason }) {
  if (!TARGET_TYPES.has(targetType)) {
    throw new ReportError('잘못된 신고 대상 유형입니다.');
  }
  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw new ReportError('잘못된 대상 번호입니다.');
  }
  if (targetType === 'USER' && targetId === reporterId) {
    throw new ReportError('본인을 신고할 수 없습니다.');
  }

  const normalizedReason = normalizeInput(reason);
  if (!normalizedReason || normalizedReason.length > REASON_MAX) {
    throw new ReportError(`신고 사유는 1~${REASON_MAX}자로 입력해주세요.`);
  }

  await assertTargetExists(targetType, targetId);

  // 동일 대상(target_type + target_id)을 같은 사용자가 이미 신고했다면 중복 신고를 막는다.
  const existingReports = await reportModel.findByReporter(reporterId);
  const alreadyReported = existingReports.some(
    (r) => r.target_type === targetType && r.target_id === targetId
  );
  if (alreadyReported) {
    throw new ReportError('이미 신고한 대상입니다.', 409);
  }

  const reportId = await reportModel.insertReport({
    reporterId,
    targetType,
    targetId,
    reason: normalizedReason,
  });

  logEvent('report_create', { reportId, reporterId, targetType, targetId });
  return reportId;
}

async function listMyReports(reporterId) {
  return reportModel.findByReporter(reporterId);
}

module.exports = { ReportError, createReport, listMyReports };
