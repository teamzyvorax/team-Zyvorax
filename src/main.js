import './styles.css';

const state = {
  theme: localStorage.getItem('zyvorax-theme') || 'dark',
  history: JSON.parse(localStorage.getItem('zyvorax-history') || '[]'),
  space: null,
};

const spaces = {
  website: {
    icon: '◈',
    title: 'Website Launch Space',
    subtitle: 'Turn an intent into a launch-ready workflow.',
    steps: ['Define goal', 'Create workspace', 'Preview', 'Launch'],
    actions: ['Create project', 'Open preview', 'Plan deployment'],
  },
  plan: {
    icon: '✦',
    title: 'Build Plan Space',
    subtitle: 'Convert an idea into an executable plan.',
    steps: ['Capture idea', 'Break into tasks', 'Set priorities', 'Execute'],
    actions: ['Generate plan', 'Prioritize work', 'Start execution'],
  },
  learn: {
    icon: '◎',
    title: 'Learning Space',
    subtitle: 'Create a focused path from question to understanding.',
    steps: ['Choose topic', 'Map concepts', 'Practice', 'Review'],
    actions: ['Create lesson', 'Make practice set', 'Review progress'],
  },
  organize: {
    icon: '⌘',
    title: 'Organize Space',
    subtitle: 'Turn scattered information into a clear next action.',
    steps: ['Collect', 'Understand', 'Organize', 'Act'],
    actions: ['Organize items', 'Find next action', 'Create workflow'],
  },
};

function save() {
  localStorage.setItem('zyvorax-theme', state.theme);
  localStorage.setItem('zyvorax-history', JSON.stringify(state.history.slice(-20)));
}

function detectIntent(input) {
  const text = input.toLowerCase();
  if (/website|web site|deploy|landing|site/.test(text)) return 'website';
  if (/plan|project|build|app|startup|idea/.test(text)) return 'plan';
  if (/learn|study|course|understand|teach/.test(text)) return 'learn';
  return 'organize';
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  save();
  render();
}

function executeIntent(input) {
  const intent = detectIntent(input);
  state.space = { ...spaces[intent], input };
  state.history.push({ input, intent, at: new Date().toISOString() });
  save();
  render();
  setTimeout(() => document.querySelector('.space-shell')?.classList.add('revealed'), 20);
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="app-shell">
      <aside class="rail">
        <button class="brand" data-action="home" aria-label="Team ZyvoraX home">
          <span class="brand-mark">Z</span><span class="brand-name">TEAM ZYVORAX</span>
        </button>
        <nav class="rail-nav" aria-label="Primary navigation">
          <button class="nav-item active" data-action="home"><span>⌂</span> Home</button>
          <button class="nav-item" data-action="discover"><span>✦</span> Discover</button>
          <button class="nav-item" data-action="activity"><span>◷</span> Activity</button>
          <button class="nav-item" data-action="policies"><span>□</span> Policies</button>
        </nav>
        <div class="rail-bottom">
          <button class="icon-button" data-action="theme" aria-label="Toggle theme">${state.theme === 'dark' ? '☼' : '☾'}</button>
          <button class="profile" data-action="profile"><span class="avatar">T</span><span><b>Team ZyvoraX</b><small>Local workspace</small></span></button>
        </div>
      </aside>

      <main class="main-stage">
        <header class="topbar">
          <span class="status-dot"></span><span>Adaptive workspace</span>
          <div class="top-actions"><button class="ghost" data-action="policies">Trust & policies</button></div>
        </header>

        ${state.space ? renderSpace() : renderHome()}
      </main>
    </div>
  `;
  bindEvents();
}

function renderHome() {
  return `
    <section class="hero-section">
      <div class="eyebrow">TEAM ZYVORAX / 01</div>
      <h1>What are you<br/><em>trying to do?</em></h1>
      <p class="hero-copy">Describe the outcome. ZyvoraX shapes the workspace around your intent instead of forcing you through a fixed menu.</p>

      <form class="intent-box" id="intent-form">
        <label for="intent">Your intent</label>
        <textarea id="intent" rows="3" placeholder="e.g. I need to launch a website..." autofocus></textarea>
        <div class="intent-footer">
          <span>Text is processed locally in this demo.</span>
          <button class="primary" type="submit">Create my space <span>→</span></button>
        </div>
      </form>

      <div class="suggestions">
        <button data-intent="I need to launch a website">Launch a website <span>↗</span></button>
        <button data-intent="Help me build a project plan">Build a plan <span>↗</span></button>
        <button data-intent="I want to learn a new topic">Learn something <span>↗</span></button>
      </div>

      <section class="value-grid">
        <article><span>01</span><b>Intent first</b><p>Start with the outcome, not a maze of features.</p></article>
        <article><span>02</span><b>Adaptive space</b><p>The workspace changes around the job you are doing.</p></article>
        <article><span>03</span><b>User control</b><p>Preview actions before anything consequential happens.</p></article>
      </section>
    </section>
  `;
}

function renderSpace() {
  const s = state.space;
  return `
    <section class="space-shell">
      <div class="space-head">
        <div><div class="space-icon">${s.icon}</div><div class="eyebrow">ACTIVE SPACE</div><h2>${s.title}</h2><p>${s.subtitle}</p></div>
        <button class="ghost" data-action="home">← New intent</button>
      </div>
      <div class="intent-result"><span>Your intent</span><b>${escapeHtml(s.input)}</b></div>
      <div class="workspace-grid">
        <section class="panel workflow"><div class="panel-title"><span>Workflow</span><span class="live">LIVE</span></div>
          ${s.steps.map((step, i) => `<div class="step"><span>${String(i + 1).padStart(2, '0')}</span><b>${step}</b>${i === 0 ? '<i>Ready</i>' : '<small>Next</small>'}</div>`).join('')}
        </section>
        <section class="panel actions"><div class="panel-title"><span>Suggested actions</span><span>3</span></div>
          ${s.actions.map((a, i) => `<button class="action-card" data-action="toast" data-message="${escapeAttr(a + ' — preview created')}" ><span>${['✦','→','◌'][i]}</span><b>${a}</b><small>Preview first</small><strong>↗</strong></button>`).join('')}
        </section>
      </div>
      <section class="panel safety"><span class="shield">◇</span><div><b>Control stays with you.</b><p>This prototype does not call external APIs, deploy infrastructure, or change accounts. Real integrations will require explicit authorization and verified credentials.</p></div></section>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll('[data-action]').forEach((el) => el.addEventListener('click', () => {
    const action = el.dataset.action;
    if (action === 'theme') setTheme(state.theme === 'dark' ? 'light' : 'dark');
    else if (action === 'home') { state.space = null; render(); }
    else if (action === 'toast') showToast(el.dataset.message);
    else if (action === 'policies') showPolicyCenter();
    else if (action === 'discover') showToast('Discover is ready for the next product module.');
    else if (action === 'activity') showToast(`${state.history.length} intent${state.history.length === 1 ? '' : 's'} recorded locally.`);
    else if (action === 'profile') showToast('Local workspace — authentication is not connected yet.');
  }));

  document.querySelectorAll('[data-intent]').forEach((el) => el.addEventListener('click', () => executeIntent(el.dataset.intent)));
  const form = document.querySelector('#intent-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.querySelector('#intent')?.value.trim();
    if (!input) return showToast('Tell ZyvoraX what outcome you want.');
    executeIntent(input);
  });
}

function showPolicyCenter() {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal"><button class="modal-close">×</button><div class="eyebrow">TEAM ZYVORAX / TRUST CENTER</div><h2>Policies & ownership</h2><p>These documents define the product boundaries. They are product drafts, not legal advice.</p><div class="policy-list">${['Terms of Service','Privacy Policy','Software License','AI Safety Policy','Data Retention & Deletion','Security Policy','Acceptable Use Policy','Copyright & IP Policy','Third-Party & Open Source Notices'].map(x => `<button>${x}<span>↗</span></button>`).join('')}</div><div class="notice">© 2026 Team ZyvoraX. All rights reserved. Third-party dependencies remain subject to their own licenses.</div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.modal-close').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

function showToast(message) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

render();
