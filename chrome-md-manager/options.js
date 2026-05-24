(() => {
  'use strict';

  const shortcutList = document.getElementById('shortcutList');
  const testHint = document.getElementById('testHint');
  const testResult = document.getElementById('testResult');
  const toast = document.getElementById('toast');

  // Default shortcuts definition
  const commandMeta = {
    'open-editor': {
      name: '打开编辑器',
      desc: '在新标签页中打开 Markdown 编辑器工作区',
      defaultKey: 'Alt+M',
    },
    'open-editor-with-folder': {
      name: '打开编辑器并选择文件夹',
      desc: '打开编辑器后自动弹出文件夹选择框',
      defaultKey: 'Alt+Shift+M',
    },
    'quick-new-file': {
      name: '快速新建文件',
      desc: '打开编辑器并进入新建 Markdown 文件流程',
      defaultKey: 'Alt+N',
    },
  };

  // ============ Toast ============
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ============ Render shortcut keys as styled key caps ============
  function renderKeys(shortcut) {
    if (!shortcut) return '<span style="color:var(--text-s);font-size:12px">未设置</span>';
    const parts = shortcut.replace('MacCtrl', 'Ctrl').replace('Command', 'Cmd').split('+');
    return parts.map(k => `<span class="key">${k}</span>`).join('<span class="key-sep">+</span>');
  }

  // ============ Load & Render current shortcuts ============
  async function loadShortcuts() {
    shortcutList.innerHTML = '';

    try {
      const commands = await chrome.commands.getAll();

      for (const cmd of commands) {
        // Skip _execute_action (popup trigger)
        if (cmd.name === '_execute_action') continue;

        const meta = commandMeta[cmd.name] || {
          name: cmd.description || cmd.name,
          desc: '',
          defaultKey: '',
        };

        const item = document.createElement('div');
        item.className = 'shortcut-item';
        item.innerHTML = `
          <div class="shortcut-info">
            <div class="shortcut-name">${meta.name}</div>
            <div class="shortcut-desc">${meta.desc}</div>
          </div>
          <div class="shortcut-current">
            <div class="shortcut-keys">${renderKeys(cmd.shortcut)}</div>
            <span class="edit-hint">点击「修改快捷键」更改</span>
          </div>
        `;
        shortcutList.appendChild(item);
      }

      if (shortcutList.children.length === 0) {
        shortcutList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-s)">暂无已注册的快捷命令</div>';
      }
    } catch (e) {
      shortcutList.innerHTML = `<div style="text-align:center;padding:20px;color:var(--danger)">加载失败: ${e.message}</div>`;
    }
  }

  // ============ Open Chrome shortcuts page ============
  document.getElementById('btnOpenChromeShortcuts').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // ============ Reset defaults hint ============
  document.getElementById('btnResetDefaults').addEventListener('click', () => {
    showToast('请在 chrome://extensions/shortcuts 中手动重置快捷键');
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // ============ Key test area ============
  document.addEventListener('keydown', (e) => {
    // Only respond when test area is visible
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push(navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const key = e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
    }

    if (parts.length > 0) {
      testHint.style.display = 'none';
      testResult.style.display = 'inline';
      testResult.innerHTML = parts.map(k => `<span class="key" style="display:inline-flex">${k}</span>`).join(' <span class="key-sep">+</span> ');
    }
  });

  // ============ Theme sync ============
  function applyTheme() {
    try {
      const saved = localStorage.getItem('md-editor-theme');
      let theme = saved || 'auto';
      if (theme === 'auto') {
        const hour = new Date().getHours();
        theme = (hour >= 18 || hour < 6) ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) { /* ignore */ }
  }

  // ============ Init ============
  applyTheme();
  loadShortcuts();
})();
