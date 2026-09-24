/* Chatbot: mặc định trả lời bằng FAQ trong data.json; tự dùng AI khi api/chat.php đã được cấu hình. */
(function () {
  'use strict';

  var API_URL = 'api/chat.php';
  var MAX_HISTORY = 10;
  var TIMEOUT_MS = 25000;

  var cfg, logEl, formEl, inputEl, modeEl, suggestEl;
  var aiAvailable = null; // null = chưa biết, true/false = đã kiểm tra
  var history = [];
  var hollandScores = null; // điểm Holland của học sinh (nếu đã làm trắc nghiệm) để AI trả lời sát hơn
  var hollandPerType = 6;   // số câu mỗi nhóm của bản đã làm (6 = bản 36 câu, 10 = bản 60 câu)
  var busy = false;
  var HISTORY_URL = 'api/history.php';
  var user = null;    // người dùng đã đăng nhập (từ auth.js); khi có thì lịch sử trò chuyện được lưu trên máy chủ
  var loadSeq = 0;    // đánh số lần nạp lịch sử để bỏ qua kết quả đến muộn

  function normalize(s) {
    return ' ' + s
      .toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim() + ' ';
  }

  function faqAnswer(question) {
    var q = normalize(question);
    var best = null, bestScore = 0;
    cfg.faq.forEach(function (item) {
      var score = 0;
      item.keywords.forEach(function (kw) {
        if (q.indexOf(' ' + kw + ' ') !== -1) score += kw.length;
      });
      if (score > bestScore) { bestScore = score; best = item; }
    });
    return best ? best.answer : cfg.fallback;
  }

  function addMessage(role, text) {
    var node = document.createElement('div');
    node.className = 'msg ' + (role === 'user' ? 'msg-user' : 'msg-bot');
    node.textContent = text;
    logEl.appendChild(node);
    logEl.scrollTop = logEl.scrollHeight;
    return node;
  }

  function setMode() {
    modeEl.textContent = (aiAvailable
      ? 'Chế độ: trợ lý AI đang hoạt động.'
      : 'Chế độ: hỏi đáp có sẵn (trợ lý AI chưa được bật).')
      + (user ? ' Lịch sử trò chuyện của bạn đang được lưu.' : ' Đăng nhập bằng Gmail (icon tròn góc phải) để lưu lịch sử trò chuyện.');
  }

  /* ---------- Lịch sử trò chuyện của người dùng đã đăng nhập ---------- */
  function resetChat() {
    loadSeq++;
    history = [];
    logEl.textContent = '';
    addMessage('bot', cfg.welcome);
  }

  function loadHistory() {
    var seq = ++loadSeq;
    fetch(HISTORY_URL, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (seq !== loadSeq || !user || !j || !Array.isArray(j.messages) || !j.messages.length) return;
        var msgs = j.messages.filter(function (m) {
          return m && (m.r === 'user' || m.r === 'assistant') && typeof m.c === 'string' && m.c;
        });
        if (!msgs.length) return;
        logEl.textContent = '';
        addMessage('bot', cfg.welcome);
        var note = document.createElement('div');
        note.className = 'msg-divider';
        note.textContent = 'Lịch sử trò chuyện đã lưu';
        logEl.appendChild(note);
        msgs.forEach(function (m) { addMessage(m.r, m.c); });
        var sep = document.createElement('div');
        sep.className = 'msg-divider';
        sep.textContent = 'Cuộc trò chuyện mới';
        logEl.appendChild(sep);
        history = msgs.slice(-MAX_HISTORY).map(function (m) { return { role: m.r, content: m.c }; });
        // Tin nhắn đầu tiên gửi cho AI phải là của người dùng
        while (history.length && history[0].role !== 'user') history.shift();
        logEl.scrollTop = logEl.scrollHeight;
      })
      .catch(function () {});
  }

  function saveExchange(question, answer) {
    if (!user) return;
    fetch(HISTORY_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'add', q: question, a: answer })
    }).catch(function () {});
  }

  function onAuthChange(u) {
    var was = user;
    user = u || null;
    if (!cfg) return; // init sẽ đọc lại window.Auth.user
    setMode();
    if (user && (!was || was.email !== user.email)) { resetChat(); loadHistory(); }
    else if (!user && was) resetChat();
  }

  function withTimeout(promiseFactory) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    return promiseFactory(ctrl.signal).finally(function () { clearTimeout(timer); });
  }

  function checkAi() {
    return withTimeout(function (signal) {
      return fetch(API_URL + '?ping=1', { signal: signal, headers: { Accept: 'application/json' } });
    })
      .then(function (r) { return r.ok ? r.json() : { ai: false }; })
      .then(function (j) { aiAvailable = !!(j && j.ai === true); })
      .catch(function () { aiAvailable = false; })
      .then(setMode);
  }

  function askAi(question) {
    var messages = history.concat([{ role: 'user', content: question }]).slice(-MAX_HISTORY);
    return withTimeout(function (signal) {
      return fetch(API_URL, {
        method: 'POST',
        signal: signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(hollandScores ? { messages: messages, holland: hollandScores, holland_n: hollandPerType } : { messages: messages })
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && typeof j.reply === 'string' && j.reply) return j.reply;
        var err = new Error(j.error || 'http_' + r.status);
        err.status = r.status;
        throw err;
      });
    });
  }

  function send(question) {
    question = question.trim();
    if (!cfg || !question || busy) return;
    busy = true;
    addMessage('user', question);
    var typing = addMessage('bot', 'Đang soạn câu trả lời…');
    typing.classList.add('msg-typing');

    var work = aiAvailable === false ? Promise.reject(new Error('ai_off')) : askAi(question);
    work.then(function (reply) {
      typing.textContent = reply;
      typing.classList.remove('msg-typing');
      history.push({ role: 'user', content: question }, { role: 'assistant', content: reply });
      history = history.slice(-MAX_HISTORY);
    }).catch(function (err) {
      if (err.status === 429) {
        typing.textContent = 'Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút. Trong lúc chờ, đây là câu trả lời có sẵn:\n\n' + faqAnswer(question);
      } else {
        if (err.status === 503 || err.status === 404 || err.status === 405 || err.status === 501) {
          aiAvailable = false; setMode();
        }
        typing.textContent = faqAnswer(question);
      }
      typing.classList.remove('msg-typing');
    }).then(function () {
      busy = false;
      logEl.scrollTop = logEl.scrollHeight;
      saveExchange(question, typing.textContent);
    });
  }

  function init(chatCfg) {
    cfg = chatCfg;
    logEl = document.getElementById('chatLog');
    formEl = document.getElementById('chatForm');
    inputEl = document.getElementById('chatInput');
    modeEl = document.getElementById('chatMode');
    suggestEl = document.getElementById('chatSuggestions');

    addMessage('bot', cfg.welcome);
    cfg.suggestions.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = s;
      b.addEventListener('click', function () { send(s); });
      suggestEl.appendChild(b);
    });

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = inputEl.value;
      inputEl.value = '';
      send(v);
    });

    window.addEventListener('auth:change', function (e) { onAuthChange(e.detail && e.detail.user); });
    window.addEventListener('auth:history-cleared', function () { if (user) resetChat(); });
    if (window.Auth && window.Auth.user) { user = window.Auth.user; loadHistory(); }

    checkAi();
  }

  function setHolland(scores, perType) { hollandScores = scores; hollandPerType = perType || 6; }
  function isAi() { return aiAvailable === true; }

  window.Chatbot = { init: init, ask: send, setHolland: setHolland, isAi: isAi };
})();
