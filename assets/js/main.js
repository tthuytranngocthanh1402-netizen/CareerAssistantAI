(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- Theme ---------- */
  document.querySelectorAll('.js-theme').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var current = root.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  });

  /* ---------- Sidebar (ngăn kéo trên mobile) ---------- */
  var nav = document.getElementById('nav');
  var menuBtn = document.getElementById('menuToggle');
  var scrim = document.getElementById('scrim');
  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    scrim.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
  scrim.addEventListener('click', function () { setMenu(false); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Ô tìm kiếm trên thanh trên: gửi câu hỏi tới chatbot ---------- */
  var askForm = document.getElementById('askForm');
  var askInput = document.getElementById('askInput');
  askForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = askInput.value.trim();
    if (!q) return;
    askInput.value = '';
    document.getElementById('chatbot').scrollIntoView();
    window.Chatbot.ask(q);
  });

  /* ---------- Footer year ---------- */
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Tabs (góc nhìn) ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  function activateTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { activateTab(t); });
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      activateTab(next);
      next.focus();
    });
  });

  /* ---------- Render helpers ---------- */
  function initials(name) {
    var parts = name.replace(/[.,]/g, '').split(/\s+/).filter(Boolean);
    return (parts[parts.length - 1] || '?').charAt(0).toUpperCase();
  }

  function renderQuotes(host, list) {
    host.textContent = '';
    list.forEach(function (q) {
      var card = document.createElement('article');
      card.className = 'card quote reveal';

      var bq = document.createElement('blockquote');
      bq.textContent = q.quote;

      var footer = document.createElement('footer');
      var avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = initials(q.name);
      var who = document.createElement('div');
      var name = document.createElement('div');
      name.className = 'quote-name';
      name.textContent = q.name;
      var role = document.createElement('div');
      role.className = 'quote-role';
      role.textContent = q.role;
      who.appendChild(name);
      who.appendChild(role);
      footer.appendChild(avatar);
      footer.appendChild(who);

      card.appendChild(bq);
      card.appendChild(footer);
      host.appendChild(card);
    });
  }

  function person(name, role) {
    var wrap = document.createElement('div');
    wrap.className = 'card person reveal';
    var avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initials(name);
    var who = document.createElement('div');
    var n = document.createElement('div');
    n.className = 'quote-name';
    n.textContent = name;
    var r = document.createElement('div');
    r.className = 'quote-role';
    r.textContent = role;
    who.appendChild(n);
    who.appendChild(r);
    wrap.appendChild(avatar);
    wrap.appendChild(who);
    return wrap;
  }

  function renderTeam(host, team) {
    host.textContent = '';
    host.appendChild(person(team.advisor.name, team.advisor.role));
    team.members.forEach(function (m) { host.appendChild(person(m.name, m.role)); });
    var meta = document.createElement('p');
    meta.className = 'team-meta';
    meta.appendChild(document.createTextNode('Đơn vị: ' + team.institution + ' · Liên hệ trưởng nhóm nghiên cứu: '));
    var mail = document.createElement('a');
    mail.href = 'mailto:' + team.email;
    mail.textContent = team.email;
    meta.appendChild(mail);
    host.appendChild(meta);
  }

  /* ---------- Reveal on scroll ---------- */
  function setupReveal() {
    var targets = document.querySelectorAll('.reveal, .kpis, .chart');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!('IntersectionObserver' in window) || reduce) {
      targets.forEach(function (t) { t.classList.add('is-visible'); window.Charts.reveal(t); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-visible');
        window.Charts.reveal(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.15 });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ---------- Nav highlight + chat fab ---------- */
  function setupScrollSpy() {
    var links = Array.prototype.slice.call(nav.querySelectorAll('a.side-link[href^="#"]'));
    var fab = document.getElementById('chatFab');
    var crumb = document.getElementById('crumb');
    var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    if (!('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) {
          var on = a.getAttribute('href') === '#' + en.target.id;
          a.classList.toggle('is-active', on);
          if (on) {
            a.setAttribute('aria-current', 'true');
            crumb.textContent = a.textContent.trim();
          } else {
            a.removeAttribute('aria-current');
          }
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { if (s) io.observe(s); });

    var chatSection = document.getElementById('chatbot');
    new IntersectionObserver(function (entries) {
      fab.classList.toggle('is-hidden', entries[0].isIntersecting);
    }, { threshold: 0.3 }).observe(chatSection);
  }

  /* ---------- Load data ---------- */
  function showLoadError(file) {
    var msg = document.createElement('p');
    msg.className = 'notice';
    msg.textContent = 'Không tải được dữ liệu (' + file + '). Hãy mở trang qua máy chủ web thay vì mở trực tiếp file.';
    document.getElementById('so-lieu').appendChild(msg);
  }

  function getJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error(url + ' – HTTP ' + r.status);
      return r.json();
    });
  }

  Promise.all([getJson('data/data.json'), getJson('data/survey.json'), getJson('data/holland.json?v=2')])
    .then(function (res) {
      var data = res[0], survey = res[1], holland = res[2];

      window.Survey.init(survey);
      window.Holland.init(holland);

      renderQuotes(document.getElementById('panel-students'), data.students);
      renderQuotes(document.getElementById('panel-university'), data.university || []);
      renderQuotes(document.getElementById('panel-experts'), data.experts);
      renderTeam(document.getElementById('team'), data.team);
      window.Chatbot.init(data.chat);

      setupReveal();
      setupScrollSpy();
    })
    .catch(function (err) {
      console.error(err);
      showLoadError('data/data.json, data/survey.json, data/holland.json');
      setupScrollSpy();
    });
})();
