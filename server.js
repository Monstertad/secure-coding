// HTTP 서버 실행 진입점
// - app.js에서 만든 Express 앱을 로드
// - Socket.IO(sockets/chat.js)를 HTTP 서버에 바인딩
// - 지정된 PORT로 서버 리스닝 시작

const http = require('http');
const app = require('./app');
const { sessionMiddleware } = require('./config/session');
const { initChatSocket } = require('./sockets/chat');
const { logEvent, logError } = require('./utils/logger');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Socket.IO 핸드셰이크에서도 로그인 세션(req.session)을 사용할 수 있도록
// Express와 동일한 세션 미들웨어를 전달한다.
initChatSocket(server, sessionMiddleware);

server.listen(PORT, () => {
  logEvent('server_start', { port: PORT, env: process.env.NODE_ENV || 'development' });
});

process.on('unhandledRejection', (reason) => {
  logError('unhandled_rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

module.exports = server;
