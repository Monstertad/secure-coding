// Socket.IO 실시간 채팅 처리
// - 전체 채팅방 브로드캐스트, 1:1 DM 채팅 이벤트 처리
// - 연결 시 세션 기반 인증 확인

const { Server } = require('socket.io');

const messageModel = require('../models/messageModel');
const userModel = require('../models/userModel');
const { normalizeInput } = require('../utils/sanitizer');
const { logEvent, logError } = require('../utils/logger');

const GLOBAL_ROOM = 'global';
const HISTORY_LIMIT = 50;
const MESSAGE_MAX_LENGTH = 2000;

// 소켓당 flood 방지: RATE_LIMIT_WINDOW_MS 동안 RATE_LIMIT_MAX건 초과 전송 시 거부
const RATE_LIMIT_WINDOW_MS = 3000;
const RATE_LIMIT_MAX = 5;

// 항상 (내 세션의 userId, 상대 userId)로 구성되므로, 제3자가 임의로 남의 대화방 id를
// 추측해 join하더라도 자신이 당사자가 아닌 방에는 절대 들어갈 수 없다 (서버가 생성하는
// 방 id는 요청자 본인의 세션 id를 반드시 포함하기 때문).
function buildDmRoomId(idA, idB) {
  const [a, b] = [idA, idB].sort((x, y) => x - y);
  return `dm:${a}:${b}`;
}

function isRateLimited(socket) {
  const now = Date.now();
  const recent = (socket.data.messageTimestamps || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  socket.data.messageTimestamps = recent;
  return recent.length > RATE_LIMIT_MAX;
}

function sanitizeContent(raw) {
  return normalizeInput(String(raw ?? '')).slice(0, MESSAGE_MAX_LENGTH);
}

function initChatSocket(server, sessionMiddleware) {
  const io = new Server(server, {
    // 이 채팅은 세션 쿠키 기반 인증에 의존한다. Origin 검증 없이 WebSocket 핸드셰이크를
    // 허용하면 악성 사이트가 피해자의 브라우저를 통해 세션 쿠키를 실어 소켓 연결을
    // 시도하는 Cross-Site WebSocket Hijacking(CSWSH)이 가능해지므로 동일 출처만 허용한다.
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      const host = req.headers.host;
      const allowed = !origin || origin === `http://${host}` || origin === `https://${host}`;
      callback(null, allowed);
    },
  });

  // Express 세션 미들웨어를 Socket.IO 핸드셰이크 단계에서도 실행되게 하여
  // socket.request.session으로 로그인 세션에 접근할 수 있게 한다.
  io.engine.use(sessionMiddleware);

  io.use((socket, next) => {
    const session = socket.request.session;
    if (!session || !session.user) {
      return next(new Error('unauthorized'));
    }
    socket.data.user = session.user;
    return next();
  });

  io.on('connection', (socket) => {
    const { id: userId, username } = socket.data.user;
    logEvent('chat_connect', { userId });

    socket.join(GLOBAL_ROOM);
    messageModel
      .getGlobalHistory(HISTORY_LIMIT)
      .then((history) => socket.emit('chat:global:history', history))
      .catch((err) => logError('chat_history_error', err, { userId }));

    socket.on('chat:global:send', async (payload) => {
      try {
        if (isRateLimited(socket)) {
          socket.emit('chat:error', { message: '메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해주세요.' });
          return;
        }
        const content = sanitizeContent(payload && payload.content);
        if (!content) return;

        const messageId = await messageModel.insertMessage({
          senderId: userId,
          receiverId: null,
          roomId: null,
          content,
        });

        io.to(GLOBAL_ROOM).emit('chat:global:message', {
          id: messageId,
          senderId: userId,
          senderUsername: username,
          content,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        logError('chat_global_send_error', err, { userId });
        socket.emit('chat:error', { message: '메시지 전송 중 오류가 발생했습니다.' });
      }
    });

    socket.on('chat:dm:join', async (payload) => {
      try {
        const targetId = Number(payload && payload.targetUserId);
        if (!Number.isInteger(targetId) || targetId <= 0 || targetId === userId) {
          socket.emit('chat:error', { message: '잘못된 요청입니다.' });
          return;
        }

        const targetUser = await userModel.findById(targetId);
        if (!targetUser) {
          socket.emit('chat:error', { message: '대화 상대를 찾을 수 없습니다.' });
          return;
        }

        const roomId = buildDmRoomId(userId, targetId);
        socket.join(roomId);
        // 이 소켓이 현재 참여 중인 DM 방을 기록해, 이후 send 이벤트에서 join 여부를 검증한다.
        socket.data.dmRoomId = roomId;
        socket.data.dmTargetId = targetId;

        const history = await messageModel.getDmHistory(roomId, HISTORY_LIMIT);
        socket.emit('chat:dm:history', { roomId, history });
      } catch (err) {
        logError('chat_dm_join_error', err, { userId });
        socket.emit('chat:error', { message: 'DM 입장 중 오류가 발생했습니다.' });
      }
    });

    socket.on('chat:dm:send', async (payload) => {
      try {
        if (isRateLimited(socket)) {
          socket.emit('chat:error', { message: '메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해주세요.' });
          return;
        }

        const targetId = Number(payload && payload.targetUserId);
        // join 이벤트로 미리 입장한 방과 일치하는 경우에만 전송을 허용한다.
        // (클라이언트가 join 없이 임의의 상대 id로 바로 send를 시도하는 것을 차단)
        if (!socket.data.dmRoomId || targetId !== socket.data.dmTargetId) {
          socket.emit('chat:error', { message: '먼저 대화방에 입장해주세요.' });
          return;
        }

        const content = sanitizeContent(payload && payload.content);
        if (!content) return;

        const roomId = socket.data.dmRoomId;
        const messageId = await messageModel.insertMessage({
          senderId: userId,
          receiverId: targetId,
          roomId,
          content,
        });

        io.to(roomId).emit('chat:dm:message', {
          id: messageId,
          roomId,
          senderId: userId,
          senderUsername: username,
          content,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        logError('chat_dm_send_error', err, { userId });
        socket.emit('chat:error', { message: '메시지 전송 중 오류가 발생했습니다.' });
      }
    });

    socket.on('disconnect', () => {
      logEvent('chat_disconnect', { userId });
    });
  });

  return io;
}

module.exports = { initChatSocket, buildDmRoomId };
