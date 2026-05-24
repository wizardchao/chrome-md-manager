document.getElementById('openEditor').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  window.close();
});

document.getElementById('openFolder').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('editor.html?action=open') });
  window.close();
});

document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Display current shortcuts in popup
const shortcutLabels = {
  'open-editor': '打开编辑器',
  'open-editor-with-folder': '打开并选择文件夹',
  'quick-new-file': '快速新建文件',
};

function renderKeyBadges(shortcut) {
  if (!shortcut) return '<span class="not-set">未设置</span>';
  const parts = shortcut.replace('MacCtrl', 'Ctrl').replace('Command', 'Cmd').split('+');
  return '<span class="keys">' +
    parts.map(k => `<span class="key">${k}</span>`).join('<span class="key-sep">+</span>') +
    '</span>';
}

chrome.commands.getAll((commands) => {
  const container = document.getElementById('shortcutRows');
  for (const cmd of commands) {
    if (cmd.name === '_execute_action') continue;
    const label = shortcutLabels[cmd.name] || cmd.description || cmd.name;
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    row.innerHTML = `<span class="label">${label}</span>${renderKeyBadges(cmd.shortcut)}`;
    container.appendChild(row);
  }
});
