/* Trắc nghiệm Holland (RIASEC): làm bài, chấm điểm ngay trên trình duyệt, xem kết quả, nhờ AI phân tích,
   gửi ẩn danh (khi học sinh đồng ý) và xuất PDF. Nội dung câu hỏi nằm trong data/holland.json. */
(function () {
  'use strict';

  var ORDER = ['R', 'I', 'A', 'S', 'E', 'C'];
  /* Hai chế độ: 'short' (36 câu, 6 câu/nhóm) và 'full' (60 câu, 10 câu/nhóm).
     Điểm mỗi nhóm nằm từ perType (toàn 1) đến perType * 5 (toàn 5). */
  var DEFAULT_MODES = {
    short: { label: 'Bản rút gọn', perType: 6, minutes: 5 },
    full: { label: 'Bản đầy đủ', perType: 10, minutes: 10 }
  };
  var MODE_NOTE = {
    short: 'Nhanh gọn, phù hợp để khám phá ban đầu.',
    full: 'Mỗi nhóm 10 câu nên kết quả ổn định và đáng tin cậy hơn.'
  };

  var cfg, app;
  var mode = 'short';
  var qs = [];      // danh sách câu của chế độ đang chọn
  var perType = 6;  // số câu mỗi nhóm của chế độ đang chọn
  var answers = [];
  var index = 0;
  var sums = null;
  var hasAi = false;
  var canCollect = false;
  var submitted = false;
  var keyHandler = null;
  var view = 'intro';   // 'intro' | 'quiz' | 'result': màn hình đang hiển thị
  var saveNote = null;  // dòng thông báo lưu kết quả vào tài khoản trên màn hình kết quả
  var RESULTS_URL = 'api/results.php';

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'text') node.textContent = props[k];
        else if (k === 'class') node.className = props[k];
        else node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function modes() { return cfg.modes || DEFAULT_MODES; }

  function questionsFor(m) {
    return cfg.questions.filter(function (q) { return m === 'full' || !q.f; });
  }

  function setMode(m) {
    mode = m;
    qs = questionsFor(m);
    perType = modes()[m].perType;
  }

  function typeOf(code) {
    return cfg.types.filter(function (t) { return t.code === code; })[0];
  }

  function fmtDate(d) {
    d = d || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function setView(nodes) {
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    app.textContent = '';
    nodes.forEach(function (n) { app.appendChild(n); });
  }

  /* ---------- Chấm điểm ---------- */
  function compute() {
    var totals = {};
    ORDER.forEach(function (c) { totals[c] = 0; });
    qs.forEach(function (q, i) { totals[q.t] += answers[i]; });
    return ORDER.map(function (c) { return totals[c]; });
  }

  function rankedTypes(scores) {
    return ORDER.map(function (c, i) { return { code: c, score: scores[i], i: i }; })
      .sort(function (a, b) { return (b.score - a.score) || (a.i - b.i); });
  }

  function percent(score) { return Math.round(((score - perType) / (perType * 4)) * 1000) / 10; }

  /* ---------- Màn hình giới thiệu ---------- */
  function showIntro() {
    view = 'intro';
    answers = [];
    index = 0;
    sums = null;
    submitted = false;
    if (window.Chatbot) window.Chatbot.setHolland(null);

    var list = el('ul', { class: 'checklist' }, [
      el('li', { text: 'Không có đáp án đúng hay sai – hãy chọn theo cảm nhận thật của bạn.' }),
      el('li', { text: 'Kết quả chỉ để tham khảo và khám phá bản thân, không phải kết luận cuối cùng.' })
    ]);

    var modeGrid = el('div', { class: 'mode-grid', role: 'group', 'aria-label': 'Chọn bản trắc nghiệm' });
    ['short', 'full'].forEach(function (m) {
      if (m === 'full' && questionsFor('full').length <= questionsFor('short').length) return; // dữ liệu chưa có câu bổ sung
      var info = modes()[m];
      var card = el('button', { class: 'mode-card', type: 'button', 'data-mode': m }, [
        el('span', { class: 'mode-name', text: info.label }),
        el('span', { class: 'mode-count', text: questionsFor(m).length + ' câu' }),
        el('span', { class: 'mode-meta', text: 'Khoảng ' + info.minutes + ' phút · mỗi nhóm ' + info.perType + ' câu' }),
        el('span', { class: 'muted small', text: MODE_NOTE[m] }),
        el('span', { class: 'mode-go', text: 'Bắt đầu làm bài →' })
      ]);
      card.addEventListener('click', function () { setMode(m); index = 0; showQuestion(); });
      modeGrid.appendChild(card);
    });

    var savedHost = el('div', { class: 'saved-host' });

    setView([el('div', { class: 'card holland-intro' }, [
      el('h3', { text: 'Trắc nghiệm sở thích nghề nghiệp Holland (RIASEC)' }),
      el('p', { class: 'muted', text: 'Theo lý thuyết Holland, sở thích nghề nghiệp chia thành 6 nhóm: Kỹ thuật (R), Nghiên cứu (I), Nghệ thuật (A), Xã hội (S), Quản lý – Kinh doanh (E) và Nghiệp vụ (C). Trả lời các câu hỏi để xem nhóm nào nổi bật ở bạn.' }),
      list,
      el('h4', { class: 'mode-title', text: 'Chọn bản trắc nghiệm' }),
      modeGrid,
      el('p', { class: 'muted small', text: 'Điểm được tính ngay trên trình duyệt của bạn. Nếu bạn đã đăng nhập, kết quả sẽ được lưu vào tài khoản để xem lại; ngoài ra không tự động gửi đi đâu.' }),
      savedHost
    ])]);
    loadSaved(savedHost);
  }

  /* ---------- Kết quả đã lưu trong tài khoản ---------- */
  function signedIn() { return !!(window.Auth && window.Auth.user); }

  function validSaved(r) {
    if (!r || typeof r.t !== 'number' || !modes()[r.m] || !Array.isArray(r.s) || r.s.length !== 6) return false;
    var per = modes()[r.m].perType;
    return r.s.every(function (v) { return typeof v === 'number' && v >= per && v <= per * 5; });
  }

  function savedCode(r) {
    return rankedTypes(r.s).slice(0, 3).map(function (x) { return x.code; }).join('');
  }

  function loadSaved(host) {
    if (!signedIn()) return;
    fetch(RESULTS_URL, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !Array.isArray(j.results) || !host.isConnected) return;
        var list = j.results.filter(validSaved).reverse(); // mới nhất trước
        if (list.length) renderSaved(host, list);
      })
      .catch(function () {});
  }

  function renderSaved(host, list) {
    host.textContent = '';
    host.appendChild(el('h4', { class: 'mode-title', text: 'Kết quả đã lưu của bạn (' + list.length + ')' }));
    var ul = el('ul', { class: 'saved-list' });
    list.forEach(function (r) {
      var info = modes()[r.m];
      var open = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Xem' });
      open.addEventListener('click', function () { showSaved(r); app.scrollIntoView({ block: 'start' }); });
      var del = el('button', { class: 'link-btn', type: 'button', text: 'Xóa' });
      del.addEventListener('click', function () {
        if (!window.confirm('Xóa kết quả này khỏi tài khoản của bạn?')) return;
        del.disabled = true;
        fetch(RESULTS_URL, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ action: 'delete', t: r.t })
        }).then(function (res) {
          if (!res.ok) { del.disabled = false; return; }
          var left = list.filter(function (x) { return x !== r; });
          if (left.length) renderSaved(host, left); else host.textContent = '';
        }).catch(function () { del.disabled = false; });
      });
      ul.appendChild(el('li', { class: 'saved-item' }, [
        el('span', { class: 'saved-code', text: savedCode(r) }),
        el('span', { class: 'saved-meta' }, [
          el('span', { text: fmtDate(new Date(r.t * 1000)) }),
          el('span', { class: 'muted small', text: info.label + ' (' + (info.perType * 6) + ' câu)' })
        ]),
        el('span', { class: 'saved-actions' }, [open, del])
      ]));
    });
    host.appendChild(ul);
  }

  /* Lưu kết quả vừa làm vào tài khoản (nếu đã đăng nhập) */
  function saveResult() {
    if (!saveNote) return;
    if (!signedIn()) return;
    saveNote.textContent = 'Đang lưu kết quả vào tài khoản…';
    fetch(RESULTS_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'add', mode: mode, scores: sums })
    }).then(function (r) {
      saveNote.textContent = r.ok
        ? 'Đã lưu kết quả này vào tài khoản của bạn. Lần sau đăng nhập, bạn xem lại được ở màn hình đầu của trắc nghiệm.'
        : 'Chưa lưu được kết quả vào tài khoản, vui lòng thử lại sau. Kết quả vẫn hiển thị trên màn hình.';
    }).catch(function () {
      saveNote.textContent = 'Chưa lưu được kết quả vào tài khoản, vui lòng kiểm tra kết nối rồi thử lại.';
    });
  }

  function showSaved(r) {
    setMode(r.m);
    sums = r.s.slice();
    if (window.Chatbot) window.Chatbot.setHolland(sums, perType);
    showResult({ savedAt: r.t });
  }

  /* ---------- Màn hình câu hỏi ---------- */
  function showQuestion() {
    view = 'quiz';
    var total = qs.length;
    var q = qs[index];

    var fill = el('div', { class: 'q-fill' });
    fill.style.width = (index / total) * 100 + '%';
    requestAnimationFrame(function () { fill.style.width = ((index + 1) / total) * 100 + '%'; });

    var heading = el('h3', { class: 'q-text', tabindex: '-1', text: q.q });
    var group = el('div', { class: 'q-options', role: 'radiogroup', 'aria-labelledby': 'qPrompt' });
    cfg.scale.forEach(function (label, k) {
      var value = k + 1;
      var chosen = answers[index] === value;
      var btn = el('button', { class: 'q-opt' + (chosen ? ' is-chosen' : ''), type: 'button', role: 'radio', 'aria-checked': String(chosen) }, [
        el('b', { text: String(value) }),
        el('span', { text: label })
      ]);
      btn.addEventListener('click', function () { choose(value); });
      group.appendChild(btn);
    });

    var back = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Quay lại' });
    if (index === 0) back.disabled = true;
    back.addEventListener('click', function () { if (index > 0) { index--; showQuestion(); } });

    var restart = el('button', { class: 'link-btn', type: 'button', text: 'Thoát' });
    restart.addEventListener('click', showIntro);

    setView([el('div', { class: 'card holland-quiz' }, [
      el('div', { class: 'q-head' }, [
        el('span', { class: 'q-count', 'aria-live': 'polite', text: 'Câu ' + (index + 1) + ' / ' + total }),
        restart
      ]),
      el('div', { class: 'q-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(index + 1) }, [fill]),
      el('p', { class: 'q-prompt muted', id: 'qPrompt', text: 'Bạn thích hoạt động này đến mức nào?' }),
      heading,
      group,
      el('div', { class: 'q-nav' }, [back, el('span', { class: 'muted small', text: 'Mẹo: nhấn phím 1–5 để chọn nhanh' })])
    ])]);

    heading.focus({ preventScroll: true });

    keyHandler = function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= 5 && app.contains(document.activeElement)) choose(n);
    };
    document.addEventListener('keydown', keyHandler);
  }

  var choosing = false;
  function choose(value) {
    if (choosing) return;
    choosing = true;
    answers[index] = value;
    var opts = app.querySelectorAll('.q-opt');
    opts.forEach(function (b, k) {
      var on = k + 1 === value;
      b.classList.toggle('is-chosen', on);
      b.setAttribute('aria-checked', String(on));
    });
    setTimeout(function () {
      choosing = false;
      if (index < qs.length - 1) { index++; showQuestion(); } else { finish(); }
    }, 220);
  }

  function finish() {
    sums = compute();
    if (window.Chatbot) window.Chatbot.setHolland(sums, perType);
    showResult({});
    saveResult();
    app.scrollIntoView({ block: 'start' });
  }

  /* ---------- Màn hình kết quả ---------- */
  function suggestedGroups(top) {
    var weight = {}, firstSeen = {}, n = 0;
    top.forEach(function (r, rank) {
      typeOf(r.code).groups.forEach(function (g) {
        weight[g] = (weight[g] || 0) + (3 - rank);
        if (!(g in firstSeen)) firstSeen[g] = n++;
      });
    });
    return Object.keys(weight).sort(function (a, b) { return (weight[b] - weight[a]) || (firstSeen[a] - firstSeen[b]); }).slice(0, 4);
  }

  function showResult(opts) {
    opts = opts || {};
    view = 'result';
    var ranked = rankedTypes(sums);
    var top = ranked.slice(0, 3);
    var code = top.map(function (r) { return r.code; }).join('');
    var pcts = sums.map(percent);
    var spread = ranked[0].score - ranked[5].score;

    /* Đầu trang kết quả */
    var head = el('div', { class: 'res-head' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Kết quả trắc nghiệm Holland' }),
        el('div', { class: 'holland-code', text: code }),
        el('p', { class: 'muted', text: top.map(function (r) { return typeOf(r.code).name; }).join(' · ') })
      ]),
      el('p', { class: 'muted small res-date', text: 'Ngày làm bài: ' + fmtDate(opts.savedAt ? new Date(opts.savedAt * 1000) : new Date()) + ' · ' + modes()[mode].label + ' (' + qs.length + ' câu)' })
    ]);

    /* Biểu đồ */
    var radarHost = el('figure', { class: 'card chart is-visible res-radar' });
    radarHost.appendChild(el('h3', { text: 'Hồ sơ sở thích của bạn' }));
    window.Charts.radar(radarHost, ORDER, pcts, 'Biểu đồ radar 6 nhóm Holland');

    var barsHost = el('figure', { class: 'card chart is-visible' });
    window.Charts.hbars(barsHost, {
      title: 'Điểm từng nhóm',
      caption: 'Thang 0–100% (từ điểm ' + perType + ' đến ' + perType * 5 + ' của mỗi nhóm)',
      options: cfg.types.map(function (t) { return t.code + ' – ' + t.name; }),
      sort: false
    }, pcts);

    var flat = spread <= perType * 2 / 3 ? el('p', { class: 'notice' }, [document.createTextNode('Điểm các nhóm khá gần nhau nên mã Holland chưa phân hoá rõ. Bạn có thể làm lại và cân nhắc kỹ hơn, hoặc xem cả các nhóm xếp sau.')]) : null;

    /* Ba nhóm nổi bật */
    var cards = el('div', { class: 'res-types' });
    top.forEach(function (r, rank) {
      var t = typeOf(r.code);
      cards.appendChild(el('article', { class: 'card res-type' }, [
        el('div', { class: 'res-type-top' }, [
          el('span', { class: 'res-badge', text: t.code }),
          el('div', {}, [el('h3', { text: t.name }), el('p', { class: 'muted small', text: '#' + (rank + 1) + ' · ' + t.en + ' · ' + pcts[ORDER.indexOf(t.code)].toString().replace('.', ',') + '%' })])
        ]),
        el('p', { class: 'muted', text: t.desc }),
        el('div', { class: 'chips-static' }, t.traits.map(function (x) { return el('span', { text: x }); }))
      ]));
    });

    /* Gợi ý ngành, nghề */
    var groups = suggestedGroups(top);
    var jobs = [];
    top.slice(0, 2).forEach(function (r) { typeOf(r.code).jobs.forEach(function (j) { if (jobs.indexOf(j) === -1) jobs.push(j); }); });
    var suggest = el('div', { class: 'card' }, [
      el('h3', { text: 'Nhóm ngành có thể phù hợp' }),
      el('p', { class: 'muted small', text: 'Theo 10 nhóm ngành trong khảo sát của đề tài.' }),
      el('div', { class: 'chips-static chips-big' }, groups.map(function (g) { return el('span', { text: g }); })),
      el('h3', { class: 'mt', text: 'Ví dụ nghề nghiệp' }),
      el('ul', { class: 'checklist' }, jobs.slice(0, 6).map(function (j) { return el('li', { text: j }); }))
    ]);

    var disclaimer = el('p', { class: 'notice', text: 'Lưu ý: trắc nghiệm Holland là công cụ khám phá sở thích, không đánh giá năng lực và không phải kết luận cuối cùng. Hãy kết hợp với thông tin ngành nghề, trải nghiệm thực tế và trao đổi cùng thầy cô, gia đình.' });

    /* Phân tích bằng AI */
    var aiOut = el('div', { class: 'ai-out', 'aria-live': 'polite' });
    var aiBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Nhờ trợ lý AI phân tích kết quả' });
    var aiBox = el('div', { class: 'card ai-box' }, [
      el('h3', { text: 'Phân tích cá nhân hoá từ trợ lý AI' }),
      hasAi
        ? el('p', { class: 'muted small no-print', text: 'Trợ lý sẽ giải thích mã Holland của bạn và gợi ý hướng đi. AI có thể nhầm lẫn, hãy xem đây là gợi ý tham khảo.' })
        : el('p', { class: 'muted small no-print', text: 'Trợ lý AI chưa được bật nên chưa có phân tích cá nhân hoá. Bạn vẫn xem được đầy đủ mô tả nhóm và gợi ý ngành ở trên.' }),
      hasAi ? el('div', { class: 'no-print' }, [aiBtn]) : null,
      aiOut
    ]);
    aiBtn.addEventListener('click', function () { runAi(aiBtn, aiOut, code); });

    /* Nút thao tác */
    var pdf = el('button', { class: 'btn btn-primary', type: 'button', text: 'Tải kết quả (PDF)' });
    pdf.addEventListener('click', printResult);
    var chat = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Hỏi thêm trợ lý AI' });
    chat.addEventListener('click', function () {
      document.getElementById('chatbot').scrollIntoView();
      window.Chatbot.ask('Dựa trên mã Holland ' + code + ' của mình, mình nên tìm hiểu ngành nào và chuẩn bị gì?');
    });
    var again = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Làm lại' });
    again.addEventListener('click', function () { showIntro(); app.scrollIntoView({ block: 'start' }); });
    var actions = el('div', { class: 'cta-row no-print' }, [pdf, hasAi ? chat : null, again]);

    /* Ghi chú về việc lưu kết quả vào tài khoản */
    saveNote = null;
    var noteNode = null;
    if (opts.savedAt) {
      noteNode = el('p', { class: 'notice no-print', text: 'Đây là kết quả bạn đã lưu trong tài khoản.' });
    } else if (signedIn()) {
      saveNote = el('p', { class: 'notice no-print', role: 'status', 'aria-live': 'polite', text: '' });
      noteNode = saveNote;
    } else if (window.Auth && window.Auth.open) {
      var login = el('button', { class: 'link-btn', type: 'button', text: 'Đăng nhập hoặc tạo tài khoản' });
      login.addEventListener('click', function () { window.Auth.open(); });
      noteNode = el('p', { class: 'notice no-print' }, [login, document.createTextNode(' để lưu kết quả này và xem lại các lần làm bài sau.')]);
    }

    setView([el('div', { id: 'hollandResult', class: 'holland-result' }, [
      el('div', { class: 'card res-top' }, [head]),
      noteNode,
      flat,
      el('div', { class: 'res-grid' }, [radarHost, barsHost]),
      cards,
      el('div', { class: 'res-grid' }, [suggest, aiBox]),
      disclaimer,
      actions,
      canCollect && !opts.savedAt ? consentBox() : null
    ])]);
  }

  /* ---------- Phân tích bằng AI ---------- */
  function runAi(btn, out, code) {
    btn.disabled = true;
    out.className = 'ai-out is-loading';
    out.textContent = 'Đang phân tích…';
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 30000);
    fetch('api/chat.php', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hãy phân tích kết quả trắc nghiệm Holland của mình (mã ' + code + ') và gợi ý hướng đi phù hợp.' }],
        holland: sums,
        holland_n: perType
      })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && typeof j.reply === 'string' && j.reply) return j.reply;
        var err = new Error('http_' + r.status);
        err.status = r.status;
        throw err;
      });
    }).then(function (reply) {
      out.className = 'ai-out';
      out.textContent = reply;
    }).catch(function (err) {
      out.className = 'ai-out is-error';
      out.textContent = err && err.status === 429
        ? 'Bạn gửi yêu cầu hơi nhanh, vui lòng thử lại sau ít phút.'
        : 'Chưa nhận được phân tích từ trợ lý AI. Bạn vẫn có thể xem mô tả và gợi ý ở trên.';
      btn.disabled = false;
    }).then(function () { clearTimeout(timer); });
  }

  /* ---------- Xuất PDF (in trang kết quả) ---------- */
  function printResult() {
    var oldTitle = document.title;
    var code = rankedTypes(sums).slice(0, 3).map(function (r) { return r.code; }).join('');
    document.title = 'Ket-qua-Holland-' + code;
    document.body.classList.add('printing-holland');
    function cleanup() {
      document.body.classList.remove('printing-holland');
      document.title = oldTitle;
      window.removeEventListener('afterprint', cleanup);
    }
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  /* ---------- Gửi ẩn danh (chỉ khi đồng ý) ---------- */
  function consentBox() {
    var gradeSel = el('select', { id: 'hGrade' }, [
      el('option', { value: '', text: 'Không nêu' }),
      el('option', { value: '10', text: 'Khối 10' }),
      el('option', { value: '11', text: 'Khối 11' }),
      el('option', { value: '12', text: 'Khối 12' })
    ]);
    var genderSel = el('select', { id: 'hGender' }, [
      el('option', { value: '', text: 'Không nêu' }),
      el('option', { value: 'nam', text: 'Nam' }),
      el('option', { value: 'nu', text: 'Nữ' })
    ]);
    var check = el('input', { type: 'checkbox', id: 'hConsent' });
    var send = el('button', { class: 'btn btn-primary', type: 'button', text: 'Gửi kết quả ẩn danh' });
    send.disabled = true;
    var status = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });

    check.addEventListener('change', function () { send.disabled = !check.checked || submitted; });
    send.addEventListener('click', function () {
      if (!check.checked || submitted) return;
      send.disabled = true;
      status.textContent = 'Đang gửi…';
      fetch('api/holland.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ scores: sums, mode: mode, grade: gradeSel.value, gender: genderSel.value, consent: true, v: cfg.version })
      }).then(function (r) {
        if (r.ok) {
          submitted = true;
          status.textContent = 'Cảm ơn bạn! Kết quả đã được gửi ẩn danh cho nhóm nghiên cứu.';
        } else if (r.status === 429) {
          status.textContent = 'Đã gửi quá nhiều lần, vui lòng thử lại sau.';
          send.disabled = false;
        } else {
          status.textContent = 'Chưa gửi được, vui lòng thử lại sau. Kết quả của bạn vẫn được giữ trên màn hình.';
          send.disabled = false;
        }
      }).catch(function () {
        status.textContent = 'Chưa gửi được, vui lòng kiểm tra kết nối rồi thử lại.';
        send.disabled = false;
      });
    });

    return el('div', { class: 'card consent-box no-print' }, [
      el('h3', { text: 'Đóng góp cho nghiên cứu (không bắt buộc)' }),
      el('div', { class: 'consent-fields' }, [
        el('label', { for: 'hGrade' }, [document.createTextNode('Khối '), gradeSel]),
        el('label', { for: 'hGender' }, [document.createTextNode('Giới tính '), genderSel])
      ]),
      el('label', { class: 'consent-check', for: 'hConsent' }, [check, el('span', { text: cfg.consent })]),
      el('div', { class: 'cta-row' }, [send]),
      status
    ]);
  }

  /* ---------- Khởi tạo ---------- */
  function probe(url, test) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return !!(j && test(j)); })
      .catch(function () { return false; });
  }

  function init(data) {
    cfg = data;
    app = document.getElementById('hollandApp');
    if (!app) return;
    showIntro();
    // Đăng nhập, đăng xuất hoặc xóa kết quả đã lưu khi đang ở màn hình đầu: vẽ lại để danh sách kết quả đã lưu đúng
    window.addEventListener('auth:change', function () { if (view === 'intro') showIntro(); });
    window.addEventListener('auth:results-cleared', function () { if (view === 'intro') showIntro(); });
    probe('api/chat.php?ping=1', function (j) { return j.ai === true; }).then(function (ok) { hasAi = ok; });
    probe('api/holland.php', function (j) { return j.ok === true; }).then(function (ok) { canCollect = ok; });
  }

  window.Holland = { init: init };
})();
