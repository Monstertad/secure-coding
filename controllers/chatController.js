// 채팅 페이지 렌더링 및 이전 대화 이력 조회 요청 처리
// - 실제 실시간 통신(메시지 송수신)은 sockets/chat.js에서 처리하고,
//   여기서는 페이지 진입 시 필요한 화면/데이터만 준비한다.

const userModel = require('../models/userModel');

function globalRoom(req, res) {
  res.render('chat/global');
}

async function dmRoom(req, res, next) {
  try {
    const targetId = Number(req.params.userId);

    if (targetId === req.session.user.id) {
      return res.status(400).render('error', {
        status: 400,
        message: '본인과는 대화할 수 없습니다.',
        errors: [],
      });
    }

    const targetUser = await userModel.findById(targetId);
    if (!targetUser) {
      return res.status(404).render('error', { status: 404, message: '사용자를 찾을 수 없습니다.', errors: [] });
    }

    return res.render('chat/dm', { targetUser });
  } catch (err) {
    return next(err);
  }
}

module.exports = { globalRoom, dmRoom };
