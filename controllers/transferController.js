// 송금 요청 처리
// - 잔액/입력값 확인 후 services/transferService.js 호출

const transferService = require('../services/transferService');

function sendForm(req, res) {
  const receiverId = req.query.receiverId ? Number(req.query.receiverId) : '';
  res.render('transfer/send', {
    errors: [],
    values: { receiverId, amount: '' },
    history: null,
    sent: false,
  });
}

async function send(req, res, next) {
  const { receiverId, amount } = req.body;

  try {
    await transferService.sendPoints({
      senderId: req.session.user.id,
      receiverId: Number(receiverId),
      amount,
    });
    return res.redirect('/transfer/history?sent=1');
  } catch (err) {
    if (err instanceof transferService.TransferValidationError) {
      return res.status(err.status).render('transfer/send', {
        errors: [err.message],
        values: { receiverId, amount },
        history: null,
        sent: false,
      });
    }
    return next(err);
  }
}

async function history(req, res, next) {
  try {
    const list = await transferService.listHistory(req.session.user.id);
    res.render('transfer/send', {
      errors: [],
      values: { receiverId: '', amount: '' },
      history: list,
      sent: req.query.sent === '1',
    });
  } catch (err) {
    next(err);
  }
}

async function purchase(req, res, next) {
  try {
    await transferService.purchaseProduct({ buyerId: req.session.user.id, productId: req.params.id });
    return res.redirect(`/products/${req.params.id}?purchased=1`);
  } catch (err) {
    if (err instanceof transferService.TransferValidationError) {
      return res.status(err.status).render('error', { status: err.status, message: err.message, errors: [] });
    }
    return next(err);
  }
}

module.exports = { sendForm, send, history, purchase };
