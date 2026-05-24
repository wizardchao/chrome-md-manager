(() => {
  'use strict';

  // ============ State ============
  const state = {
    dirHandle: null,
    fileTree: [],       // [{name, path, handle, kind, children?, parent?}]
    openTabs: [],       // [{path, handle, content, modified}]
    activeTab: null,    // path
    viewMode: 'edit',   // edit | preview | split
    theme: 'auto',      // auto | light | dark
  };

  // Supported file extensions
  const SUPPORTED_EXTS = ['.md', '.markdown', '.html', '.htm'];

  function getFileType(name) {
    if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
    return 'markdown';
  }

  function isSupportedFile(name) {
    return SUPPORTED_EXTS.some(ext => name.endsWith(ext));
  }

  // ============ DOM Refs ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    btnOpenFolder: $('#btnOpenFolder'),
    btnNewFile: $('#btnNewFile'),
    btnNewFolder: $('#btnNewFolder'),
    btnSave: $('#btnSave'),
    btnDelete: $('#btnDelete'),
    btnRefresh: $('#btnRefresh'),
    folderName: $('#folderName'),
    searchInput: $('#searchInput'),
    fileTree: $('#fileTree'),
    editorTabs: $('#editorTabs'),
    editPane: $('#editPane'),
    previewPane: $('#previewPane'),
    markdownInput: $('#markdownInput'),
    markdownPreview: $('#markdownPreview'),
    formatBar: $('#formatBar'),
    modalOverlay: $('#modalOverlay'),
    modal: $('#modal'),
    modalHeader: $('#modalHeader'),
    modalBody: $('#modalBody'),
    modalCancel: $('#modalCancel'),
    modalConfirm: $('#modalConfirm'),
    toast: $('#toast'),
    resizeHandle: $('#resizeHandle'),
    sidebar: $('#sidebar'),
  };

  // ============ Markdown Config ============
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      gfm: true,
      breaks: true,
      highlight: (code, lang) => {
        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return typeof hljs !== 'undefined' ? hljs.highlightAuto(code).value : code;
      },
    });
  }

  // ============ Toast ============
  let toastTimer = null;
  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2500);
  }

  // ============ Modal ============
  function showModal(title, bodyHTML, onConfirm, confirmText = '确认', isDanger = false) {
    dom.modalHeader.textContent = title;
    dom.modalBody.innerHTML = bodyHTML;
    dom.modalConfirm.textContent = confirmText;
    dom.modalConfirm.className = isDanger ? 'btn btn-danger' : 'btn btn-confirm';
    dom.modalOverlay.style.display = 'flex';

    return new Promise((resolve) => {
      const cleanup = () => {
        dom.modalOverlay.style.display = 'none';
        dom.modalConfirm.removeEventListener('click', onOk);
        dom.modalCancel.removeEventListener('click', onCancel);
      };
      const onOk = () => { cleanup(); resolve(true); if (onConfirm) onConfirm(); };
      const onCancel = () => { cleanup(); resolve(false); };
      dom.modalConfirm.addEventListener('click', onOk);
      dom.modalCancel.addEventListener('click', onCancel);
    });
  }

  async function promptInput(title, label, defaultVal = '') {
    dom.modalHeader.textContent = title;
    dom.modalBody.innerHTML = `<label style="font-size:13px;color:#5f6368">${label}</label><input type="text" id="modalInput" value="${defaultVal}" autofocus>`;
    dom.modalConfirm.textContent = '确认';
    dom.modalConfirm.className = 'btn btn-confirm';
    dom.modalOverlay.style.display = 'flex';
    setTimeout(() => { const inp = $('#modalInput'); if (inp) { inp.focus(); inp.select(); } }, 50);

    return new Promise((resolve) => {
      const cleanup = () => {
        dom.modalOverlay.style.display = 'none';
        dom.modalConfirm.removeEventListener('click', onOk);
        dom.modalCancel.removeEventListener('click', onCancel);
      };
      const onOk = () => { const v = $('#modalInput')?.value?.trim(); cleanup(); resolve(v || null); };
      const onCancel = () => { cleanup(); resolve(null); };
      dom.modalConfirm.addEventListener('click', onOk);
      dom.modalCancel.addEventListener('click', onCancel);
      // Enter key
      dom.modalBody.querySelector('input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') onOk(); });
    });
  }

  // ============ File System ============
  async function openDirectory() {
    try {
      state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      dom.folderName.textContent = state.dirHandle.name;
      enableControls(true);
      await refreshFileTree();
      showToast(`已打开: ${state.dirHandle.name}`);
    } catch (e) {
      if (e.name !== 'AbortError') showToast('打开文件夹失败: ' + e.message);
    }
  }

  async function scanDirectory(dirHandle, path = '', depth = 0) {
    const items = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.')) continue; // skip hidden
      const fullPath = path ? `${path}/${name}` : name;
      if (handle.kind === 'directory') {
        const children = await scanDirectory(handle, fullPath, depth + 1);
        items.push({ name, path: fullPath, handle, kind: 'directory', children, depth });
      } else if (isSupportedFile(name)) {
        items.push({ name, path: fullPath, handle, kind: 'file', depth });
      }
    }
    // Sort: dirs first, then alphabetical
    items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return items;
  }

  async function refreshFileTree() {
    if (!state.dirHandle) return;
    state.fileTree = await scanDirectory(state.dirHandle);
    renderFileTree();
  }

  async function readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return await file.text();
  }

  async function writeFile(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async function createNewFile(dirHandle, fileName) {
    return await dirHandle.getFileHandle(fileName, { create: true });
  }

  async function deleteEntry(parentHandle, name, recursive = false) {
    await parentHandle.removeEntry(name, { recursive });
  }

  // Find parent handle for a given path
  async function getParentHandle(filePath) {
    const parts = filePath.split('/');
    parts.pop(); // remove file name
    let handle = state.dirHandle;
    for (const part of parts) {
      handle = await handle.getDirectoryHandle(part);
    }
    return handle;
  }

  // Find dir handle for a path
  async function getDirHandle(dirPath) {
    if (!dirPath) return state.dirHandle;
    const parts = dirPath.split('/');
    let handle = state.dirHandle;
    for (const part of parts) {
      handle = await handle.getDirectoryHandle(part);
    }
    return handle;
  }

  // ============ File Tree Rendering ============
  function renderFileTree(filter = '') {
    dom.fileTree.innerHTML = '';
    if (state.fileTree.length === 0) {
      dom.fileTree.innerHTML = '<div class="empty-state"><p>该文件夹中没有 Markdown / HTML 文件</p></div>';
      return;
    }
    const frag = document.createDocumentFragment();
    renderTreeItems(state.fileTree, frag, 0, filter.toLowerCase());
    dom.fileTree.appendChild(frag);
  }

  function renderTreeItems(items, container, depth, filter) {
    for (const item of items) {
      if (filter && item.kind === 'file' && !item.name.toLowerCase().includes(filter)) continue;

      const el = document.createElement('div');
      el.className = `tree-item ${item.kind === 'directory' ? 'dir' : ''} ${item.path === state.activeTab ? 'active' : ''}`;
      el.dataset.path = item.path;
      el.dataset.kind = item.kind;

      let indent = '';
      for (let i = 0; i < depth; i++) indent += '<span class="indent"></span>';

      if (item.kind === 'directory') {
        el.innerHTML = `${indent}<span class="arrow">&#9654;</span><span class="icon">&#128193;</span><span class="name">${item.name}</span>`;
      } else {
        const fileIcon = getFileType(item.name) === 'html' ? '&#127760;' : '&#128196;';
        el.innerHTML = `${indent}<span class="indent"></span><span class="icon">${fileIcon}</span><span class="name">${item.name}</span>`;
      }

      el.addEventListener('click', () => onTreeItemClick(item, el));
      el.addEventListener('contextmenu', (e) => onTreeItemContextMenu(e, item));
      container.appendChild(el);

      if (item.kind === 'directory' && item.children) {
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-children';
        childContainer.dataset.path = item.path;
        renderTreeItems(filter ? item.children : item.children, childContainer, depth + 1, filter);
        container.appendChild(childContainer);

        // If filtering, auto-expand dirs with matches
        if (filter && childContainer.children.length > 0) {
          childContainer.classList.add('open');
          el.querySelector('.arrow')?.classList.add('open');
        }
      }
    }
  }

  function onTreeItemClick(item, el) {
    if (item.kind === 'directory') {
      const arrow = el.querySelector('.arrow');
      const children = el.nextElementSibling;
      if (children && children.classList.contains('tree-children')) {
        children.classList.toggle('open');
        arrow?.classList.toggle('open');
      }
    } else {
      openFile(item);
    }
  }

  // ============ Context Menu ============
  let contextMenu = null;

  function removeContextMenu() {
    if (contextMenu) { contextMenu.remove(); contextMenu = null; }
  }

  document.addEventListener('click', removeContextMenu);

  function onTreeItemContextMenu(e, item) {
    e.preventDefault();
    removeContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';

    const actions = [];
    if (item.kind === 'directory') {
      actions.push({ label: '新建文件', icon: '&#43;', action: () => newFileInDir(item) });
      actions.push({ label: '新建子文件夹', icon: '&#128193;', action: () => newSubFolder(item) });
      actions.push({ sep: true });
      actions.push({ label: '删除文件夹', icon: '&#128465;', action: () => deleteItem(item), danger: true });
    } else {
      actions.push({ label: '打开', icon: '&#128196;', action: () => openFile(item) });
      actions.push({ label: '重命名', icon: '&#9998;', action: () => renameFile(item) });
      actions.push({ sep: true });
      actions.push({ label: '删除', icon: '&#128465;', action: () => deleteItem(item), danger: true });
    }

    for (const a of actions) {
      if (a.sep) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-sep';
        contextMenu.appendChild(sep);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = `context-menu-item ${a.danger ? 'danger' : ''}`;
        menuItem.innerHTML = `<span>${a.icon}</span> ${a.label}`;
        menuItem.addEventListener('click', () => { removeContextMenu(); a.action(); });
        contextMenu.appendChild(menuItem);
      }
    }

    document.body.appendChild(contextMenu);

    // Adjust position if off-screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) contextMenu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) contextMenu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  }

  // ============ File Operations ============
  async function openFile(item) {
    try {
      let tab = state.openTabs.find(t => t.path === item.path);
      if (!tab) {
        const content = await readFile(item.handle);
        const fileType = getFileType(item.name);
        tab = { path: item.path, name: item.name, handle: item.handle, content, original: content, modified: false, fileType };
        state.openTabs.push(tab);
      }
      state.activeTab = item.path;
      renderTabs();
      renderEditor();
      updateTreeActive();
      enableEditorControls(true);
    } catch (e) {
      showToast('打开文件失败: ' + e.message);
    }
  }

  async function newFileInDir(dirItem) {
    // Show type selection modal
    dom.modalHeader.textContent = '新建文件';
    dom.modalBody.innerHTML = `
      <label style="font-size:13px;color:#5f6368">文件类型：</label>
      <div style="display:flex;gap:10px;margin:10px 0 14px;">
        <label style="display:flex;align-items:center;gap:5px;padding:8px 14px;border:2px solid var(--primary);border-radius:8px;cursor:pointer;font-size:13px;background:var(--bg-active)">
          <input type="radio" name="fileType" value="md" checked style="accent-color:var(--primary)"> Markdown (.md)
        </label>
        <label style="display:flex;align-items:center;gap:5px;padding:8px 14px;border:2px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;" id="htmlTypeLabel">
          <input type="radio" name="fileType" value="html" style="accent-color:var(--primary)"> HTML (.html)
        </label>
      </div>
      <label style="font-size:13px;color:#5f6368">文件名（无需输入后缀）：</label>
      <input type="text" id="modalInput" value="untitled" autofocus>
    `;
    dom.modalConfirm.textContent = '创建';
    dom.modalConfirm.className = 'btn btn-confirm';
    dom.modalOverlay.style.display = 'flex';

    // Style toggle for radio buttons
    const radios = dom.modalBody.querySelectorAll('input[name="fileType"]');
    const labels = dom.modalBody.querySelectorAll('label[style*="border"]');
    radios.forEach((r, i) => {
      r.addEventListener('change', () => {
        labels.forEach((l, j) => {
          l.style.borderColor = j === [...radios].indexOf(dom.modalBody.querySelector('input[name="fileType"]:checked')) ? 'var(--primary)' : 'var(--border)';
          l.style.background = j === [...radios].indexOf(dom.modalBody.querySelector('input[name="fileType"]:checked')) ? 'var(--bg-active)' : 'transparent';
        });
      });
    });

    setTimeout(() => { const inp = dom.modalBody.querySelector('#modalInput'); if (inp) { inp.focus(); inp.select(); } }, 50);

    const result = await new Promise((resolve) => {
      const cleanup = () => {
        dom.modalOverlay.style.display = 'none';
        dom.modalConfirm.removeEventListener('click', onOk);
        dom.modalCancel.removeEventListener('click', onCancel);
      };
      const onOk = () => {
        const name = dom.modalBody.querySelector('#modalInput')?.value?.trim();
        const type = dom.modalBody.querySelector('input[name="fileType"]:checked')?.value || 'md';
        cleanup();
        resolve(name ? { name, type } : null);
      };
      const onCancel = () => { cleanup(); resolve(null); };
      dom.modalConfirm.addEventListener('click', onOk);
      dom.modalCancel.addEventListener('click', onCancel);
      dom.modalBody.querySelector('#modalInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') onOk(); });
    });

    if (!result) return;

    const ext = result.type === 'html' ? '.html' : '.md';
    const fullName = result.name.endsWith(ext) ? result.name : result.name + ext;
    const template = result.type === 'html'
      ? '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>' + result.name + '</title>\n  <style>\n    body { font-family: sans-serif; padding: 20px; }\n  </style>\n</head>\n<body>\n  <h1>' + result.name + '</h1>\n  <p></p>\n</body>\n</html>'
      : '';

    try {
      const dirH = dirItem ? await getDirHandle(dirItem.path) : state.dirHandle;
      const fileHandle = await createNewFile(dirH, fullName);
      await writeFile(fileHandle, template);
      await refreshFileTree();
      const path = dirItem ? `${dirItem.path}/${fullName}` : fullName;
      await openFile({ name: fullName, path, handle: fileHandle, kind: 'file' });
      showToast(`已创建: ${fullName}`);
    } catch (e) {
      showToast('创建失败: ' + e.message);
    }
  }

  async function newSubFolder(dirItem) {
    const name = await promptInput('新建文件夹', '文件夹名称：', '');
    if (!name) return;
    try {
      const dirH = dirItem ? await getDirHandle(dirItem.path) : state.dirHandle;
      await dirH.getDirectoryHandle(name, { create: true });
      await refreshFileTree();
      showToast(`已创建文件夹: ${name}`);
    } catch (e) {
      showToast('创建失败: ' + e.message);
    }
  }

  async function deleteItem(item) {
    const isDir = item.kind === 'directory';
    const confirmed = await showModal(
      `删除${isDir ? '文件夹' : '文件'}`,
      `<p>确定要删除 <strong>${item.name}</strong> 吗？${isDir ? '<br>文件夹内所有内容将被永久删除。' : ''}<br><br>此操作不可撤销。</p>`,
      null, '删除', true
    );
    if (!confirmed) return;
    try {
      const parentHandle = await getParentHandle(item.path);
      await deleteEntry(parentHandle, item.name, isDir);
      // Close tab if open
      state.openTabs = state.openTabs.filter(t => !t.path.startsWith(item.path));
      if (state.activeTab?.startsWith(item.path)) {
        state.activeTab = state.openTabs.length > 0 ? state.openTabs[state.openTabs.length - 1].path : null;
      }
      await refreshFileTree();
      renderTabs();
      renderEditor();
      showToast(`已删除: ${item.name}`);
    } catch (e) {
      showToast('删除失败: ' + e.message);
    }
  }

  async function renameFile(item) {
    const ext = item.name.match(/\.[^.]+$/)?.[0] || '.md';
    const baseName = item.name.replace(/\.[^.]+$/, '');
    const newName = await promptInput('重命名文件', `新文件名（保留 ${ext} 后缀）：`, baseName);
    if (!newName) return;
    const fullName = newName.endsWith(ext) ? newName : newName + ext;
    if (fullName === item.name) return;
    try {
      // Read content, create new, delete old
      const content = await readFile(item.handle);
      const parentHandle = await getParentHandle(item.path);
      const newHandle = await createNewFile(parentHandle, fullName);
      await writeFile(newHandle, content);
      await deleteEntry(parentHandle, item.name);
      // Update tab
      const tab = state.openTabs.find(t => t.path === item.path);
      if (tab) {
        const newPath = item.path.replace(/[^/]+$/, fullName);
        tab.path = newPath;
        tab.name = fullName;
        tab.handle = newHandle;
        if (state.activeTab === item.path) state.activeTab = newPath;
      }
      await refreshFileTree();
      renderTabs();
      showToast(`已重命名为: ${fullName}`);
    } catch (e) {
      showToast('重命名失败: ' + e.message);
    }
  }

  async function saveCurrentFile() {
    const tab = getActiveTabData();
    if (!tab || !tab.modified) return;
    try {
      await writeFile(tab.handle, tab.content);
      tab.original = tab.content;
      tab.modified = false;
      renderTabs();
      showToast('已保存');
    } catch (e) {
      showToast('保存失败: ' + e.message);
    }
  }

  // ============ Tabs ============
  function getActiveTabData() {
    return state.openTabs.find(t => t.path === state.activeTab);
  }

  function renderTabs() {
    dom.editorTabs.innerHTML = '';
    for (const tab of state.openTabs) {
      const el = document.createElement('div');
      el.className = `tab ${tab.path === state.activeTab ? 'active' : ''}`;
      el.innerHTML = `
        <span class="tab-type-badge ${tab.fileType === 'html' ? 'html' : 'md'}">${tab.fileType === 'html' ? 'HTML' : 'MD'}</span>
        <span class="name">${tab.name}</span>
        ${tab.modified ? '<span class="modified">\u25CF</span>' : ''}
        <span class="close" title="\u5173\u95ED">&times;</span>
      `;
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('close')) {
          closeTab(tab.path);
        } else {
          switchTab(tab.path);
        }
      });
      dom.editorTabs.appendChild(el);
    }
  }

  function switchTab(path) {
    // Save current textarea content before switching
    syncTextareaToTab();
    state.activeTab = path;
    renderTabs();
    renderEditor();
    updateTreeActive();
    enableEditorControls(true);
  }

  function closeTab(path) {
    const tab = state.openTabs.find(t => t.path === path);
    if (tab?.modified) {
      showModal('未保存的更改', `<p><strong>${tab.name}</strong> 有未保存的更改，确定关闭吗？</p>`, null, '关闭', true).then((ok) => {
        if (ok) doCloseTab(path);
      });
    } else {
      doCloseTab(path);
    }
  }

  function doCloseTab(path) {
    state.openTabs = state.openTabs.filter(t => t.path !== path);
    if (state.activeTab === path) {
      state.activeTab = state.openTabs.length > 0 ? state.openTabs[state.openTabs.length - 1].path : null;
    }
    renderTabs();
    renderEditor();
    updateTreeActive();
    if (!state.activeTab) enableEditorControls(false);
  }

  function syncTextareaToTab() {
    const tab = getActiveTabData();
    if (tab && dom.markdownInput.value !== tab.content) {
      tab.content = dom.markdownInput.value;
      tab.modified = tab.content !== tab.original;
    }
  }

  // ============ Editor Rendering ============
  function renderEditor() {
    const tab = getActiveTabData();
    if (!tab) {
      dom.markdownInput.value = '';
      dom.markdownInput.disabled = true;
      dom.markdownPreview.innerHTML = '<div class="empty-state"><p>选择一个文件开始编辑</p></div>';
      hideHtmlPreview();
      dom.btnSave.disabled = true;
      dom.btnDelete.disabled = true;
      updateFormatBar(null);
      return;
    }

    dom.markdownInput.value = tab.content;
    dom.markdownInput.disabled = false;
    dom.markdownInput.placeholder = tab.fileType === 'html' ? '在此输入 HTML 内容...' : '在此输入 Markdown 内容...';
    dom.btnSave.disabled = !tab.modified;
    dom.btnDelete.disabled = false;
    updatePreview(tab.content, tab.fileType);
    updateFormatBar(tab.fileType);
  }

  function updatePreview(content, fileType) {
    if (fileType === 'html') {
      // Render HTML in sandboxed iframe
      dom.markdownPreview.style.display = 'none';
      showHtmlPreview(content);
    } else {
      hideHtmlPreview();
      dom.markdownPreview.style.display = '';
      if (typeof marked !== 'undefined') {
        dom.markdownPreview.innerHTML = marked.parse(content);
      } else {
        dom.markdownPreview.textContent = content;
      }
    }
  }

  // HTML preview via iframe
  let htmlIframe = null;

  function showHtmlPreview(htmlContent) {
    if (!htmlIframe) {
      htmlIframe = document.createElement('iframe');
      htmlIframe.id = 'htmlPreviewFrame';
      htmlIframe.sandbox = 'allow-same-origin';
      htmlIframe.style.cssText = 'width:100%;height:100%;border:none;background:white;border-radius:4px;';
      dom.previewPane.appendChild(htmlIframe);
    }
    htmlIframe.style.display = 'block';
    htmlIframe.srcdoc = htmlContent;
  }

  function hideHtmlPreview() {
    if (htmlIframe) htmlIframe.style.display = 'none';
  }

  // Show/hide format bar based on file type
  function updateFormatBar(fileType) {
    if (!fileType || fileType === 'html') {
      dom.formatBar.style.display = (state.viewMode === 'preview') ? 'none' : 'flex';
      // Show HTML-specific hints
      dom.formatBar.querySelectorAll('.fmt-btn').forEach(btn => {
        btn.style.display = fileType === 'html' ? 'none' : '';
      });
      dom.formatBar.querySelectorAll('.fmt-sep').forEach(sep => {
        sep.style.display = fileType === 'html' ? 'none' : '';
      });
      // Show HTML format buttons if html
      let htmlHint = dom.formatBar.querySelector('.html-hint');
      if (fileType === 'html') {
        if (!htmlHint) {
          htmlHint = document.createElement('span');
          htmlHint.className = 'html-hint';
          htmlHint.style.cssText = 'font-size:12px;color:var(--text-muted);padding:0 8px;';
          htmlHint.textContent = 'HTML 模式 — 直接编写 HTML 代码';
          dom.formatBar.appendChild(htmlHint);
        }
        htmlHint.style.display = '';
      } else if (htmlHint) {
        htmlHint.style.display = 'none';
      }
    } else {
      // Markdown: show all format buttons
      dom.formatBar.querySelectorAll('.fmt-btn').forEach(btn => btn.style.display = '');
      dom.formatBar.querySelectorAll('.fmt-sep').forEach(sep => sep.style.display = '');
      const htmlHint = dom.formatBar.querySelector('.html-hint');
      if (htmlHint) htmlHint.style.display = 'none';
    }
  }

  function updateTreeActive() {
    dom.fileTree.querySelectorAll('.tree-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === state.activeTab);
    });
  }

  // ============ View Mode ============
  function setViewMode(mode) {
    state.viewMode = mode;
    $$('.toggle-btn').forEach(b => b.classList.remove('active'));

    if (mode === 'edit') {
      $('#btnViewEdit').classList.add('active');
      dom.editPane.style.display = 'flex';
      dom.previewPane.style.display = 'none';
      dom.formatBar.style.display = 'flex';
    } else if (mode === 'preview') {
      $('#btnViewPreview').classList.add('active');
      dom.editPane.style.display = 'none';
      dom.previewPane.style.display = 'block';
      dom.formatBar.style.display = 'none';
    } else {
      $('#btnViewSplit').classList.add('active');
      dom.editPane.style.display = 'flex';
      dom.previewPane.style.display = 'block';
      dom.formatBar.style.display = 'flex';
    }

    // Re-render preview
    const tab = getActiveTabData();
    if (tab) updatePreview(tab.content, tab.fileType);
  }

  // ============ Format Actions ============
  const formatActions = {
    bold: { prefix: '**', suffix: '**', placeholder: '粗体文本' },
    italic: { prefix: '*', suffix: '*', placeholder: '斜体文本' },
    strikethrough: { prefix: '~~', suffix: '~~', placeholder: '删除线文本' },
    code: { prefix: '`', suffix: '`', placeholder: 'code' },
    h1: { prefix: '# ', suffix: '', placeholder: '标题', line: true },
    h2: { prefix: '## ', suffix: '', placeholder: '标题', line: true },
    h3: { prefix: '### ', suffix: '', placeholder: '标题', line: true },
    ul: { prefix: '- ', suffix: '', placeholder: '列表项', line: true },
    ol: { prefix: '1. ', suffix: '', placeholder: '列表项', line: true },
    task: { prefix: '- [ ] ', suffix: '', placeholder: '任务', line: true },
    link: { prefix: '[', suffix: '](url)', placeholder: '链接文本' },
    image: { prefix: '![', suffix: '](url)', placeholder: '图片描述' },
    quote: { prefix: '> ', suffix: '', placeholder: '引用文本', line: true },
    hr: { prefix: '\n---\n', suffix: '', placeholder: '' },
    codeblock: { prefix: '\n```\n', suffix: '\n```\n', placeholder: '代码' },
    table: { prefix: '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| ', suffix: ' |  |  |\n', placeholder: '内容' },
  };

  function applyFormat(action) {
    const ta = dom.markdownInput;
    if (ta.disabled) return;
    const fmt = formatActions[action];
    if (!fmt) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    const text = selected || fmt.placeholder;

    let insert;
    if (fmt.line && start > 0 && ta.value[start - 1] !== '\n') {
      insert = '\n' + fmt.prefix + text + fmt.suffix;
    } else {
      insert = fmt.prefix + text + fmt.suffix;
    }

    ta.setRangeText(insert, start, end, 'select');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  // ============ Controls Enable/Disable ============
  function enableControls(enabled) {
    dom.btnNewFile.disabled = !enabled;
    dom.btnNewFolder.disabled = !enabled;
    dom.btnRefresh.disabled = !enabled;
    dom.searchInput.disabled = !enabled;
  }

  function enableEditorControls(enabled) {
    dom.btnDelete.disabled = !enabled;
  }

  // ============ Theme Management ============
  const themeIcon = $('#themeIcon');
  const themeLabel = $('#themeLabel');
  const themeAutoBadge = $('#themeAutoBadge');
  const btnThemeToggle = $('#btnThemeToggle');

  // Determine if it's currently "night" based on local time
  // Night = 18:00 ~ 06:00
  function isNightTime() {
    const hour = new Date().getHours();
    return hour >= 18 || hour < 6;
  }

  // Resolve effective theme from state.theme setting
  function resolveTheme() {
    if (state.theme === 'auto') {
      return isNightTime() ? 'dark' : 'light';
    }
    return state.theme;
  }

  function applyTheme() {
    const effective = resolveTheme();
    document.documentElement.setAttribute('data-theme', effective);

    if (effective === 'dark') {
      themeIcon.textContent = '\uD83C\uDF19'; // moon
      themeLabel.textContent = '\u6DF1\u8272'; // 深色
    } else {
      themeIcon.textContent = '\u2600\uFE0F'; // sun
      themeLabel.textContent = '\u6D45\u8272'; // 浅色
    }

    // Show "auto" badge when in auto mode
    themeAutoBadge.style.display = state.theme === 'auto' ? 'inline' : 'none';
  }

  function cycleTheme() {
    // Cycle: auto -> light -> dark -> auto
    const order = ['auto', 'light', 'dark'];
    const idx = order.indexOf(state.theme);
    state.theme = order[(idx + 1) % order.length];

    applyTheme();
    persistThemePreference();

    const labels = { auto: '\u81EA\u52A8\u6A21\u5F0F', light: '\u6D45\u8272\u6A21\u5F0F', dark: '\u6DF1\u8272\u6A21\u5F0F' };
    showToast(`\u5DF2\u5207\u6362\u4E3A${labels[state.theme]}`);
  }

  function persistThemePreference() {
    try {
      localStorage.setItem('md-editor-theme', state.theme);
    } catch (e) { /* ignore */ }
  }

  function loadThemePreference() {
    try {
      const saved = localStorage.getItem('md-editor-theme');
      if (saved && ['auto', 'light', 'dark'].includes(saved)) {
        state.theme = saved;
      }
    } catch (e) { /* ignore */ }
  }

  // Auto-update theme every minute when in auto mode
  let themeAutoTimer = null;
  function startThemeAutoUpdate() {
    clearInterval(themeAutoTimer);
    themeAutoTimer = setInterval(() => {
      if (state.theme === 'auto') applyTheme();
    }, 60000);
  }

  // ============ Sidebar Resize ============
  let isResizing = false;
  dom.resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    dom.resizeHandle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.max(200, Math.min(500, e.clientX));
    dom.sidebar.style.width = newWidth + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      dom.resizeHandle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // ============ Event Bindings ============
  dom.btnOpenFolder.addEventListener('click', openDirectory);
  dom.btnNewFile.addEventListener('click', () => newFileInDir(null));
  dom.btnNewFolder.addEventListener('click', () => newSubFolder(null));
  dom.btnSave.addEventListener('click', saveCurrentFile);
  dom.btnDelete.addEventListener('click', () => {
    const tab = getActiveTabData();
    if (tab) {
      deleteItem({ name: tab.name, path: tab.path, handle: tab.handle, kind: 'file' });
    }
  });
  dom.btnRefresh.addEventListener('click', refreshFileTree);

  // View mode toggles
  $('#btnViewEdit').addEventListener('click', () => setViewMode('edit'));
  $('#btnViewPreview').addEventListener('click', () => setViewMode('preview'));
  $('#btnViewSplit').addEventListener('click', () => setViewMode('split'));

  // Textarea input -> live preview + modified state
  let previewDebounce = null;
  dom.markdownInput.addEventListener('input', () => {
    const tab = getActiveTabData();
    if (!tab) return;
    tab.content = dom.markdownInput.value;
    tab.modified = tab.content !== tab.original;
    dom.btnSave.disabled = !tab.modified;
    renderTabs();

    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(() => {
      if (state.viewMode !== 'edit') updatePreview(tab.content, tab.fileType);
    }, 150);
  });

  // Search
  dom.searchInput.addEventListener('input', () => {
    renderFileTree(dom.searchInput.value);
  });

  // Format bar
  dom.formatBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.fmt-btn');
    if (btn) applyFormat(btn.dataset.action);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentFile();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b' && document.activeElement === dom.markdownInput) {
      e.preventDefault();
      applyFormat('bold');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i' && document.activeElement === dom.markdownInput) {
      e.preventDefault();
      applyFormat('italic');
    }
  });

  // Tab key in textarea
  dom.markdownInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      e.target.setRangeText('  ', start, start, 'end');
      e.target.dispatchEvent(new Event('input'));
    }
  });

  // Handle URL action params (from shortcuts/popup)
  const urlAction = new URLSearchParams(location.search).get('action');
  if (urlAction === 'open') {
    setTimeout(openDirectory, 300);
  } else if (urlAction === 'new') {
    // Open directory first, then prompt new file
    setTimeout(async () => {
      await openDirectory();
      if (state.dirHandle) newFileInDir(null);
    }, 300);
  }

  // Init view mode
  setViewMode('edit');

  // Init theme: load preference -> apply -> start auto-update
  loadThemePreference();
  applyTheme();
  startThemeAutoUpdate();
  btnThemeToggle.addEventListener('click', cycleTheme);

})();
