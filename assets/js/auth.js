/* Tài khoản bằng tên đăng nhập + mật khẩu do người dùng tự đặt, mở từ icon tròn ở góc phải thanh trên.
   Gửi tới api/auth.php (mật khẩu chỉ được lưu dạng băm trên máy chủ, phiên là cookie HttpOnly).
   Thông báo cho phần còn lại của trang bằng sự kiện 'auth:change' (detail.user) và 'auth:history-cleared'. */
(function () {
  'use strict';

  var AUTH_URL = 'api/auth.php';
  var HISTORY_URL = 'api/history.php';
  var RESULTS_URL = 'api/results.php';
  var USER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
  var USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;
  var PASSWORD_MIN = 8;
  var PASSWORD_MAX = 72; // byte, giới hạn của bcrypt

  var btn, panel;
  var state = { ready: false, enabled: false };
  var formMode = 'login'; // 'login' | 'register'
  var status = '';        // thông báo trong bảng khi đã đăng nhập (đã xóa lịch sử…)

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

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    });
  }

  function byteLength(s) { return new TextEncoder().encode(s).length; }

  function avatarNode(user, cls) {
    return el('span', { class: cls + ' avatar-initials', text: String(user.name || '?').slice(0, 2).toUpperCase() });
  }

  function setUser(user) {
    window.Auth.user = user;
    renderButton();
    if (isOpen()) renderPanel();
    window.dispatchEvent(new CustomEvent('auth:change', { detail: { user: user } }));
  }

  /* ---------- Icon tròn ---------- */
  function renderButton() {
    var user = window.Auth.user;
    btn.textContent = '';
    if (user) {
      btn.appendChild(avatarNode(user, 'avatar-img'));
      btn.setAttribute('aria-label', 'Tài khoản của ' + user.name);
      btn.classList.add('is-signed-in');
    } else {
      btn.innerHTML = USER_ICON;
      btn.setAttribute('aria-label', 'Tài khoản: đăng nhập hoặc tạo tài khoản');
      btn.classList.remove('is-signed-in');
    }
  }

  /* ---------- Bảng tài khoản ---------- */
  function isOpen() { return !panel.hidden; }

  function open() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    renderPanel();
    var first = panel.querySelector('input');
    (first || panel).focus({ preventScroll: true });
  }

  function close(returnFocus) {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    status = '';
    if (returnFocus) btn.focus();
  }

  function renderPanel() {
    var user = window.Auth.user;
    panel.textContent = '';
    if (user) renderSignedIn(user); else renderSignedOut();
  }

  function renderSignedIn(user) {
    var out = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Đăng xuất' });
    out.addEventListener('click', logout);
    var clear = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Xóa lịch sử trò chuyện' });
    clear.addEventListener('click', clearHistory);
    var clearRes = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Xóa kết quả Holland đã lưu' });
    clearRes.addEventListener('click', clearResults);

    panel.appendChild(el('div', { class: 'account-user' }, [
      avatarNode(user, 'account-avatar'),
      el('div', { class: 'account-who' }, [
        el('strong', { text: user.name }),
        el('span', { class: 'muted small', text: 'Đã đăng nhập' })
      ])
    ]));
    panel.appendChild(el('p', { class: 'muted small', text: 'Lịch sử trò chuyện với trợ lý AI và kết quả trắc nghiệm Holland của bạn đang được lưu, và sẽ hiện lại mỗi khi bạn đăng nhập.' }));
    panel.appendChild(el('div', { class: 'account-actions' }, [clear, clearRes, out]));
    if (status) panel.appendChild(el('p', { class: 'account-status small', role: 'status', text: status }));
  }

  function renderSignedOut() {
    if (!state.ready) {
      panel.appendChild(el('p', { class: 'muted small', text: 'Đang kiểm tra…' }));
      return;
    }
    if (!state.enabled) {
      panel.appendChild(el('h3', { text: 'Tài khoản' }));
      panel.appendChild(el('p', { class: 'notice', text: 'Tính năng tài khoản chưa được bật trên máy chủ này. Bạn vẫn dùng trợ lý bình thường, nhưng lịch sử sẽ không được lưu.' }));
      return;
    }

    var isReg = formMode === 'register';

    function tab(mode, label) {
      var t = el('button', { class: 'account-tab' + (formMode === mode ? ' is-active' : ''), type: 'button', role: 'tab', 'aria-selected': String(formMode === mode), text: label });
      t.addEventListener('click', function () { formMode = mode; renderPanel(); var i = panel.querySelector('input'); if (i) i.focus(); });
      return t;
    }
    panel.appendChild(el('div', { class: 'account-tabs', role: 'tablist' }, [tab('login', 'Đăng nhập'), tab('register', 'Tạo tài khoản')]));
    panel.appendChild(el('p', { class: 'muted small', text: isReg
      ? 'Tự chọn tên đăng nhập và mật khẩu để lưu lịch sử trò chuyện với trợ lý AI và kết quả trắc nghiệm Holland.'
      : 'Đăng nhập để xem lại lịch sử trò chuyện và các kết quả Holland đã lưu.' }));

    var userIn = el('input', { id: 'authUser', name: 'username', type: 'text', autocomplete: 'username', maxlength: '30', required: '', autocapitalize: 'none', spellcheck: 'false' });
    var passIn = el('input', { id: 'authPass', name: 'password', type: 'password', autocomplete: isReg ? 'new-password' : 'current-password', maxlength: String(PASSWORD_MAX), required: '' });
    var pass2In = isReg ? el('input', { id: 'authPass2', name: 'password2', type: 'password', autocomplete: 'new-password', maxlength: String(PASSWORD_MAX), required: '' }) : null;
    var show = el('input', { id: 'authShow', type: 'checkbox' });
    show.addEventListener('change', function () {
      var t = show.checked ? 'text' : 'password';
      passIn.type = t;
      if (pass2In) pass2In.type = t;
    });
    var errEl = el('p', { class: 'account-error small', role: 'alert' });
    var submit = el('button', { class: 'btn btn-primary', type: 'submit', text: isReg ? 'Tạo tài khoản' : 'Đăng nhập' });

    var form = el('form', { class: 'account-form', novalidate: '' }, [
      el('label', { for: 'authUser' }, [document.createTextNode('Tên đăng nhập'), userIn]),
      isReg ? el('p', { class: 'muted small account-hint', text: '3–30 ký tự: chữ cái không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' }) : null,
      el('label', { for: 'authPass' }, [document.createTextNode('Mật khẩu'), passIn]),
      isReg ? el('p', { class: 'muted small account-hint', text: 'Từ 8 ký tự trở lên. Không dùng lại mật khẩu email hay mạng xã hội của bạn.' }) : null,
      isReg ? el('label', { for: 'authPass2' }, [document.createTextNode('Nhập lại mật khẩu'), pass2In]) : null,
      el('label', { class: 'account-show', for: 'authShow' }, [show, document.createTextNode(' Hiện mật khẩu')]),
      errEl,
      submit
    ]);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var username = userIn.value.trim();
      var password = passIn.value;
      var problem = '';
      if (!USERNAME_RE.test(username)) problem = 'Tên đăng nhập gồm 3–30 ký tự: chữ cái không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';
      else if (isReg && (byteLength(password) < PASSWORD_MIN || byteLength(password) > PASSWORD_MAX)) problem = 'Mật khẩu cần từ ' + PASSWORD_MIN + ' đến ' + PASSWORD_MAX + ' ký tự.';
      else if (isReg && password.toLowerCase() === username.toLowerCase()) problem = 'Mật khẩu không được trùng với tên đăng nhập.';
      else if (isReg && password !== pass2In.value) problem = 'Hai lần nhập mật khẩu chưa giống nhau.';
      else if (!isReg && !password) problem = 'Vui lòng nhập mật khẩu.';
      if (problem) { errEl.textContent = problem; return; }

      errEl.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Đang xử lý…';
      postJson(AUTH_URL, { action: formMode, username: username, password: password }).then(function (r) {
        if (r.ok && r.body && r.body.user && typeof r.body.user.name === 'string') {
          setUser(r.body.user);
          close(true);
          return;
        }
        errEl.textContent = errorMessage(r.status, r.body && r.body.error);
        submit.disabled = false;
        submit.textContent = isReg ? 'Tạo tài khoản' : 'Đăng nhập';
      }).catch(function () {
        errEl.textContent = 'Chưa kết nối được, vui lòng kiểm tra mạng rồi thử lại.';
        submit.disabled = false;
        submit.textContent = isReg ? 'Tạo tài khoản' : 'Đăng nhập';
      });
    });

    panel.appendChild(form);
    panel.appendChild(el('p', { class: 'muted small account-privacy', text: 'Mật khẩu được mã hóa một chiều trên máy chủ, chúng mình không đọc được. Hiện chưa có chức năng quên mật khẩu, bạn hãy ghi nhớ mật khẩu của mình nhé.' }));
  }

  function errorMessage(status, code) {
    if (status === 429) return 'Bạn thử quá nhiều lần, vui lòng đợi ít phút rồi thử lại.';
    if (status === 401) return 'Sai tên đăng nhập hoặc mật khẩu.';
    if (status === 409) return 'Tên đăng nhập này đã có người dùng, hãy chọn tên khác.';
    if (code === 'bad_username') return 'Tên đăng nhập gồm 3–30 ký tự: chữ cái không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';
    if (code === 'bad_password') return 'Mật khẩu cần từ ' + PASSWORD_MIN + ' đến ' + PASSWORD_MAX + ' ký tự và không trùng tên đăng nhập.';
    if (status === 503) return 'Máy chủ chưa lưu được tài khoản, vui lòng thử lại sau.';
    return 'Chưa thực hiện được, vui lòng thử lại sau.';
  }

  function logout() {
    postJson(AUTH_URL, { action: 'logout' }).catch(function () {}).then(function () {
      status = '';
      setUser(null);
      close(true);
    });
  }

  function clearHistory() {
    if (!window.confirm('Xóa toàn bộ lịch sử trò chuyện đã lưu của bạn? Thao tác này không thể hoàn tác.')) return;
    postJson(HISTORY_URL, { action: 'clear' }).then(function (r) {
      if (r.ok) {
        status = 'Đã xóa lịch sử trò chuyện.';
        window.dispatchEvent(new CustomEvent('auth:history-cleared'));
      } else {
        status = 'Chưa xóa được lịch sử, vui lòng thử lại.';
      }
      if (isOpen()) renderPanel();
    }).catch(function () {
      status = 'Chưa xóa được lịch sử, vui lòng kiểm tra kết nối rồi thử lại.';
      if (isOpen()) renderPanel();
    });
  }

  function clearResults() {
    if (!window.confirm('Xóa toàn bộ kết quả trắc nghiệm Holland đã lưu trong tài khoản của bạn? Thao tác này không thể hoàn tác.')) return;
    postJson(RESULTS_URL, { action: 'clear' }).then(function (r) {
      if (r.ok) {
        status = 'Đã xóa kết quả Holland đã lưu.';
        window.dispatchEvent(new CustomEvent('auth:results-cleared'));
      } else {
        status = 'Chưa xóa được kết quả, vui lòng thử lại.';
      }
      if (isOpen()) renderPanel();
    }).catch(function () {
      status = 'Chưa xóa được kết quả, vui lòng kiểm tra kết nối rồi thử lại.';
      if (isOpen()) renderPanel();
    });
  }

  /* ---------- Khởi tạo ---------- */
  function init() {
    btn = document.getElementById('accountBtn');
    panel = document.getElementById('accountPanel');
    if (!btn || !panel) return;
    panel.setAttribute('tabindex', '-1');

    btn.addEventListener('click', function () { if (isOpen()) close(false); else open(); });
    var wrap = btn.closest('.account');
    document.addEventListener('click', function (e) {
      // composedPath được chốt lúc bắt đầu sự kiện, nên vẫn đúng khi nút vừa bấm đã bị vẽ lại khỏi DOM
      if (isOpen() && e.composedPath().indexOf(wrap) === -1) close(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close(true);
    });

    fetch(AUTH_URL, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        state.ready = true;
        if (j && typeof j === 'object') {
          state.enabled = j.enabled === true;
          if (j.user && typeof j.user.name === 'string') setUser(j.user);
        }
        if (isOpen() && !window.Auth.user) renderPanel();
      });
  }

  window.Auth = { user: null, init: init, open: function () { setTimeout(function () { if (btn && !isOpen()) open(); }, 0); } }; // hoãn để cú bấm gọi hàm này không bị coi là bấm ra ngoài bảng
  init();
})();
