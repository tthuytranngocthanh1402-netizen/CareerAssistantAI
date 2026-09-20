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
    hbars: hbars, radar: radar, pairs: pairs, meters: meters, strip: strip, dist: dist, info: info, kpis: kpis, reveal: reveal, fmt: num, pct: pct
  };
})();
