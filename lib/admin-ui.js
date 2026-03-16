function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function userLabel(user) {
  if (user.username) return `@${user.username}`;
  return user.telegramChatId;
}

function pageShell({ title, activePath, flash, content }) {
  const navItems = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/numbers', label: 'Numbers' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/logs', label: 'Logs' },
  ];

  const nav = navItems.map(item => {
    const activeClass = item.href === activePath ? 'nav-link active' : 'nav-link';
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
      --bg: #f5f0e7;
      --card: #fffdfa;
      --line: #e6d8c7;
      --ink: #182025;
      --muted: #617076;
      --accent: #0f766e;
      --accent-2: #b45309;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.10), transparent 30%),
        radial-gradient(circle at bottom right, rgba(180, 83, 9, 0.10), transparent 25%),
        var(--bg);
    }
    a { color: inherit; text-decoration: none; }
    .shell { max-width: 1240px; margin: 0 auto; padding: 24px; }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .brand h1 { margin: 0; font-size: 32px; }
    .brand p { margin: 6px 0 0; color: var(--muted); }
    .nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    .nav-link {
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid transparent;
      background: rgba(255,255,255,0.55);
    }
    .nav-link.active {
      background: var(--card);
      border-color: var(--line);
      color: var(--accent);
      font-weight: bold;
    }
    .flash {
      margin-bottom: 16px;
      padding: 12px 14px;
      border-radius: 14px;
      background: #eefbf8;
      border: 1px solid #b7ece1;
    }
    .grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      margin-bottom: 18px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 18px;
      box-shadow: 0 14px 28px rgba(0, 0, 0, 0.05);
    }
    .card h2, .card h3 { margin-top: 0; }
    .muted { color: var(--muted); }
    .metric { font-size: 34px; font-weight: bold; }
    .eyebrow {
      text-transform: uppercase;
      font-size: 12px;
      color: var(--muted);
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 14px;
      color: var(--muted);
    }
    input, textarea, select, button {
      font: inherit;
    }
    input, textarea, select {
      width: 100%;
      padding: 11px 12px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
    }
    textarea { min-height: 88px; resize: vertical; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
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
      color: var(--accent);
    }
    .btn.danger {
      border-color: var(--danger);
      color: var(--danger);
      background: transparent;
    }
    .stack { display: grid; gap: 14px; }
    .number-card {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
      background: rgba(255,255,255,0.58);
    }
    .pill {
      display: inline-block;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 12px;
      margin-right: 6px;
      margin-bottom: 6px;
    }
    .pill.good { color: var(--accent); border-color: rgba(15, 118, 110, 0.35); background: rgba(15, 118, 110, 0.08); }
    .pill.warn { color: var(--accent-2); border-color: rgba(180, 83, 9, 0.35); background: rgba(180, 83, 9, 0.08); }
    .checklist {
      display: grid;
      gap: 8px;
      max-height: 180px;
      overflow: auto;
      padding: 8px 0;
    }
    .check-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 12px;
      background: rgba(245, 240, 231, 0.8);
    }
    .check-row input { width: auto; margin: 0; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      color: var(--muted);
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.06em;
    }
    .inline { display: inline; }
    .split {
      display: grid;
      grid-template-columns: 1.05fr 1.4fr;
      gap: 18px;
      align-items: start;
    }
    .subtle-box {
      padding: 12px;
      border: 1px dashed var(--line);
      border-radius: 14px;
      background: rgba(255,255,255,0.45);
    }
    @media (max-width: 900px) {
      .split { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
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
        <p>Kelola nomor, user Telegram, dan routing OTP dari satu panel.</p>
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
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 20px;
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 35%),
        #f5f0e7;
      color: #182025;
    }
    .card {
      width: min(420px, 100%);
      background: #fffdfa;
      border: 1px solid #e6d8c7;
      border-radius: 24px;
      padding: 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.08);
    }
    label { display: grid; gap: 6px; margin-top: 14px; color: #617076; }
    input {
      padding: 11px 12px;
      border-radius: 14px;
      border: 1px solid #e6d8c7;
      font: inherit;
    }
    button {
      margin-top: 18px;
      width: 100%;
      padding: 12px;
      border-radius: 999px;
      border: 1px solid #0f766e;
      background: #0f766e;
      color: #fff;
      font: inherit;
      cursor: pointer;
    }
    .error {
      margin-top: 12px;
      padding: 11px 12px;
      border-radius: 14px;
      background: #fff1f2;
      border: 1px solid #fecdd3;
      color: #9f1239;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Admin Login</h1>
    <p>Masuk ke panel untuk atur nomor OTP dan siapa yang boleh menerimanya.</p>
    <form method="post" action="/admin/login">
      <label>Username<input type="text" name="username" required></label>
      <label>Password<input type="password" name="password" required></label>
      <button type="submit">Masuk</button>
    </form>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
  </div>
</body>
</html>`;
}

function renderDashboard({ flash, metrics, recentLogs }) {
  return pageShell({
    title: 'Dashboard',
    activePath: '/admin',
    flash,
    content: `
      <section class="grid">
        <div class="card"><div class="eyebrow">Active users</div><div class="metric">${metrics.activeUsers}</div></div>
        <div class="card"><div class="eyebrow">Active numbers</div><div class="metric">${metrics.activeNumbers}</div></div>
        <div class="card"><div class="eyebrow">Assignments</div><div class="metric">${metrics.assignments}</div></div>
        <div class="card"><div class="eyebrow">OTP logs</div><div class="metric">${metrics.otpLogs}</div></div>
      </section>
      <section class="split">
        <div class="card">
          <h2>Setup cepat</h2>
          <div class="stack muted">
            <div>1. Tambah user Telegram di halaman Users.</div>
            <div>2. Tambah nomor di halaman Numbers dengan <code>number_key</code> dari MacroDroid.</div>
            <div>3. Pilih user yang boleh menerima OTP untuk nomor itu langsung di halaman Numbers.</div>
            <div>4. Minta user kirim <code>/start</code> ke bot sekali agar chat Telegram-nya aktif.</div>
          </div>
        </div>
        <div class="card">
          <h2>OTP terbaru</h2>
          ${recentLogs.length === 0 ? '<div class="muted">Belum ada log OTP.</div>' : `
            <div class="stack">
              ${recentLogs.map(log => `
                <div class="subtle-box">
                  <strong>${escapeHtml(log.numberLabel || log.numberKey || '-')}</strong><br>
                  <span class="muted">${escapeHtml(log.otp)} | ${escapeHtml(log.sender || '-')} | ${escapeHtml(log.timestamp)}</span>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </section>
    `,
  });
}

function renderUsersPage({ flash, users, numbers, numberMap }) {
  return pageShell({
    title: 'Users',
    activePath: '/admin/users',
    flash,
    content: `
      <section class="card">
        <h2>User Telegram</h2>
        <div class="muted" style="margin-bottom:14px;">Edit user dan pilih nomor langsung di setiap baris. Username isi tanpa <code>@</code>.</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Chat ID</th>
                <th>Status</th>
                <th>Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <form method="post" action="/admin/users">
                  <td><input type="text" name="username" placeholder="username"></td>
                  <td><input type="text" name="telegramChatId" placeholder="chat id" required></td>
                  <td>
                    <select name="isActive">
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                    <div style="margin-top:8px;">
                      <select name="isAdmin">
                        <option value="false">User</option>
                        <option value="true">Admin</option>
                      </select>
                    </div>
                  </td>
                  <td class="muted">Pilih setelah user tersimpan</td>
                  <td><button class="btn" type="submit">Add</button></td>
                </form>
              </tr>
              ${users.map(user => `
                <tr>
                  <form method="post" action="/admin/users/${user.id}">
                    <td>
                      <input type="text" name="username" value="${escapeHtml(user.username)}" placeholder="username">
                      <div style="margin-top:8px;">${user.isAdmin ? '<span class="pill good">Admin</span>' : '<span class="pill">User</span>'}</div>
                    </td>
                    <td><input type="text" name="telegramChatId" value="${escapeHtml(user.telegramChatId)}"></td>
                    <td>
                      <select name="isActive">
                        <option value="true"${user.isActive ? ' selected' : ''}>Active</option>
                        <option value="false"${user.isActive ? '' : ' selected'}>Inactive</option>
                      </select>
                      <div style="margin-top:8px;">
                        <select name="isAdmin">
                          <option value="false"${user.isAdmin ? '' : ' selected'}>User</option>
                          <option value="true"${user.isAdmin ? ' selected' : ''}>Admin</option>
                        </select>
                      </div>
                    </td>
                    <td>
                      <div class="checklist">
                        ${numbers.length === 0
                          ? '<div class="muted">Belum ada nomor.</div>'
                          : numbers.map(number => `
                            <label class="check-row">
                              <input type="checkbox" name="numberIds" value="${escapeHtml(number.id)}"${(numberMap[user.id] || []).some(item => item.id === number.id) ? ' checked' : ''}>
                              <span>${escapeHtml(number.label)} <span class="muted">(${escapeHtml(number.numberKey)})</span></span>
                            </label>
                          `).join('')}
                      </div>
                    </td>
                    <td>
                      <button class="btn secondary" type="submit">Save</button>
                  </form>
                      <form class="inline" method="post" action="/admin/users/${user.id}/delete" onsubmit="return confirm('Delete this user?')">
                        <button class="btn danger" type="submit">Delete</button>
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

function renderNumbersPage({ flash, numbers, users, userMap }) {
  return pageShell({
    title: 'Numbers',
    activePath: '/admin/numbers',
    flash,
    content: `
      <section class="card">
        <h2>Numbers</h2>
        <div class="muted" style="margin-bottom:14px;">Nomor baru akan muncul otomatis dari webhook kalau number_key belum ada. Di sini kamu cukup rapikan label, fallback sender, dan status.</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Number key</th>
                <th>Sender fallback</th>
                <th>Status</th>
                <th>User</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <form method="post" action="/admin/numbers">
                  <td><input type="text" name="label" placeholder="Shopee-01" required></td>
                  <td><input type="text" name="numberKey" placeholder="wa-01" required></td>
                  <td><input type="text" name="senderKey" placeholder="Shopee"></td>
                  <td>
                    <select name="isActive">
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </td>
                  <td class="muted">Assign dari halaman Users</td>
                  <td><button class="btn" type="submit">Add</button></td>
                </form>
              </tr>
              ${numbers.map(number => `
                <tr>
                  <form method="post" action="/admin/numbers/${number.id}">
                    <td>
                      <input type="text" name="label" value="${escapeHtml(number.label)}" required>
                      <div style="margin-top:8px;" class="muted">${escapeHtml(number.description || '')}</div>
                    </td>
                    <td><input type="text" name="numberKey" value="${escapeHtml(number.numberKey)}" required></td>
                    <td><input type="text" name="senderKey" value="${escapeHtml(number.senderKey)}"></td>
                    <td>
                      <select name="isActive">
                        <option value="true"${number.isActive ? ' selected' : ''}>Active</option>
                        <option value="false"${number.isActive ? '' : ' selected'}>Inactive</option>
                      </select>
                      <input type="hidden" name="description" value="${escapeHtml(number.description)}">
                    </td>
                    <td>
                      ${(userMap[number.id] || []).length
                        ? userMap[number.id].map(user => `<span class="pill">${escapeHtml(userLabel(user))}</span>`).join('')
                        : '<span class="muted">No user</span>'}
                    </td>
                    <td>
                      <button class="btn secondary" type="submit">Save</button>
                  </form>
                      <form class="inline" method="post" action="/admin/numbers/${number.id}/delete" onsubmit="return confirm('Delete this number?')">
                        <button class="btn danger" type="submit">Delete</button>
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

function renderLogsPage({ flash, logs }) {
  return pageShell({
    title: 'Logs',
    activePath: '/admin/logs',
    flash,
    content: `
      <section class="card">
        <h2>OTP logs</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Number</th>
                <th>Sender</th>
                <th>OTP</th>
                <th>Status</th>
                <th>Recipients</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(log => `
                <tr>
                  <td>${escapeHtml(log.timestamp)}</td>
                  <td>
                    <strong>${escapeHtml(log.numberLabel || '-')}</strong><br>
                    <span class="muted">${escapeHtml(log.numberKey || '-')}</span>
                  </td>
                  <td>${escapeHtml(log.sender || '-')}</td>
                  <td><code>${escapeHtml(log.otp || '-')}</code></td>
                  <td>${escapeHtml(log.status)}</td>
                  <td>${log.deliveredTo.length ? escapeHtml(log.deliveredTo.join(', ')) : '-'}</td>
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
  renderLogsPage,
};
