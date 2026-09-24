/* Đăng nhập bằng Gmail (Google Identity Services) qua icon tròn ở góc phải thanh trên.
   Trình duyệt chỉ nhận mã xác thực từ Google rồi gửi cho api/auth.php kiểm tra và tạo phiên (cookie).
   Script của Google chỉ được tải khi người dùng mở bảng đăng nhập lần đầu.
   Thông báo cho phần còn lại của trang bằng sự kiện 'auth:change' (detail.user) và 'auth:history-cleared'. */
(function () {
  'use strict';

  var AUTH_URL = 'api/auth.php';
  var HISTORY_URL = 'api/history.php';
  var GSI_SRC = 'https://accounts.google.com/gsi/client';
  var USER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';

  var btn, panel;
  var state = { ready: false, enabled: false, clientId: '' };
  var status = ''; // dòng thông báo trong bảng (lỗi đăng nhập, đã xóa lịch sử…)
  var gsiPromise = null;
  var gsiInitialised = false;

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
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    });
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    var first = parts[0].charAt(0);
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  /* Ảnh đại diện Google hoặc chữ cái đầu của tên */
  function avatarNode(user, cls) {
    if (user.picture) {
      return el('img', { class: cls, src: user.picture, alt: '', referrerpolicy: 'no-referrer', width: '40', height: '40' });
    }
    return el('span', { class: cls + ' avatar-initials', text: initials(user.name) });
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
      btn.setAttribute('aria-label', 'Tài khoản: đăng nhập bằng Gmail');
      btn.classList.remove('is-signed-in');
    }
  }

  /* ---------- Bảng tài khoản ---------- */
  function isOpen() { return !panel.hidden; }

  function open() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    renderPanel();
    panel.focus({ preventScroll: true });
  }

  function close(returnFocus) {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    status = '';
    if (returnFocus) btn.focus();
  }

  function addStatus() {
    if (status) panel.appendChild(el('p', { class: 'account-status small', role: 'status', text: status }));
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

    panel.appendChild(el('div', { class: 'account-user' }, [
      avatarNode(user, 'account-avatar'),
      el('div', { class: 'account-who' }, [
        el('strong', { text: user.name }),
        el('span', { class: 'muted small', text: user.email })
      ])
    ]));
    panel.appendChild(el('p', { class: 'muted small', text: 'Lịch sử trò chuyện với trợ lý AI của bạn đang được lưu và sẽ hiện lại mỗi khi bạn đăng nhập.' }));
    panel.appendChild(el('div', { class: 'account-actions' }, [clear, out]));
    addStatus();
  }

  function renderSignedOut() {
    panel.appendChild(el('h3', { text: 'Đăng nhập' }));
    panel.appendChild(el('p', { class: 'muted small', text: 'Đăng nhập bằng Gmail để lưu lịch sử trò chuyện với trợ lý AI và xem lại lúc nào cũng được.' }));

    if (!state.ready) {
      panel.appendChild(el('p', { class: 'muted small', text: 'Đang kiểm tra…' }));
    } else if (!state.enabled) {
      panel.appendChild(el('p', { class: 'notice', text: 'Tính năng đăng nhập chưa được bật trên máy chủ này. Bạn vẫn dùng trợ lý bình thường, nhưng lịch sử sẽ không được lưu.' }));
    } else {
      var host = el('div', { class: 'gsi-host' });
      panel.appendChild(host);
      showGoogleButton(host);
    }
    addStatus();
    if (state.enabled) {
      panel.appendChild(el('p', { class: 'muted small account-privacy', text: 'Chúng mình chỉ lưu tên, email và nội dung trò chuyện của bạn để hiển thị lại. Bạn có thể xóa lịch sử hoặc đăng xuất bất cứ lúc nào.' }));
    }
  }

  /* ---------- Nút Google ---------- */
  function loadGsi() {
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = GSI_SRC;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { gsiPromise = null; reject(new Error('gsi_load')); };
      document.head.appendChild(s);
    });
    return gsiPromise;
  }

  function showGoogleButton(host) {
    loadGsi().then(function () {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) throw new Error('gsi_missing');
      if (!gsiInitialised) {
        window.google.accounts.id.initialize({ client_id: state.clientId, callback: onCredential, ux_mode: 'popup' });
        gsiInitialised = true;
      }
      if (!host.isConnected) return;
      var width = Math.max(200, Math.min(300, panel.clientWidth - 40));
      window.google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'vi', width: width });
    }).catch(function () {
      if (host.isConnected) host.appendChild(el('p', { class: 'account-status small', role: 'alert', text: 'Không tải được nút đăng nhập của Google. Vui lòng kiểm tra kết nối mạng rồi thử lại.' }));
    });
  }

  function onCredential(response) {
    if (!response || !response.credential) return;
    status = 'Đang đăng nhập…';
    if (isOpen()) renderPanel();
    postJson(AUTH_URL, { action: 'login', credential: response.credential }).then(function (r) {
      if (r.ok && r.body && r.body.user) {
        status = '';
        setUser(r.body.user);
        close(true);
        return;
      }
      status = r.status === 429 ? 'Bạn đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút.'
        : r.status === 401 ? 'Không xác thực được tài khoản Google. Vui lòng thử lại.'
        : r.status === 503 ? 'Tính năng đăng nhập chưa được cấu hình xong trên máy chủ.'
        : 'Chưa đăng nhập được, vui lòng thử lại sau.';
      if (isOpen()) renderPanel();
    }).catch(function () {
      status = 'Chưa đăng nhập được, vui lòng kiểm tra kết nối rồi thử lại.';
      if (isOpen()) renderPanel();
    });
  }

  function logout() {
    postJson(AUTH_URL, { action: 'logout' }).catch(function () {}).then(function () {
      if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.disableAutoSelect();
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

  /* ---------- Khởi tạo ---------- */
  function init() {
    btn = document.getElementById('accountBtn');
    panel = document.getElementById('accountPanel');
    if (!btn || !panel) return;
    panel.setAttribute('tabindex', '-1');

    btn.addEventListener('click', function () { if (isOpen()) close(false); else open(); });
    document.addEventListener('click', function (e) {
      if (isOpen() && !e.target.closest('.account')) close(false);
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
          state.enabled = j.enabled === true && typeof j.client_id === 'string' && j.client_id !== '';
          state.clientId = state.enabled ? j.client_id : '';
          if (j.user && typeof j.user.name === 'string') setUser(j.user);
        }
        if (isOpen()) renderPanel();
      });
  }

  window.Auth = { user: null, init: init };
  init();
})();
