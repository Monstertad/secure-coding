// 신고 등록/조회 요청 처리

const reportService = require('../services/reportService');

const VALID_TARGET_TYPES = ['USER', 'PRODUCT', 'MESSAGE'];

function newForm(req, res) {
  const targetType = VALID_TARGET_TYPES.includes(req.query.targetType) ? req.query.targetType : '';
  const targetId = req.query.targetId ? Number(req.query.targetId) : '';

  res.render('reports/report', {
    errors: [],
    values: { targetType, targetId, reason: '' },
    myReports: null,
    submitted: false,
  });
}

async function create(req, res, next) {
  const { targetType, targetId, reason } = req.body;

  try {
    await reportService.createReport({
      reporterId: req.session.user.id,
      targetType,
      targetId: Number(targetId),
      reason,
    });
    return res.redirect('/reports/my?submitted=1');
  } catch (err) {
    if (err instanceof reportService.ReportError) {
      return res.status(err.status).render('reports/report', {
        errors: [err.message],
        values: { targetType, targetId, reason },
        myReports: null,
        submitted: false,
      });
    }
    return next(err);
  }
}

async function myReports(req, res, next) {
  try {
    const reports = await reportService.listMyReports(req.session.user.id);
    res.render('reports/report', {
      errors: [],
      values: { targetType: '', targetId: '', reason: '' },
      myReports: reports,
      submitted: req.query.submitted === '1',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { newForm, create, myReports };
