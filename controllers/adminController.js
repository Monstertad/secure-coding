// 관리자 전용 요청 처리
// - 회원 상태 변경(정지/휴면), 상품 강제 삭제, 신고 처리(승인/반려)

const reportModel = require('../models/reportModel');
const productModel = require('../models/productModel');
const userModel = require('../models/userModel');
const { logEvent } = require('../utils/logger');

const PAGE_SIZE = 20;

function parsePage(rawPage) {
  const page = Number.parseInt(rawPage, 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

async function dashboard(req, res, next) {
  try {
    const [pendingReports, totalUsers, totalProducts] = await Promise.all([
      reportModel.findPending(1000),
      userModel.countAll(),
      productModel.countAllForAdmin(),
    ]);
    res.render('admin/dashboard', {
      pendingReportCount: pendingReports.length,
      totalUsers,
      totalProducts,
    });
  } catch (err) {
    next(err);
  }
}

async function reportList(req, res, next) {
  try {
    const reports = await reportModel.findPending(100);
    res.render('admin/reports', { reports });
  } catch (err) {
    next(err);
  }
}

async function resolveReport(req, res, next) {
  const { action } = req.body;

  try {
    const report = await reportModel.findById(req.params.id);
    if (!report) {
      return res.status(404).render('error', { status: 404, message: '신고를 찾을 수 없습니다.', errors: [] });
    }
    if (report.status !== 'WAITING') {
      return res.status(400).render('error', { status: 400, message: '이미 처리된 신고입니다.', errors: [] });
    }

    if (action === 'approve') {
      if (report.target_type === 'PRODUCT') {
        await productModel.softDeleteProduct(report.target_id);
        logEvent('admin_product_delete', {
          productId: report.target_id,
          adminId: req.session.user.id,
          reportId: report.id,
        });
      } else if (report.target_type === 'USER') {
        if (report.target_id === req.session.user.id) {
          return res
            .status(400)
            .render('error', { status: 400, message: '본인 계정은 휴면 처리할 수 없습니다.', errors: [] });
        }
        await userModel.updateStatus(report.target_id, 'DORMANT');
        logEvent('admin_user_dormant', {
          userId: report.target_id,
          adminId: req.session.user.id,
          reportId: report.id,
        });
      }
      // MESSAGE 유형은 별도 자동 조치 없이 검토(승인) 처리만 기록한다.
      await reportModel.updateStatus(report.id, 'APPROVED');
    } else {
      await reportModel.updateStatus(report.id, 'REJECTED');
      logEvent('admin_report_reject', { reportId: report.id, adminId: req.session.user.id });
    }

    return res.redirect('/admin/reports');
  } catch (err) {
    return next(err);
  }
}

async function userList(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const offset = (page - 1) * PAGE_SIZE;
    const [users, total] = await Promise.all([
      userModel.findAll({ limit: PAGE_SIZE, offset }),
      userModel.countAll(),
    ]);
    res.render('admin/users', {
      users,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    next(err);
  }
}

async function updateUserStatus(req, res, next) {
  const targetId = req.params.id;
  const { status } = req.body;

  try {
    if (targetId === req.session.user.id) {
      return res
        .status(400)
        .render('error', { status: 400, message: '본인 계정 상태는 변경할 수 없습니다.', errors: [] });
    }

    const target = await userModel.findById(targetId);
    if (!target) {
      return res.status(404).render('error', { status: 404, message: '사용자를 찾을 수 없습니다.', errors: [] });
    }

    await userModel.updateStatus(targetId, status);
    logEvent('admin_user_status_change', { userId: targetId, status, adminId: req.session.user.id });
    return res.redirect('/admin/users');
  } catch (err) {
    return next(err);
  }
}

async function productList(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const offset = (page - 1) * PAGE_SIZE;
    const [products, total] = await Promise.all([
      productModel.findAllForAdmin({ limit: PAGE_SIZE, offset }),
      productModel.countAllForAdmin(),
    ]);
    res.render('admin/products', {
      products,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    await productModel.softDeleteProduct(req.params.id);
    logEvent('admin_product_delete', { productId: req.params.id, adminId: req.session.user.id });
    return res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboard,
  reportList,
  resolveReport,
  userList,
  updateUserStatus,
  productList,
  deleteProduct,
};
