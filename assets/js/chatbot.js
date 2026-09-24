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
    modeEl.textContent = aiAvailable
      ? 'Chế độ: trợ lý AI đang hoạt động.'
      : 'Chế độ: hỏi đáp có sẵn (trợ lý AI chưa được bật).';
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

    checkAi();
  }

  function setHolland(scores, perType) { hollandScores = scores; hollandPerType = perType || 6; }
  function isAi() { return aiAvailable === true; }

  window.Chatbot = { init: init, ask: send, setHolland: setHolland, isAi: isAi };
})();
