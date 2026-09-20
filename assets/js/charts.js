/* Biểu đồ thuần DOM – không phụ thuộc thư viện. Mọi text dùng textContent. */
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
    return (digits === undefined ? String(n) : n.toFixed(digits)).replace('.', ',');
  }

  function mean(arr) {
    return arr.reduce(function (s, v) { return s + v; }, 0) / arr.length;
  }

  function header(host, cfg) {
    host.textContent = '';
    host.appendChild(el('h3', { text: cfg.title }));
    host.appendChild(el('figcaption', { text: cfg.caption }));
  }

  /* Cột viên thuốc: so sánh trước/sau kèm bảng tóm tắt bên phải */
  function flow(host, cfg) {
    host.textContent = '';
    var title = el('div', {}, [el('h3', { text: cfg.title }), el('figcaption', { text: cfg.caption })]);
    var legend = el('ul', { class: 'legend' }, [
      el('li', {}, [el('i', { class: 'dot-ghost' }), document.createTextNode(cfg.series[0])]),
      el('li', {}, [el('i', { class: 'dot-main' }), document.createTextNode(cfg.series[1])])
    ]);
    host.appendChild(el('div', { class: 'chart-top' }, [title, legend]));

    var ticks = [];
    for (var t = 0; t <= cfg.max; t++) ticks.push(el('span', { text: String(t) }));
    var yaxis = el('div', { class: 'yaxis', 'aria-hidden': 'true' }, ticks);

    var groups = el('div', { class: 'groups' });
    groups.style.setProperty('--n', cfg.items.length);
    cfg.items.forEach(function (item) {
      var pills = el('div', { class: 'pills' });
      item.values.forEach(function (v, i) {
        var pill = el('div', {
          class: 'pill ' + (i === 0 ? 'pill-before' : 'pill-after'),
          title: cfg.series[i] + ': ' + num(v, 1) + ' ' + cfg.unit
        });
        pill.style.setProperty('--h', (v / cfg.max) * 100 + '%');
        pills.appendChild(pill);
      });
      var summary = item.label + ' – ' + cfg.series.map(function (s, i) { return s + ' ' + num(item.values[i], 1); }).join(', ');
      groups.appendChild(el('div', { class: 'group' }, [
        pills,
        el('div', { class: 'group-label', 'aria-hidden': 'true', text: item.label }),
        el('span', { class: 'sr-only', text: summary })
      ]));
    });

    var before = mean(cfg.items.map(function (i) { return i.values[0]; }));
    var after = mean(cfg.items.map(function (i) { return i.values[1]; }));
    function stat(label, value, cls) {
      return el('div', { class: 'stat' }, [
        el('div', { class: 'stat-label', text: label }),
        el('div', { class: 'stat-value' + (cls ? ' ' + cls : ''), text: value })
      ]);
    }
    var side = el('div', { class: 'flow-side' }, [
      stat('Trung bình ' + cfg.series[0].toLowerCase(), num(before, 1)),
      stat('Trung bình ' + cfg.series[1].toLowerCase(), num(after, 1)),
      stat('Mức tăng', '+' + num(after - before, 1), 'stat-up')
    ]);

    host.appendChild(el('div', { class: 'flow' }, [
      el('div', { class: 'flow-plot' }, [yaxis, groups]),
      side
    ]));
  }

  /* Thanh tiến độ gradient kèm điểm tổng */
  function health(host, cfg) {
    host.textContent = '';
    host.appendChild(el('h3', { text: cfg.title }));

    var avg = Math.round(mean(cfg.items.map(function (i) { return i.value; })));
    var tag = avg >= 85 ? 'Rất tốt' : avg >= 70 ? 'Tốt' : avg >= 50 ? 'Khá' : 'Cần cải thiện';
    host.appendChild(el('div', { class: 'score' }, [
      el('span', { class: 'score-star', 'aria-hidden': 'true', text: '⭐' }),
      el('span', { class: 'score-num', text: avg + '/100' }),
      el('span', { class: 'score-tag', text: tag })
    ]));

    var meters = el('div', { class: 'meters' });
    cfg.items.forEach(function (item, i) {
      var fill = el('div', { class: 'meter-fill m-' + ((i % 4) + 1) });
      fill.style.setProperty('--w', item.value + '%');
      meters.appendChild(el('div', {}, [
        el('div', { class: 'meter-head' }, [el('span', { text: item.label }), el('b', { text: item.value + (cfg.unit || '') })]),
        el('div', { class: 'meter-track' }, [fill])
      ]));
    });
    host.appendChild(meters);
    host.appendChild(el('figcaption', { class: 'note-end', text: cfg.caption }));
  }

  /* Dải phân đoạn bo tròn + chú giải */
  function strip(host, cfg) {
    header(host, cfg);
    var total = cfg.items.reduce(function (s, i) { return s + i.value; }, 0);
    var top = cfg.items.reduce(function (a, b) { return b.value > a.value ? b : a; });

    host.appendChild(el('div', { class: 'big-num', text: Math.round((top.value / total) * 100) + '%' }));
    host.appendChild(el('div', { class: 'big-sub', text: 'Nhu cầu hàng đầu: ' + top.label }));

    var bar = el('div', { class: 'strip', 'aria-hidden': 'true' });
    var list = el('ul', { class: 'seg-legend' });
    cfg.items.forEach(function (item, i) {
      var seg = el('div', { class: 'seg s-' + ((i % 4) + 1) });
      seg.style.flex = item.value + ' 1 0';
      bar.appendChild(seg);
      var li = el('li', {}, [el('span', { text: item.label }), el('b', { text: Math.round((item.value / total) * 100) + '%' })]);
      li.style.setProperty('--seg', SEG_COLORS[i % SEG_COLORS.length]);
      list.appendChild(li);
    });
    host.appendChild(bar);
    host.appendChild(list);
  }

  /* Thẻ thông tin mẫu khảo sát */
  function sample(host, s) {
    host.textContent = '';
    host.appendChild(el('h3', { text: 'Thông tin mẫu khảo sát' }));
    var rows = [['Cỡ mẫu', 'n = ' + s.n], ['Đối tượng', s.source], ['Thời gian', s.period]];
    var dl = el('dl', { class: 'info-list' });
    rows.forEach(function (r) {
      dl.appendChild(el('div', { class: 'info-row' }, [el('dt', { text: r[0] }), el('dd', { text: r[1] })]));
    });
    host.appendChild(dl);
  }

  /* Đếm số động cho KPI */
  function countUp(node, target, decimals, suffix, instant) {
    function show(v) {
      node.textContent = (decimals ? v.toFixed(decimals).replace('.', ',') : Math.round(v).toLocaleString('vi-VN')) + suffix;
    }
    if (instant) { show(target); return; }
    var start = null, dur = 1200;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      show(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function kpis(host, list) {
    host.textContent = '';
    list.forEach(function (k) {
      var value = el('div', { class: 'kpi-value', text: '0' });
      value.dataset.target = k.value;
      value.dataset.decimals = k.decimals || 0;
      value.dataset.suffix = k.suffix || '';
      value.setAttribute('aria-label', num(k.value) + (k.suffix || '') + ' ' + k.label);
      host.appendChild(el('div', { class: 'kpi' }, [el('div', { class: 'kpi-label', text: k.label }), value]));
    });
  }

  /* Kích hoạt animation đếm số khi phần tử hiện ra (các animation khác do CSS .is-visible đảm nhiệm) */
  function reveal(root) {
    root.querySelectorAll('.kpi-value').forEach(function (n) {
      if (n.dataset.done) return;
      n.dataset.done = '1';
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      countUp(n, parseFloat(n.dataset.target), parseInt(n.dataset.decimals, 10), n.dataset.suffix, reduce);
    });
  }

  window.Charts = { flow: flow, health: health, strip: strip, sample: sample, kpis: kpis, reveal: reveal };
})();
