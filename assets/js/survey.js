/* Dựng mục Số liệu từ data/survey.json và xử lý bộ lọc khối / giới tính.
   survey.json chỉ chứa số liệu tổng hợp đã tính sẵn cho từng tổ hợp bộ lọc. */
(function () {
  'use strict';

  var SMALL_N = 200;
  var state = { grade: 'all', gender: 'all' };
  var survey = null;
  var kpisHost = null;
  var hosts = [];

  function segKey() { return state.grade + '_' + state.gender; }

  function build(container) {
    survey.sections.forEach(function (sec) {
      var section = document.createElement('div');
      section.className = 'subsection';
      var h = document.createElement('h3');
      h.className = 'sub-title';
      h.textContent = sec.title;
      var p = document.createElement('p');
      p.className = 'muted small';
      p.textContent = sec.subtitle;
      var grid = document.createElement('div');
      grid.className = 'cgrid';

      sec.charts.forEach(function (cfg) {
        var host = document.createElement(cfg.type === 'info' ? 'div' : 'figure');
        host.className = 'card' + (cfg.type === 'info' ? '' : ' chart') + (cfg.wide ? ' wide' : '');
        grid.appendChild(host);
        hosts.push({ cfg: cfg, host: host });
      });

      section.appendChild(h);
      section.appendChild(p);
      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  function infoRows(seg) {
    var g = seg.grade, s = seg.gender;
    return [
      ['Đang xem', seg.n.toLocaleString('vi-VN') + ' / ' + survey.meta.n.toLocaleString('vi-VN') + ' học sinh'],
      ['Số trường THPT', String(survey.meta.schools)],
      ['Thời gian khảo sát', survey.meta.period],
      ['Cơ cấu khối', 'Khối 10: ' + window.Charts.pct(g[0]) + ' · Khối 11: ' + window.Charts.pct(g[1]) + ' · Khối 12: ' + window.Charts.pct(g[2])],
      ['Giới tính', 'Nam ' + window.Charts.pct(s[0]) + ' · Nữ ' + window.Charts.pct(s[1])]
    ];
  }

  function render() {
    var seg = survey.seg[segKey()];
    window.Charts.kpis(kpisHost, survey.kpis, seg.kpis);
    hosts.forEach(function (h) {
      var cfg = h.cfg;
      if (cfg.type === 'info') window.Charts.info(h.host, 'Thông tin mẫu khảo sát', infoRows(seg));
      else window.Charts[cfg.type](h.host, cfg, seg[cfg.id]);
    });

    var note = document.getElementById('filterN');
    var text = 'Đang xem ' + seg.n.toLocaleString('vi-VN') + ' học sinh';
    if (seg.n < SMALL_N) text += ' · cỡ mẫu nhỏ, kết quả mang tính tham khảo';
    note.textContent = text;
  }

  function bindFilters() {
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.dataset.filter;
        state[kind] = btn.dataset.value;
        document.querySelectorAll('.filter-btn[data-filter="' + kind + '"]').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        render();
      });
    });
  }

  function init(data) {
    survey = data;
    kpisHost = document.getElementById('kpis');
    build(document.getElementById('surveySections'));
    bindFilters();
    document.getElementById('sampleNote').textContent =
      'Khảo sát ' + survey.meta.n.toLocaleString('vi-VN') + ' học sinh THPT tại ' + survey.meta.schools + ' trường · ' + survey.meta.period;
    render();
  }

  window.Survey = { init: init };
})();
