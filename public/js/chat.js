(function () {
  // 페이지 진입 정보는 인라인 <script>가 아니라 .chat-page 요소의 data-* 속성으로 전달된다.
  // (Helmet CSP의 script-src 'self'가 인라인 스크립트를 차단하기 때문)
  var pageEl = document.querySelector('.chat-page');
  if (!pageEl) return;

  var config = {
    mode: pageEl.dataset.mode,
    currentUserId: Number(pageEl.dataset.currentUserId),
    targetUserId: pageEl.dataset.targetUserId ? Number(pageEl.dataset.targetUserId) : null,
  };

  var socket = io();
  var messagesEl = document.getElementById('chat-messages');
  var formEl = document.getElementById('chat-form');
  var inputEl = document.getElementById('chat-input');

  function renderMessage(msg) {
    var wrapper = document.createElement('div');
    wrapper.className = 'chat-message' + (msg.senderId === config.currentUserId ? ' chat-message-mine' : '');

    var meta = document.createElement('div');
    meta.className = 'chat-message-meta';
    meta.textContent = msg.senderUsername + ' · ' + new Date(msg.createdAt).toLocaleTimeString('ko-KR');

    var body = document.createElement('div');
    body.className = 'chat-message-body';
    // 반드시 textContent만 사용한다 (innerHTML 사용 금지 - 저장형 XSS 방지).
    body.textContent = msg.content;

    wrapper.appendChild(meta);
    wrapper.appendChild(body);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderHistory(history) {
    messagesEl.innerHTML = '';
    history.forEach(renderMessage);
  }

  function showError(message) {
    var el = document.createElement('div');
    el.className = 'chat-error';
    el.textContent = message;
    messagesEl.appendChild(el);
  }

  socket.on('connect_error', function () {
    showError('연결에 실패했습니다. 다시 로그인해주세요.');
  });
  socket.on('chat:error', function (payload) {
    showError(payload && payload.message ? payload.message : '오류가 발생했습니다.');
  });

  if (config.mode === 'global') {
    socket.on('chat:global:history', renderHistory);
    socket.on('chat:global:message', renderMessage);

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var content = inputEl.value.trim();
      if (!content) return;
      socket.emit('chat:global:send', { content: content });
      inputEl.value = '';
    });
  } else if (config.mode === 'dm') {
    socket.on('connect', function () {
      socket.emit('chat:dm:join', { targetUserId: config.targetUserId });
    });
    socket.on('chat:dm:history', function (payload) {
      renderHistory(payload.history);
    });
    socket.on('chat:dm:message', renderMessage);

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var content = inputEl.value.trim();
      if (!content) return;
      socket.emit('chat:dm:send', { targetUserId: config.targetUserId, content: content });
      inputEl.value = '';
    });
  }
})();
