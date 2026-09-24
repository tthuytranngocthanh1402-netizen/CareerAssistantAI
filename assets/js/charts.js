/* Biểu đồ thuần DOM – không phụ thuộc thư viện. Mọi text dùng textContent (không chèn HTML). */
(function () {
  'use strict';

  var SEG_COLORS = ['var(--seg-1)', 'var(--seg-2)', 'var(--seg-3)', 'var(--seg-4)'];

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'text') node.textContent = props[k];
        else if (k === 'class') node.className = props[k];
        else node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function num(n, digits) {
    return (digits === undefined ? String(n) : Number(n).toFixed(digits)).replace('.', ',');
  }
  function pct(n) { return num(n, 1) + '%'; }

  function header(host, cfg) {
    host.textContent = '';
    host.appendChild(el('h3', { text: cfg.title }));
    if (cfg.caption) host.appendChild(el('figcaption', { text: cfg.caption }));
  }

  function noteEnd(host, text) {
    if (text) host.appendChild(el('figcaption', { class: 'note-end', text: text }));
  }

  /* Thứ tự giảm dần theo giá trị, giữ chỉ số gốc */
  function ranked(options, values) {
    return options.map(function (label, i) { return { label: label, value: values[i], i: i }; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  function barRow(label, valueText, value, fillClass) {
    var fill = el('div', { class: 'bar-fill ' + fillClass });
    fill.style.setProperty('--w', Math.max(0, Math.min(100, value)) + '%');
    return el('div', { class: 'bar-row' }, [
      el('div', { class: 'bar-row-label' }, [el('span', { text: label }), el('span', { text: valueText })]),
      el('div', { class: 'bar-track' }, [fill])
    ]);
  }

  /* Thanh ngang xếp hạng (thang 0–100% để không phóng đại chênh lệch) */
  function hbars(host, cfg, values) {
    header(host, cfg);
    var wrap = el('div', { class: 'bars' });
    var rows = cfg.sort === false
      ? cfg.options.map(function (label, i) { return { label: label, value: values[i] }; })
      : ranked(cfg.options, values);
    rows.forEach(function (r) {
      wrap.appendChild(barRow(r.label, pct(r.value), r.value, 'f-indigo'));
    });
    host.appendChild(wrap);
    noteEnd(host, cfg.note);
  }

  /* Cặp thanh ngang: so sánh hai chuỗi cho cùng danh mục */
  function pairs(host, cfg, values) {
    header(host, cfg);
    var legend = el('ul', { class: 'legend' }, [
      el('li', {}, [el('i', { class: 'dot-main' }), document.createTextNode(cfg.series[0])]),
      el('li', {}, [el('i', { class: 'dot-sky' }), document.createTextNode(cfg.series[1])])
    ]);
    host.appendChild(legend);
    var order = cfg.options.map(function (label, i) { return { label: label, a: values[0][i], b: values[1][i] }; })
      .sort(function (x, y) { return y.a - x.a; });
    var wrap = el('div', { class: 'bars bars-pairs' });
    order.forEach(function (r) {
      var fa = el('div', { class: 'bar-fill f-indigo' });
      fa.style.setProperty('--w', r.a + '%');
      var fb = el('div', { class: 'bar-fill f-sky' });
      fb.style.setProperty('--w', r.b + '%');
      wrap.appendChild(el('div', { class: 'bar-row' }, [
        el('div', { class: 'bar-row-label' }, [el('span', { text: r.label })]),
        el('div', { class: 'pair-line' }, [el('div', { class: 'bar-track' }, [fa]), el('span', { text: pct(r.a) })]),
        el('div', { class: 'pair-line' }, [el('div', { class: 'bar-track' }, [fb]), el('span', { text: pct(r.b) })])
      ]));
    });
    host.appendChild(wrap);
  }

  /* Rút gọn nhãn dài "Nhóm A – Nhóm B" thành "Nhóm A" để vừa trục hoành */
  function abbreviate(label) {
    var i = label.indexOf(' – ');
    return i === -1 ? label : label.slice(0, i);
  }

  /* Catmull-Rom -> Bezier: đường cong mượt đi qua mọi điểm dữ liệu */
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0][0].toFixed(2) + ',' + pts[0][1].toFixed(2);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6;
      var c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6;
      var c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + c1x.toFixed(2) + ',' + c1y.toFixed(2) + ' ' + c2x.toFixed(2) + ',' + c2y.toFixed(2) + ' ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2);
    }
    return d;
  }

  /* Biểu đồ đường mượt hai chuỗi (kiểu "Balance"): so sánh 2 chỉ số theo từng danh mục, có chạm/di
     chuột để xem giá trị. cfg.options giữ nguyên thứ tự (không xếp hạng lại) để đường không đổi hình
     dạng khi người dùng đổi bộ lọc. values = [mảngA, mảngB], cùng độ dài với cfg.options. */
  function trend(host, cfg, values) {
    header(host, cfg);
    var legend = el('ul', { class: 'legend' }, [
      el('li', {}, [el('i', { class: 'dot-main' }), document.createTextNode(cfg.series[0])]),
      el('li', {}, [el('i', { class: 'dot-sky' }), document.createTextNode(cfg.series[1])])
    ]);
    host.appendChild(legend);

    var rows = cfg.options.map(function (label, i) { return { label: label, a: values[0][i], b: values[1][i] }; });
    var n = rows.length;
    var W = 760, H = 230, padL = 32, padR = 10, padT = 10, padB = 10;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    function xAt(i) { return n > 1 ? padL + (innerW * i) / (n - 1) : padL + innerW / 2; }
    function yAt(v) { return padT + innerH * (1 - Math.max(0, Math.min(100, v)) / 100); }

    var NS = 'http://www.w3.org/2000/svg';
    function mk(tag, attrs) {
      var node = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
      return node;
    }

    var svg = mk('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'trend-svg', role: 'img', 'aria-label': cfg.title });
    var clipId = 'trendClip' + Math.random().toString(36).slice(2, 9);
    var defs = mk('defs', {});
    var clip = mk('clipPath', { id: clipId });
    clip.appendChild(mk('rect', { x: padL, y: padT, width: innerW, height: innerH }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    /* Chỉ vẽ lưới tham chiếu ở giữa (25/50/75); bỏ đường ở 0% và 100% để không tạo cảm giác khung
       hình chữ nhật bao quanh biểu đồ. Nhãn số trục vẫn hiện đủ 0–100% để không mất thông tin. */
    [0, 25, 50, 75, 100].forEach(function (v) {
      var y = yAt(v);
      if (v !== 0 && v !== 100) svg.appendChild(mk('line', { x1: padL, y1: y.toFixed(2), x2: (W - padR).toFixed(2), y2: y.toFixed(2), class: 'trend-grid' }));
      var t = mk('text', { x: (padL - 7).toFixed(2), y: (y + 3).toFixed(2), 'text-anchor': 'end', class: 'trend-axis' });
      t.textContent = v + '%';
      svg.appendChild(t);
    });

    var ptsA = rows.map(function (r, i) { return [xAt(i), yAt(r.a)]; });
    var ptsB = rows.map(function (r, i) { return [xAt(i), yAt(r.b)]; });
    var g = mk('g', { 'clip-path': 'url(#' + clipId + ')' });
    g.appendChild(mk('path', { d: smoothPath(ptsB), class: 'trend-line trend-line-b', fill: 'none' }));
    g.appendChild(mk('path', { d: smoothPath(ptsA), class: 'trend-line trend-line-a', fill: 'none' }));
    svg.appendChild(g);

    var guide = mk('line', { x1: xAt(0).toFixed(2), y1: padT, x2: xAt(0).toFixed(2), y2: H - padB, class: 'trend-guide' });
    svg.appendChild(guide);
    var dotsA = ptsA.map(function (p) {
      var c = mk('circle', { cx: p[0].toFixed(2), cy: p[1].toFixed(2), r: 3, class: 'trend-dot trend-dot-a' });
      svg.appendChild(c);
      return c;
    });
    var dotsB = ptsB.map(function (p) {
      var c = mk('circle', { cx: p[0].toFixed(2), cy: p[1].toFixed(2), r: 3, class: 'trend-dot trend-dot-b' });
      svg.appendChild(c);
      return c;
    });
    var overlay = mk('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent', class: 'trend-overlay' });
    svg.appendChild(overlay);

    var tip = el('div', { class: 'trend-tip' });
    var wrap = el('div', { class: 'trend' }, [svg, tip]);

    var labels = el('div', { class: 'trend-labels' });
    rows.forEach(function (r) {
      labels.appendChild(el('span', { text: abbreviate(r.label), title: r.label }));
    });

    /* Trên màn hình hẹp, giữ bề rộng tối thiểu và cuộn ngang thay vì bóp nhãn quá nhỏ */
    var inner = el('div', { class: 'trend-inner' }, [wrap, labels]);
    host.appendChild(el('div', { class: 'trend-scroll' }, [inner]));

    var srRows = rows.map(function (r) {
      return r.label + ': ' + cfg.series[0] + ' ' + pct(r.a) + ', ' + cfg.series[1] + ' ' + pct(r.b);
    });
    host.appendChild(el('p', { class: 'sr-only', text: srRows.join('. ') }));
    if (cfg.note) noteEnd(host, cfg.note);

    function setIndex(idx) {
      idx = Math.max(0, Math.min(n - 1, idx));
      var r = rows[idx];
      var x = xAt(idx).toFixed(2);
      guide.setAttribute('x1', x);
      guide.setAttribute('x2', x);
      guide.setAttribute('opacity', '1');
      dotsA.forEach(function (d, i) { d.classList.toggle('is-active', i === idx); });
      dotsB.forEach(function (d, i) { d.classList.toggle('is-active', i === idx); });
      tip.textContent = '';
      tip.appendChild(el('b', { text: r.label }));
      tip.appendChild(el('div', { class: 'trend-tip-row' }, [el('i', { class: 'dot-main' }), el('span', { text: cfg.series[0] }), el('b', { text: pct(r.a) })]));
      tip.appendChild(el('div', { class: 'trend-tip-row' }, [el('i', { class: 'dot-sky' }), el('span', { text: cfg.series[1] }), el('b', { text: pct(r.b) })]));
      tip.style.left = Math.max(8, Math.min(92, (xAt(idx) / W) * 100)) + '%';
      tip.classList.add('is-visible');
    }
    function hide() {
      guide.setAttribute('opacity', '0');
      dotsA.forEach(function (d) { d.classList.remove('is-active'); });
      dotsB.forEach(function (d) { d.classList.remove('is-active'); });
      tip.classList.remove('is-visible');
    }
    function fromClientX(clientX) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      var xUnits = ((clientX - rect.left) / rect.width) * W;
      setIndex(Math.round(((xUnits - padL) / innerW) * (n - 1)));
    }
    overlay.addEventListener('mousemove', function (e) { fromClientX(e.clientX); });
    overlay.addEventListener('mouseleave', hide);
    overlay.addEventListener('touchstart', function (e) { fromClientX(e.touches[0].clientX); }, { passive: true });
    overlay.addEventListener('touchmove', function (e) { fromClientX(e.touches[0].clientX); }, { passive: true });
    overlay.addEventListener('touchend', hide);
  }

  /* Biểu đồ radar (lục giác Holland): labels[i] là nhãn trục, values[i] trong khoảng 0–100 */
  function radar(host, labels, values, title) {
    var NS = "http://www.w3.org/2000/svg";
    var cx = 150, cy = 150, R = 92, n = labels.length;
    function mk(tag, attrs) {
      var node = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
      return node;
    }
    function point(i, r) {
      var a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }
    function fix(p) { return p.map(function (v) { return v.toFixed(1); }).join(","); }
    var svg = mk("svg", { viewBox: "0 0 300 300", class: "radar", role: "img", "aria-label": title || "Biểu đồ radar" });
    [25, 50, 75, 100].forEach(function (pc) {
      var pts = labels.map(function (_, i) { return fix(point(i, (R * pc) / 100)); }).join(" ");
      svg.appendChild(mk("polygon", { points: pts, class: "rd-ring" }));
    });
    labels.forEach(function (_, i) {
      var p = point(i, R);
      svg.appendChild(mk("line", { x1: cx, y1: cy, x2: p[0].toFixed(1), y2: p[1].toFixed(1), class: "rd-axis" }));
    });
    var area = values.map(function (v, i) { return fix(point(i, (R * Math.max(v, 3)) / 100)); }).join(" ");
    svg.appendChild(mk("polygon", { points: area, class: "rd-area" }));
    values.forEach(function (v, i) {
      var p = point(i, (R * Math.max(v, 3)) / 100);
      svg.appendChild(mk("circle", { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 3.5, class: "rd-dot" }));
    });
    labels.forEach(function (label, i) {
      var p = point(i, R + 22);
      var t = mk("text", { x: p[0].toFixed(1), y: (p[1] + 4).toFixed(1), "text-anchor": "middle", class: "rd-label" });
      t.textContent = label;
      svg.appendChild(t);
    });
    host.appendChild(svg);
  }

  /* Thanh tiến độ gradient kèm giá trị trung bình (kiểu "Financial Health") */
  function meters(host, cfg, values) {
    host.textContent = '';
    host.appendChild(el('h3', { text: cfg.title }));
    var avg = values.reduce(function (s, v) { return s + v; }, 0) / values.length;
    host.appendChild(el('div', { class: 'score' }, [
      el('span', { class: 'score-num', text: num(avg, 1) + '%' }),
      el('span', { class: 'score-tag', text: cfg.scoreLabel || '' })
    ]));
    var wrap = el('div', { class: 'meters' });
    cfg.options.forEach(function (label, i) {
      var fill = el('div', { class: 'meter-fill m-' + ((i % 4) + 1) });
      fill.style.setProperty('--w', values[i] + '%');
      wrap.appendChild(el('div', {}, [
        el('div', { class: 'meter-head' }, [el('span', { text: label }), el('b', { text: pct(values[i]) })]),
        el('div', { class: 'meter-track' }, [fill])
      ]));
    });
    host.appendChild(wrap);
    if (cfg.caption) host.appendChild(el('figcaption', { class: 'note-end', text: cfg.caption }));
  }

  /* Dải phân đoạn bo tròn + chú giải (câu hỏi chọn một đáp án) */
  function strip(host, cfg, values) {
    header(host, cfg);
    var topIdx = 0;
    values.forEach(function (v, i) { if (v > values[topIdx]) topIdx = i; });
    host.appendChild(el('div', { class: 'big-num', text: pct(values[topIdx]) }));
    host.appendChild(el('div', { class: 'big-sub', text: 'Nhiều nhất: ' + cfg.options[topIdx] }));

    var bar = el('div', { class: 'strip', 'aria-hidden': 'true' });
    var list = el('ul', { class: 'seg-legend' });
    cfg.options.forEach(function (label, i) {
      var seg = el('div', { class: 'seg s-' + ((i % 4) + 1) });
      seg.style.flex = Math.max(values[i], 0.4) + ' 1 0';
      bar.appendChild(seg);
      var li = el('li', {}, [el('span', { text: label }), el('b', { text: pct(values[i]) })]);
      li.style.setProperty('--seg', SEG_COLORS[i % SEG_COLORS.length]);
      list.appendChild(li);
    });
    host.appendChild(bar);
    host.appendChild(list);
  }

  /* Cột viên thuốc: phân bố điểm 1–5 của một câu hỏi thang đo */
  function dist(host, cfg, values) {
    header(host, cfg);
    var max = Math.max.apply(null, values);
    var axisMax = Math.max(10, Math.ceil(max / 10) * 10);
    var ticks = [];
    for (var t = 0; t <= 4; t++) ticks.push(el('span', { text: Math.round((axisMax / 4) * t) + '%' }));
    var yaxis = el('div', { class: 'yaxis', 'aria-hidden': 'true' }, ticks);

    var groups = el('div', { class: 'groups' });
    groups.style.setProperty('--n', values.length);
    values.forEach(function (v, i) {
      var pill = el('div', { class: 'pill pill-after', title: cfg.labels[i] + ': ' + pct(v) });
      pill.style.setProperty('--h', (v / axisMax) * 100 + '%');
      groups.appendChild(el('div', { class: 'group' }, [
        el('div', { class: 'pills' }, [pill]),
        el('div', { class: 'group-label', text: cfg.labels[i] }),
        el('div', { class: 'group-val', text: pct(v) })
      ]));
    });
    host.appendChild(el('div', { class: 'flow-plot' }, [yaxis, groups]));

    var total = values.reduce(function (s, v) { return s + v; }, 0) || 1;
    var mean = values.reduce(function (s, v, i) { return s + v * (i + 1); }, 0) / total;
    function stat(label, value) {
      return el('div', { class: 'stat' }, [el('div', { class: 'stat-label', text: label }), el('div', { class: 'stat-value', text: value })]);
    }
    host.appendChild(el('div', { class: 'flow-side' }, [
      stat('Điểm trung bình', num(mean, 2) + '/5'),
      stat('Chọn mức 4–5', pct(values[3] + values[4])),
      stat('Chọn mức 1–2', pct(values[0] + values[1]))
    ]));
  }

  /* Thẻ thông tin mẫu khảo sát */
  function info(host, title, rows) {
    host.textContent = '';
    host.appendChild(el('h3', { text: title }));
    var dl = el('dl', { class: 'info-list' });
    rows.forEach(function (r) {
      dl.appendChild(el('div', { class: 'info-row' }, [el('dt', { text: r[0] }), el('dd', { text: r[1] })]));
    });
    host.appendChild(dl);
  }

  /* Đếm số động cho KPI */
  function showValue(node, target, decimals, suffix) {
    node.textContent = (decimals ? target.toFixed(decimals).replace('.', ',') : Math.round(target).toLocaleString('vi-VN')) + suffix;
  }
  function countUp(node, target, decimals, suffix, instant) {
    if (instant) { showValue(node, target, decimals, suffix); return; }
    var start = null, dur = 1200;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      showValue(node, target * (1 - Math.pow(1 - p, 3)), decimals, suffix);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function kpis(host, defs, values) {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var already = host.classList.contains('is-visible');
    host.textContent = '';
    defs.forEach(function (k, i) {
      var value = el('div', { class: 'kpi-value', text: '0' });
      value.dataset.target = values[i];
      value.dataset.decimals = k.decimals || 0;
      value.dataset.suffix = k.suffix || '';
      value.setAttribute('aria-label', num(values[i]) + (k.suffix || '') + ' ' + k.label);
      host.appendChild(el('div', { class: 'kpi' }, [el('div', { class: 'kpi-label', text: k.label }), value]));
      if (already) {
        value.dataset.done = '1';
        showValue(value, values[i], k.decimals || 0, k.suffix || '');
      } else if (reduce) {
        value.dataset.done = '1';
        showValue(value, values[i], k.decimals || 0, k.suffix || '');
      }
    });
  }

  /* Kích hoạt animation đếm số khi phần tử hiện ra (animation khác do CSS .is-visible đảm nhiệm) */
  function reveal(root) {
    root.querySelectorAll('.kpi-value').forEach(function (n) {
      if (n.dataset.done) return;
      n.dataset.done = '1';
      countUp(n, parseFloat(n.dataset.target), parseInt(n.dataset.decimals, 10), n.dataset.suffix, false);
    });
  }

  window.Charts = {
    hbars: hbars, radar: radar, pairs: pairs, trend: trend, meters: meters, strip: strip, dist: dist, info: info, kpis: kpis, reveal: reveal, fmt: num, pct: pct
  };
})();
