/* Video giới thiệu CareerAssistantAI.
   Âm thanh thuyết minh là "đồng hồ" duy nhất; mỗi cảnh là một hàm của thời gian nên tạm dừng/tua luôn khớp.
   Số liệu đọc từ data/survey.json, data/holland.json, data/data.json (có giá trị dự phòng nếu tải lỗi). */
(function () {
  'use strict';

  var W = 1280, H = 720;
  var stage, frame, audio, startBtn, startLabel, playBtn, seek, timeEl, muteBtn, captionEl, barEl, wmEl, orbA, orbB;
  var TL;
  var scenes = [];
  var cues = [];
  var playing = false;
  var V; // dữ liệu hiển thị

  /* ---------- Tiện ích ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }
  function prog(t, a, b) { return clamp01((t - a) / (b - a)); }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function fmt1(v) { return v.toFixed(1).replace('.', ','); }
  function fmtInt(v) { return Math.round(v).toLocaleString('vi-VN'); }
  function pose(node, o, x, y, s) {
    node.style.opacity = o;
    node.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  }
  function reveal(node, t, at, dur, dy) {
    var p = ease(prog(t, at, at + (dur || 0.6)));
    pose(node, p, 0, (1 - p) * (dy === undefined ? 26 : dy), 1);
    return p;
  }
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function getJson(url, fallback) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).catch(function () { return fallback; });
  }
  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  /* ---------- Dữ liệu (có dự phòng) ---------- */
  function buildData(sv, hl, dt) {
    var d = {
      n: 1252, schools: 76, decided: 38.8, ai: 40.5,
      q10: [
        { label: 'Chưa biết mình có năng lực ở lĩnh vực nào', v: 77.4 },
        { label: 'Thiếu thông tin về nghề nghiệp', v: 76.8 },
        { label: 'Chưa hiểu rõ sở thích', v: 70.7 }
      ],
      groups: ['Kinh tế – Kinh doanh', 'Y tế – Sức khỏe', 'Công nghệ thông tin – AI', 'Kỹ thuật – Công nghệ', 'Khoa học tự nhiên – Môi trường – Nông nghiệp'],
      seg: {
        all: { n: 1252, v: [82.1, 76.0, 69.1, 67.5, 67.3] },
        g12: { n: 465, v: [81.9, 78.1, 73.5, 68.8, 66.2] },
        g12nu: { n: 223, v: [82.5, 78.5, 71.3, 65.0, 67.7] }
      },
      questions: ['Sửa chữa đồ điện tử, xe đạp hoặc xe máy khi bị hỏng.', 'Làm thí nghiệm để kiểm chứng một giả thuyết khoa học.', 'Vẽ, thiết kế hoặc trang trí một sản phẩm theo ý tưởng riêng.', 'Giúp bạn bè giải quyết vấn đề hoặc chia sẻ khi họ buồn.', 'Thuyết phục người khác đồng ý với ý tưởng của mình.', 'Sắp xếp tài liệu, dữ liệu gọn gàng và có hệ thống.'],
      scale: ['Hoàn toàn không thích', 'Không thích', 'Bình thường', 'Thích', 'Rất thích'],
      team: null
    };
    try {
      if (sv && sv.seg) {
        var all = sv.seg.all_all;
        d.n = sv.meta.n; d.schools = sv.meta.schools;
        d.decided = all.kpis[1]; d.ai = all.kpis[2];
        var charts = [];
        sv.sections.forEach(function (s) { s.charts.forEach(function (c) { charts.push(c); }); });
        var byId = function (id) { return charts.filter(function (c) { return c.id === id; })[0]; };
        var q10 = byId('q10'), q8 = byId('q8_21');
        d.q10 = [0, 2, 4].map(function (i) { return { label: q10.options[i], v: all.q10[i] }; });
        var idx = q8.options.map(function (_, i) { return i; }).sort(function (a, b) { return all.q8_21[0][b] - all.q8_21[0][a]; }).slice(0, 5);
        d.groups = idx.map(function (i) { return q8.options[i]; });
        [['all', 'all_all'], ['g12', '12_all'], ['g12nu', '12_nu']].forEach(function (pair) {
          var s = sv.seg[pair[1]];
          d.seg[pair[0]] = { n: s.n, v: idx.map(function (i) { return s.q8_21[0][i]; }) };
        });
      }
      if (hl && hl.questions) {
        d.questions = hl.questions.slice(0, 12).map(function (q) { return q.q; });
        d.scale = hl.scale;
      }
      if (dt && dt.team) d.team = dt.team;
    } catch (e) { /* dùng giá trị dự phòng */ }
    return d;
  }

  /* ---------- Thời gian của cảnh ---------- */
  function sceneInfo(i) {
    var s = TL.scenes[i];
    return {
      start: s.start, end: s.end, dur: s.end - s.start,
      cue: function (k) { return s.sentences[k].start - s.start; },
      cueEnd: function (k) { return s.sentences[k].end - s.start; }
    };
  }

  /* ---------- Cảnh 1: mở đầu ---------- */
  function sceneIntro() {
    var root = el('div', 'scene');
    var logo = el('img', 'i-logo'); logo.src = '../assets/img/favicon.svg?v=20260920c'; logo.alt = '';
    var title = el('div', 'i-title'); title.appendChild(document.createTextNode('CareerAssistant')); title.appendChild(el('span', 'grad', 'AI'));
    var tag = el('div', 'i-tag', 'Trợ lý AI hướng nghiệp cho học sinh THPT');
    var pills = el('div', 'i-pills');
    var ps = ['Số liệu khảo sát', 'Trắc nghiệm Holland', 'Chatbot AI'].map(function (t) { var p = el('span', 'pill', t); pills.appendChild(p); return p; });
    [logo, title, tag, pills].forEach(function (n) { root.appendChild(n); });
    return {
      el: root,
      update: function (t) {
        var p = ease(prog(t, 0.1, 0.9)); pose(logo, p, 0, 0, 0.6 + 0.4 * p);
        reveal(title, t, 0.6, 0.8); reveal(tag, t, 1.4, 0.7, 16);
        ps.forEach(function (n, i) { reveal(n, t, 2.4 + i * 0.3, 0.5, 14); });
      }
    };
  }

  /* ---------- Cảnh 2: vấn đề ---------- */
  function sceneProblem(info) {
    var root = el('div', 'scene');
    var head = el('div', 'p-head', 'Chọn nghề – quyết định lớn');
    var sub = el('div', 'p-sub', 'Tỷ lệ học sinh cho rằng đây là nguyên nhân khiến các em còn phân vân');
    var row = el('div', 'p-cards');
    var cards = V.q10.map(function (item) {
      var c = el('div', 'p-card');
      var num = el('div', 'p-num grad', '0%');
      var lab = el('div', 'p-label', item.label);
      var track = el('div', 'p-track'); var fill = el('div', 'p-fill'); track.appendChild(fill);
      [num, lab, track].forEach(function (n) { c.appendChild(n); });
      row.appendChild(c);
      return { c: c, num: num, fill: fill, v: item.v };
    });
    [head, sub, row].forEach(function (n) { root.appendChild(n); });
    var s2 = info.cue(1), d2 = info.cueEnd(1) - s2;
    var at = [s2 + d2 * 0.05, s2 + d2 * 0.4, s2 + d2 * 0.7];
    return {
      el: root,
      update: function (t) {
        reveal(head, t, 0.2, 0.8); reveal(sub, t, 0.9, 0.7, 16);
        cards.forEach(function (c, i) {
          reveal(c.c, t, at[i], 0.6, 30);
          var p = ease(prog(t, at[i] + 0.2, at[i] + 1.3));
          c.num.textContent = fmt1(c.v * p) + '%';
          c.fill.style.width = (c.v * p) + '%';
        });
      }
    };
  }

  /* ---------- Cảnh 3: KPI khảo sát ---------- */
  function sceneKpi(info) {
    var root = el('div', 'scene');
    var head = el('div', 'h-head', 'Khảo sát học sinh THPT khối 10–12');
    var row = el('div', 'k-row');
    var defs = [
      { v: V.n, dec: 0, suf: '', label: 'học sinh tham gia' },
      { v: V.schools, dec: 0, suf: '', label: 'trường THPT' },
      { v: V.decided, dec: 1, suf: '%', label: 'đã xác định rõ định hướng nghề nghiệp' },
      { v: V.ai, dec: 1, suf: '%', label: 'dùng AI thường xuyên' }
    ];
    var s1 = info.cue(1), d1 = info.cueEnd(1) - s1, d0 = info.cueEnd(0) - info.cue(0);
    var at = [info.cue(0) + 0.2, info.cue(0) + d0 * 0.7, s1 + d1 * 0.05, s1 + d1 * 0.55];
    var cards = defs.map(function (d) {
      var c = el('div', 'k-card'); var num = el('div', 'k-num grad', '0'); var lab = el('div', 'k-label', d.label);
      c.appendChild(num); c.appendChild(lab); row.appendChild(c);
      return { c: c, num: num, d: d };
    });
    root.appendChild(head); root.appendChild(row);
    return {
      el: root,
      update: function (t) {
        reveal(head, t, 0.1, 0.7, 18);
        cards.forEach(function (c, i) {
          reveal(c.c, t, at[i], 0.6, 30);
          var p = ease(prog(t, at[i] + 0.15, at[i] + 1.4)), v = c.d.v * p;
          c.num.textContent = (c.d.dec ? fmt1(v) : fmtInt(v)) + c.d.suf;
        });
      }
    };
  }

  /* ---------- Cảnh 4: trang số liệu có bộ lọc ---------- */
  function sceneDashboard(info) {
    var root = el('div', 'scene');
    var win = el('div', 'd-win');
    var top = el('div', 'd-top');
    for (var i = 0; i < 3; i++) top.appendChild(el('span', 'd-dot'));
    top.appendChild(el('span', 'd-url', 'careerassistantai.online'));
    var body = el('div', 'd-body');
    body.appendChild(el('div', 'd-title', 'Số liệu thống kê'));
    var filters = el('div', 'd-filters');
    var chips = { grade: [], gender: [] };
    function group(label, key, names) {
      var g = el('div', 'd-group'); g.appendChild(document.createTextNode(label));
      var seg = el('span', 'd-seg');
      names.forEach(function (nm) { var c = el('span', 'd-chip', nm); seg.appendChild(c); chips[key].push(c); });
      g.appendChild(seg); filters.appendChild(g);
    }
    group('Khối ', 'grade', ['Tất cả', 'Khối 10', 'Khối 11', 'Khối 12']);
    group('Giới tính ', 'gender', ['Tất cả', 'Nam', 'Nữ']);
    var nEl = el('span', 'd-n', ''); filters.appendChild(nEl);
    var chart = el('div', 'd-chart');
    chart.appendChild(el('div', 'd-ct', 'Nhóm ngành học sinh quan tâm'));
    var rows = V.groups.map(function (g) {
      var r = el('div', 'd-row'); var l = el('span', 'd-rl', g); var tr = el('span', 'd-track'); var f = el('span', 'd-fill'); var v = el('span', 'd-rv', '');
      tr.appendChild(f); r.appendChild(l); r.appendChild(tr); r.appendChild(v); chart.appendChild(r);
      return { f: f, v: v };
    });
    body.appendChild(filters); body.appendChild(chart);
    win.appendChild(top); win.appendChild(body); root.appendChild(win);
    var t1 = info.dur * 0.34, t2 = info.dur * 0.64;
    return {
      el: root,
      update: function (t) {
        reveal(win, t, 0.1, 0.8, 30);
        var g1 = ease(prog(t, t1, t1 + 0.7)), g2 = ease(prog(t, t2, t2 + 0.7));
        var gradeIdx = t >= t1 ? 3 : 0, genderIdx = t >= t2 ? 2 : 0;
        chips.grade.forEach(function (c, k) { c.classList.toggle('on', k === gradeIdx); });
        chips.gender.forEach(function (c, k) { c.classList.toggle('on', k === genderIdx); });
        var grow = ease(prog(t, 0.6, 1.6));
        var n = lerp(lerp(V.seg.all.n, V.seg.g12.n, g1), V.seg.g12nu.n, g2);
        nEl.textContent = 'Đang xem ' + fmtInt(n) + ' học sinh';
        rows.forEach(function (r, k) {
          var v = lerp(lerp(V.seg.all.v[k], V.seg.g12.v[k], g1), V.seg.g12nu.v[k], g2) * grow;
          r.f.style.width = v + '%';
          r.v.textContent = fmt1(v) + '%';
        });
      }
    };
  }

  /* ---------- Cảnh 5: trắc nghiệm Holland ---------- */
  function sceneHolland(info) {
    var root = el('div', 'scene');
    var stageEl = el('div', 'hl-stage');
    var quiz = el('div', 'hl-quiz'); var card = el('div', 'hq-card');
    var head = el('div', 'hq-head'); var lab = el('span', '', 'Trắc nghiệm Holland'); var cnt = el('span', '', 'Câu 1 / 36');
    head.appendChild(lab); head.appendChild(cnt);
    var track = el('div', 'hq-track'); var fill = el('div', 'hq-fill'); track.appendChild(fill);
    var q = el('div', 'hq-q', V.questions[0]);
    var opts = el('div', 'hq-opts');
    var optEls = V.scale.map(function (s, i) {
      var o = el('div', 'hq-opt'); o.appendChild(el('b', '', String(i + 1))); o.appendChild(document.createTextNode(s)); opts.appendChild(o); return o;
    });
    [head, track, q, opts].forEach(function (n) { card.appendChild(n); });
    quiz.appendChild(card);

    var res = el('div', 'hl-result');
    var code = el('div', 'hr-code');
    code.appendChild(el('div', 'hr-eyebrow', 'Kết quả của bạn'));
    var letters = el('div', 'hr-letters');
    var lets = ['S', 'I', 'A'].map(function (l) { var s = el('span', '', l); letters.appendChild(s); return s; });
    code.appendChild(letters); code.appendChild(el('div', 'hr-names', 'Xã hội · Nghiên cứu · Nghệ thuật'));
    var radarHost = el('div', 'hr-radar');
    var radar = buildRadar([12, 24, 24, 30, 12, 12]);
    radarHost.appendChild(radar.svg);
    var side = el('div', 'hr-side');
    side.appendChild(el('div', 'hr-side-title', 'Nhóm ngành gợi ý'));
    var chipsEl = ['Y tế – Sức khỏe', 'Khoa học xã hội – Luật – Nhân văn', 'Giáo dục'].map(function (t) { var c = el('div', 'hr-chip', t); side.appendChild(c); return c; });
    var pdf = el('div', 'hr-pdf', '⬇  Tải kết quả PDF'); side.appendChild(pdf);
    res.appendChild(code); res.appendChild(radarHost); res.appendChild(side);
    stageEl.appendChild(quiz); stageEl.appendChild(res); root.appendChild(stageEl);

    var tb = info.cue(1) - 0.3;
    var pdfAt = info.cue(1) + (info.cueEnd(1) - info.cue(1)) * 0.72;
    return {
      el: root,
      update: function (t) {
        var qa = 1 - prog(t, tb, tb + 0.5);
        pose(quiz, Math.min(qa, ease(prog(t, 0.1, 0.7))), 0, 0, 1);
        var p = prog(t, 0.5, tb - 0.4);
        var n = 1 + Math.min(35, Math.floor(p * 36));
        cnt.textContent = 'Câu ' + n + ' / 36';
        fill.style.width = (n / 36 * 100) + '%';
        q.textContent = V.questions[(n - 1) % V.questions.length];
        var pick = [3, 4, 2, 3, 4, 1][(n - 1) % 6];
        optEls.forEach(function (o, i) { o.classList.toggle('on', i === pick && p > 0); });
        var ra = prog(t, tb + 0.2, tb + 0.8);
        res.style.opacity = ra;
        lets.forEach(function (l, i) {
          var lp = ease(prog(t, tb + 0.5 + i * 0.25, tb + 1.0 + i * 0.25));
          pose(l, lp, 0, (1 - lp) * 30, 0.7 + 0.3 * lp);
        });
        radar.set(ease(prog(t, tb + 0.7, tb + 2.0)));
        chipsEl.forEach(function (c, i) { reveal(c, t, tb + 1.9 + i * 0.35, 0.5, 16); });
        reveal(pdf, t, pdfAt, 0.5, 16);
      }
    };
  }

  function buildRadar(scores) {
    var labels = ['R', 'I', 'A', 'S', 'E', 'C'];
    var svg = svgEl('svg', { viewBox: '0 0 400 400', 'class': 'radar' });
    var cx = 200, cy = 200, R = 130;
    function pt(i, r) { var a = -Math.PI / 2 + (2 * Math.PI * i) / 6; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    function pts(f) { return labels.map(function (_, i) { return pt(i, f(i)).map(function (v) { return v.toFixed(1); }).join(','); }).join(' '); }
    [0.25, 0.5, 0.75, 1].forEach(function (k) { svg.appendChild(svgEl('polygon', { points: pts(function () { return R * k; }), 'class': 'rg' })); });
    var area = svgEl('polygon', { points: '', 'class': 'ra' });
    svg.appendChild(area);
    var dots = labels.map(function () { var d = svgEl('circle', { r: 5, 'class': 'rd' }); svg.appendChild(d); return d; });
    labels.forEach(function (l, i) {
      var p = pt(i, R + 32);
      var t = svgEl('text', { x: p[0].toFixed(1), y: (p[1] + 7).toFixed(1), 'text-anchor': 'middle' }); t.textContent = l; svg.appendChild(t);
    });
    var pcts = scores.map(function (s) { return (s - 6) / 24; });
    return {
      svg: svg,
      set: function (p) {
        area.setAttribute('points', pts(function (i) { return R * Math.max(pcts[i] * p, 0.03); }));
        dots.forEach(function (d, i) { var q = pt(i, R * Math.max(pcts[i] * p, 0.03)); d.setAttribute('cx', q[0].toFixed(1)); d.setAttribute('cy', q[1].toFixed(1)); });
      }
    };
  }

  /* ---------- Cảnh 6: chatbot ---------- */
  function sceneChat(info) {
    var root = el('div', 'scene');
    var win = el('div', 'c-win');
    var head = el('div', 'c-head'); var ic = el('img'); ic.src = '../assets/img/favicon.svg?v=20260920c'; ic.alt = '';
    head.appendChild(ic); head.appendChild(document.createTextNode('Trợ lý AI CareerAssistantAI')); head.appendChild(el('span', 'c-tag', 'Ví dụ minh họa'));
    var body = el('div', 'c-body');
    var user = el('div', 'c-msg c-user', ''); var dots = el('div', 'c-dots', '● ● ●'); var bot = el('div', 'c-msg c-bot', '');
    body.appendChild(user); body.appendChild(dots); body.appendChild(bot);
    win.appendChild(head); win.appendChild(body);
    var note = el('div', 'c-note', '⚠  AI chỉ để tham khảo – không thay thế thầy cô và cố vấn hướng nghiệp');
    root.appendChild(win); root.appendChild(note);
    var Q = 'Mã SIA hợp với ngành nào?';
    var A = 'Mã SIA cho thấy bạn thích giúp đỡ, tìm hiểu và sáng tạo. Bạn có thể tham khảo nhóm ngành Giáo dục, Y tế và Khoa học xã hội.';
    var noteAt = info.cue(1) + 0.1;
    return {
      el: root,
      update: function (t) {
        reveal(win, t, 0.1, 0.7, 24);
        var qn = Math.floor(prog(t, 0.6, 1.9) * Q.length);
        user.textContent = Q.slice(0, qn); user.style.display = qn > 0 ? '' : 'none';
        var showDots = t >= 2.2 && t < 3.0;
        dots.style.display = showDots ? '' : 'none';
        var an = Math.floor(prog(t, 3.0, 3.0 + A.length / 27) * A.length);
        bot.textContent = A.slice(0, an); bot.style.display = an > 0 ? '' : 'none';
        reveal(note, t, noteAt, 0.6, 20);
      }
    };
  }

  /* ---------- Cảnh 7: kết ---------- */
  function sceneOutro(info) {
    var root = el('div', 'scene');
    var logo = el('img', 'i-logo'); logo.src = '../assets/img/favicon.svg?v=20260920c'; logo.alt = '';
    var title = el('div', 'k-title'); title.appendChild(document.createTextNode('Hiểu mình – ')); title.appendChild(el('span', 'grad', 'chọn đúng hướng'));
    var url = el('div', 'k-url', 'careerassistantai.online');
    var credit = el('div', 'k-credit');
    if (V.team) {
      var t = V.team;
      var l1 = el('div'); l1.appendChild(document.createTextNode('Đề tài nghiên cứu khoa học · ')); l1.appendChild(el('b', '', t.institution));
      var names = (t.members || []).map(function (m) { return m.name; }).join(', ');
      var l2 = el('div'); l2.appendChild(document.createTextNode('Nhóm thực hiện: ')); l2.appendChild(el('b', '', names));
      credit.appendChild(l1); credit.appendChild(l2);
      if (t.advisor) { var l3 = el('div'); l3.appendChild(document.createTextNode('Giáo viên hướng dẫn: ')); l3.appendChild(el('b', '', t.advisor.name)); credit.appendChild(l3); }
    }
    [logo, title, url, credit].forEach(function (n) { root.appendChild(n); });
    var urlAt = info.cue(1);
    return {
      el: root,
      update: function (t) {
        var p = ease(prog(t, 0.1, 0.8)); pose(logo, p, 0, 0, 0.7 + 0.3 * p);
        reveal(title, t, info.cue(0), 0.8);
        reveal(url, t, urlAt, 0.7, 24);
        reveal(credit, t, urlAt + 1.2, 0.8, 16);
      }
    };
  }

  /* ---------- Dựng video ---------- */
  function build() {
    var makers = [sceneIntro, sceneProblem, sceneKpi, sceneDashboard, sceneHolland, sceneChat, sceneOutro];
    orbA = el('div', 'orb orb-a'); orbB = el('div', 'orb orb-b');
    stage.appendChild(orbA); stage.appendChild(orbB);
    TL.scenes.forEach(function (sc, i) {
      var info = sceneInfo(i);
      var s = makers[i](info);
      s.info = info;
      stage.appendChild(s.el);
      scenes.push(s);
      sc.sentences.forEach(function (q) { cues.push(q); });
    });
    wmEl = el('div', 'wm'); var wi = el('img'); wi.src = '../assets/img/favicon.svg?v=20260920c'; wi.alt = '';
    wmEl.appendChild(wi); var wt = el('span'); wt.appendChild(document.createTextNode('CareerAssistant')); wt.appendChild(el('b', '', 'AI')); wmEl.appendChild(wt);
    captionEl = el('div', 'caption'); barEl = el('div', 'bar');
    stage.appendChild(wmEl); stage.appendChild(captionEl); stage.appendChild(barEl);
  }

  function render(t) {
    orbA.style.transform = 'translate(' + (Math.sin(t / 5) * 60) + 'px,' + (Math.cos(t / 6) * 40) + 'px)';
    orbB.style.transform = 'translate(' + (Math.cos(t / 7) * 70) + 'px,' + (Math.sin(t / 4) * 50) + 'px)';
    scenes.forEach(function (s, i) {
      var last = i === scenes.length - 1;
      var a = (i === 0 ? 1 : prog(t, s.info.start, s.info.start + 0.5)) * (last ? 1 : 1 - prog(t, s.info.end - 0.4, s.info.end));
      s.el.style.visibility = a > 0.002 ? 'visible' : 'hidden';
      s.el.style.opacity = a;
      if (a > 0.002) s.update(Math.max(0, t - s.info.start));
    });
    var first = scenes[1].info.start, lastS = scenes[scenes.length - 1].info.start;
    wmEl.style.opacity = 0.75 * prog(t, first + 0.3, first + 0.8) * (1 - prog(t, lastS - 0.3, lastS));
    var cur = null;
    for (var i = 0; i < cues.length; i++) if (t >= cues[i].start - 0.05 && t <= cues[i].end + 0.3) { cur = cues[i]; break; }
    if (cur) {
      if (captionEl.textContent !== cur.text) captionEl.textContent = cur.text;
      captionEl.style.opacity = Math.min(prog(t, cur.start - 0.05, cur.start + 0.2), 1 - prog(t, cur.end + 0.05, cur.end + 0.3));
    } else {
      captionEl.style.opacity = 0;
    }
    barEl.style.width = (t / TL.duration * 100) + '%';
    timeEl.textContent = fmtTime(t) + ' / ' + fmtTime(TL.duration);
    seek.value = Math.round(t / TL.duration * 1000);
  }

  /* ---------- Phát / tạm dừng ---------- */
  function loop() { if (!playing) return; render(audio.currentTime); requestAnimationFrame(loop); }
  function setPlaying(p) {
    playing = p;
    playBtn.textContent = p ? '⏸' : '▶';
    if (p) { startBtn.hidden = true; loop(); }
  }
  function play() {
    if (audio.ended || audio.currentTime >= TL.duration - 0.05) audio.currentTime = 0;
    var pr = audio.play();
    if (pr && pr.catch) pr.catch(function () { setPlaying(false); });
  }
  function toggle() { if (audio.paused) play(); else audio.pause(); }

  function resize() {
    var fw = frame.clientWidth, fh = frame.clientHeight;
    var s = Math.min(fw / W, fh / H);
    stage.style.transform = 'translate(' + ((fw - W * s) / 2) + 'px,' + ((fh - H * s) / 2) + 'px) scale(' + s + ')';
  }

  function init(tl, data) {
    TL = tl; V = data;
    stage = document.getElementById('stage'); frame = document.getElementById('frame'); audio = document.getElementById('audio');
    startBtn = document.getElementById('startBtn'); startLabel = document.getElementById('startLabel');
    playBtn = document.getElementById('playBtn'); seek = document.getElementById('seek'); timeEl = document.getElementById('time'); muteBtn = document.getElementById('muteBtn');
    build(); resize(); render(0);

    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', resize);
    startBtn.addEventListener('click', play);
    playBtn.addEventListener('click', toggle);
    frame.addEventListener('click', function (e) { if (e.target === startBtn || startBtn.contains(e.target)) return; toggle(); });
    document.getElementById('restartBtn').addEventListener('click', function () { audio.currentTime = 0; render(0); play(); });
    seek.addEventListener('input', function () { audio.currentTime = (seek.value / 1000) * TL.duration; render(audio.currentTime); });
    muteBtn.addEventListener('click', function () { audio.muted = !audio.muted; muteBtn.textContent = audio.muted ? '🔇' : '🔊'; });
    document.getElementById('fsBtn').addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen(); else if (frame.requestFullscreen) frame.requestFullscreen();
    });
    audio.addEventListener('play', function () { setPlaying(true); });
    audio.addEventListener('pause', function () { setPlaying(false); render(audio.currentTime); });
    audio.addEventListener('ended', function () {
      setPlaying(false); render(TL.duration);
      startLabel.textContent = 'Phát lại'; startBtn.hidden = false;
    });
    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|BUTTON/.test(e.target.tagName) && e.key === ' ') return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') { audio.currentTime = Math.min(TL.duration, audio.currentTime + 5); render(audio.currentTime); }
      else if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); render(audio.currentTime); }
    });
  }

  Promise.all([
    getJson('timeline.json', null),
    getJson('../data/survey.json', null),
    getJson('../data/holland.json', null),
    getJson('../data/data.json', null)
  ]).then(function (r) {
    if (!r[0]) { document.getElementById('frame').textContent = 'Không tải được timeline.json. Hãy mở trang qua máy chủ web.'; return; }
    init(r[0], buildData(r[1], r[2], r[3]));
  });
})();
