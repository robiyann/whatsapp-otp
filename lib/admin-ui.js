function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout({ title, content, activePath = '', flash = '' }) {
  const navItems = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/numbers', label: 'Numbers' },
    { href: '/admin/access', label: 'Access' },
    { href: '/admin/logs', label: 'Logs' },
  ];

  const nav = navItems.map(item => {
    const activeClass = activePath === item.href ? 'nav-link active' : 'nav-link';
    return `<a class="${activeClass}" href="${item.href}">${item.label}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f7f2ea;
      --card: #fffdf8;
      --ink: #172121;
      --muted: #5f6b6d;
      --line: #e4d8c7;
      --accent: #b24c2f;
      --accent-dark: #7c2f1a;
      --good: #1f7a4c;
      --warn: #9c6b00;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top left, rgba(178, 76, 47, 0.12), transparent 35%),
        linear-gradient(180deg, #fbf6ef 0%, var(--bg) 100%);
      color: var(--ink);
    }
    a { color: inherit; text-decoration: none; }
    .shell {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }
    .brand h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1;
    }
    .brand p {
      margin: 6px 0 0;
      color: var(--muted);
    }
    .nav {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .nav-link {
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.6);
      border: 1px solid transparent;
    }
    .nav-link.active {
      background: var(--card);
      border-color: var(--line);
      color: var(--accent-dark);
      font-weight: bold;
    }
    .flash {
      padding: 12px 14px;
      background: #fff1d9;
      border: 1px solid #f0cf88;
      border-radius: 16px;
      margin-bottom: 18px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 18px;
      box-shadow: 0 14px 28px rgba(23, 33, 33, 0.06);
    }
    .card h2, .card h3 {
      margin-top: 0;
    }
    .eyebrow {
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 12px;
      margin-bottom: 6px;
    }
    .metric {
      font-size: 34px;
      font-weight: bold;
    }
    .muted { color: var(--muted); }
    .stack { display: grid; gap: 18px; }
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    th, td {
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    form.inline { display: inline; }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 14px;
      color: var(--muted);
    }
    input, select, textarea, button {
      font: inherit;
    }
    input, select, textarea {
      width: 100%;
      padding: 11px 12px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
    }
    textarea {
      min-height: 96px;
      resize: vertical;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 14px;
    }
    .btn {
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid var(--accent);
      background: var(--accent);
      color: #fff;
      cursor: pointer;
    }
    .btn.secondary {
      background: transparent;
      color: var(--accent-dark);
    }
    .tag {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid var(--line);
      margin-right: 6px;
      margin-bottom: 6px;
    }
    .tag.good {
      border-color: rgba(31, 122, 76, 0.35);
      color: var(--good);
      background: rgba(31, 122, 76, 0.08);
    }
    .tag.warn {
      border-color: rgba(156, 107, 0, 0.35);
      color: var(--warn);
      background: rgba(156, 107, 0, 0.08);
    }
    .auth-shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 20px;
    }
    .auth-card {
      width: min(460px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 26px;
      padding: 28px;
      box-shadow: 0 24px 50px rgba(23, 33, 33, 0.08);
    }
    @media (max-width: 720px) {
      .shell { padding: 16px; }
      .topbar { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="topbar">
      <div class="brand">
        <h1>OTP Control Room</h1>
        <p>Panel admin untuk kelola user, nomor, dan routing OTP.</p>
      </div>
      <form method="post" action="/admin/logout">
        <button class="btn secondary" type="submit">Logout</button>
      </form>
    </div>
    <nav class="nav">${nav}</nav>
    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}
    ${content}
  </div>
</body>
</html>`;
}

function renderLoginPage({ error = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Login</title>
  <style>
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background:
        linear-gradient(135deg, rgba(178, 76, 47, 0.10), transparent 35%),
        radial-gradient(circle at bottom right, rgba(31, 122, 76, 0.12), transparent 26%),
        #f7f2ea;
      color: #172121;
    }
    .auth-shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 20px;
    }
    .auth-card {
      width: min(440px, 100%);
      background: rgba(255, 253, 248, 0.96);
      border: 1px solid #e4d8c7;
      border-radius: 26px;
      padding: 28px;
      box-shadow: 0 24px 50px rgba(23, 33, 33, 0.10);
    }
    h1 { margin-top: 0; }
    p { color: #5f6b6d; }
    label {
      display: grid;
      gap: 6px;
      margin-top: 14px;
      color: #5f6b6d;
    }
    input {
      padding: 11px 12px;
      border-radius: 14px;
      border: 1px solid #e4d8c7;
      font: inherit;
    }
    button {
      margin-top: 18px;
      width: 100%;
      padding: 12px 14px;
      border-radius: 999px;
      border: 1px solid #b24c2f;
      background: #b24c2f;
      color: #fff;
      font: inherit;
      cursor: pointer;
    }
    .error {
      margin-top: 12px;
      padding: 11px 12px;
      border-radius: 14px;
      background: #ffe4dc;
      color: #7c2f1a;
      border: 1px solid #f1b1a0;
    }
  </style>
</head>
<body>
  <div class="auth-shell">
    <div class="auth-card">
      <h1>Admin Login</h1>
      <p>Gunakan akun admin untuk mengatur user, nomor OTP, dan hak aksesnya.</p>
      <form method="post" action="/admin/login">
        <label>
          Username
          <input type="text" name="username" autocomplete="username" required>
        </label>
        <label>
          Password
          <input type="password" name="password" autocomplete="current-password" required>
        </label>
        <button type="submit">Masuk ke Panel</button>
      </form>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

function renderDashboard(data) {
  return layout({
    title: 'Dashboard',
    activePath: '/admin',
    flash: data.flash,
    content: `
      <section class="grid">
        <div class="card">
          <div class="eyebrow">Active users</div>
          <div class="metric">${data.metrics.activeUsers}</div>
          <div class="muted">User Telegram yang boleh menerima OTP</div>
        </div>
        <div class="card">
          <div class="eyebrow">Active numbers</div>
          <div class="metric">${data.metrics.activeNumbers}</div>
          <div class="muted">Nomor/sender yang sedang aktif diproses</div>
        </div>
        <div class="card">
          <div class="eyebrow">Assignments</div>
          <div class="metric">${data.metrics.assignments}</div>
          <div class="muted">Relasi akses user ke nomor</div>
        </div>
        <div class="card">
          <div class="eyebrow">Recent OTP</div>
          <div class="metric">${data.metrics.otpLogs}</div>
          <div class="muted">Log OTP terakhir yang tersimpan</div>
        </div>
      </section>
      <section class="grid">
        <div class="card">
          <h2>Quick guide</h2>
          <p class="muted">Urutan setup tercepat:</p>
          <ol>
            <li>Daftarkan user Telegram di halaman Users.</li>
            <li>Daftarkan sender/nomor OTP di halaman Numbers.</li>
            <li>Hubungkan keduanya di halaman Access.</li>
            <li>Minta user kirim <code>/start</code> ke bot agar chat ID mereka sudah pernah aktif.</li>
          </ol>
        </div>
        <div class="card">
          <h2>Recent OTP</h2>
          ${data.recentLogs.length === 0 ? '<p class="muted">Belum ada log OTP.</p>' : `
            <div class="stack">
              ${data.recentLogs.map(log => `
                <div>
                  <div><strong>${escapeHtml(log.numberLabel || log.sender || 'Unknown sender')}</strong></div>
                  <div class="muted">${escapeHtml(log.otp)} | ${escapeHtml(log.timestamp)}</div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </section>
    `,
  });
}

function renderUsersPage(data) {
  return layout({
    title: 'Users',
    activePath: '/admin/users',
    flash: data.flash,
    content: `
      <section class="grid">
        <div class="card">
          <h2>Add or update user</h2>
          <form method="post" action="/admin/users">
            <div class="form-grid">
              <label>
                Telegram Chat ID
                <input type="text" name="telegramChatId" required>
              </label>
              <label>
                Username
                <input type="text" name="username">
              </label>
              <label>
                Display name
                <input type="text" name="displayName" required>
              </label>
              <label>
                Role
                <select name="isAdmin">
                  <option value="false">User</option>
                  <option value="true">Admin</option>
                </select>
              </label>
              <label>
                Status
                <select name="isActive">
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>
            <div class="actions">
              <button class="btn" type="submit">Save user</button>
            </div>
          </form>
        </div>
      </section>
      <section class="card">
        <h2>Registered users</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Telegram</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.users.map(user => `
                <tr>
                  <td>
                    <strong>${escapeHtml(user.displayName)}</strong><br>
                    <span class="muted">${escapeHtml(user.createdAt)}</span>
                  </td>
                  <td>
                    <div>${escapeHtml(user.telegramChatId)}</div>
                    <div class="muted">@${escapeHtml(user.username || '-')}</div>
                  </td>
                  <td>${user.isAdmin ? '<span class="tag good">Admin</span>' : '<span class="tag">User</span>'}</td>
                  <td>${user.isActive ? '<span class="tag good">Active</span>' : '<span class="tag warn">Inactive</span>'}</td>
                  <td>
                    ${data.numberMap[user.id] && data.numberMap[user.id].length
                      ? data.numberMap[user.id].map(number => `<span class="tag">${escapeHtml(number.label)}</span>`).join('')
                      : '<span class="muted">No access</span>'}
                  </td>
                  <td>
                    <form class="inline" method="post" action="/admin/users/${user.id}/toggle">
                      <button class="btn secondary" type="submit">${user.isActive ? 'Disable' : 'Enable'}</button>
                    </form>
                    <form class="inline" method="post" action="/admin/users/${user.id}/delete" onsubmit="return confirm('Delete this user?')">
                      <button class="btn secondary" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `,
  });
}

function renderNumbersPage(data) {
  return layout({
    title: 'Numbers',
    activePath: '/admin/numbers',
    flash: data.flash,
    content: `
      <section class="grid">
        <div class="card">
          <h2>Add OTP number</h2>
          <form method="post" action="/admin/numbers">
            <div class="form-grid">
              <label>
                Label
                <input type="text" name="label" placeholder="Shopee-01" required>
              </label>
              <label>
                Sender key
                <input type="text" name="senderKey" placeholder="+62812..., Shopee, BANKXYZ" required>
              </label>
              <label>
                Status
                <select name="isActive">
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea name="description" placeholder="Catatan singkat untuk nomor ini"></textarea>
            </label>
            <div class="actions">
              <button class="btn" type="submit">Save number</button>
            </div>
          </form>
        </div>
      </section>
      <section class="card">
        <h2>OTP numbers</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Sender match</th>
                <th>Status</th>
                <th>Assigned users</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.numbers.map(number => `
                <tr>
                  <td>
                    <strong>${escapeHtml(number.label)}</strong><br>
                    <span class="muted">${escapeHtml(number.description || '-')}</span>
                  </td>
                  <td>${escapeHtml(number.senderKey)}</td>
                  <td>${number.isActive ? '<span class="tag good">Active</span>' : '<span class="tag warn">Inactive</span>'}</td>
                  <td>
                    ${data.userMap[number.id] && data.userMap[number.id].length
                      ? data.userMap[number.id].map(user => `<span class="tag">${escapeHtml(user.displayName)}</span>`).join('')
                      : '<span class="muted">No users</span>'}
                  </td>
                  <td>
                    <form class="inline" method="post" action="/admin/numbers/${number.id}/toggle">
                      <button class="btn secondary" type="submit">${number.isActive ? 'Disable' : 'Enable'}</button>
                    </form>
                    <form class="inline" method="post" action="/admin/numbers/${number.id}/delete" onsubmit="return confirm('Delete this number?')">
                      <button class="btn secondary" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `,
  });
}

function renderAccessPage(data) {
  return layout({
    title: 'Access',
    activePath: '/admin/access',
    flash: data.flash,
    content: `
      <section class="grid">
        <div class="card">
          <h2>Assign access</h2>
          <form method="post" action="/admin/access/assign">
            <div class="form-grid">
              <label>
                User
                <select name="userId" required>
                  <option value="">Choose user</option>
                  ${data.users.map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName)} (${escapeHtml(user.telegramChatId)})</option>`).join('')}
                </select>
              </label>
              <label>
                Number
                <select name="numberId" required>
                  <option value="">Choose number</option>
                  ${data.numbers.map(number => `<option value="${escapeHtml(number.id)}">${escapeHtml(number.label)} (${escapeHtml(number.senderKey)})</option>`).join('')}
                </select>
              </label>
            </div>
            <div class="actions">
              <button class="btn" type="submit">Assign</button>
            </div>
          </form>
        </div>
      </section>
      <section class="card">
        <h2>Current assignments</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Number</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.assignments.map(entry => `
                <tr>
                  <td>${escapeHtml(entry.user.displayName)}<br><span class="muted">${escapeHtml(entry.user.telegramChatId)}</span></td>
                  <td>${escapeHtml(entry.number.label)}<br><span class="muted">${escapeHtml(entry.number.senderKey)}</span></td>
                  <td>${escapeHtml(entry.createdAt)}</td>
                  <td>
                    <form class="inline" method="post" action="/admin/access/revoke">
                      <input type="hidden" name="userId" value="${escapeHtml(entry.userId)}">
                      <input type="hidden" name="numberId" value="${escapeHtml(entry.numberId)}">
                      <button class="btn secondary" type="submit">Revoke</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `,
  });
}

function renderLogsPage(data) {
  return layout({
    title: 'Logs',
    activePath: '/admin/logs',
    flash: data.flash,
    content: `
      <section class="card">
        <h2>Recent OTP logs</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Number</th>
                <th>OTP</th>
                <th>Status</th>
                <th>Recipients</th>
              </tr>
            </thead>
            <tbody>
              ${data.logs.map(log => `
                <tr>
                  <td>${escapeHtml(log.timestamp)}</td>
                  <td>
                    <strong>${escapeHtml(log.numberLabel || '-') }</strong><br>
                    <span class="muted">${escapeHtml(log.sender || '-')}</span>
                  </td>
                  <td><code>${escapeHtml(log.otp || '-')}</code></td>
                  <td>${escapeHtml(log.status)}</td>
                  <td>${log.deliveredTo && log.deliveredTo.length ? escapeHtml(log.deliveredTo.join(', ')) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `,
  });
}

module.exports = {
  escapeHtml,
  renderLoginPage,
  renderDashboard,
  renderUsersPage,
  renderNumbersPage,
  renderAccessPage,
  renderLogsPage,
};
