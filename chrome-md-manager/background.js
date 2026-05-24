// Open editor on command shortcuts
chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'open-editor':
      chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
      break;
    case 'open-editor-with-folder':
      chrome.tabs.create({ url: chrome.runtime.getURL('editor.html?action=open') });
      break;
    case 'quick-new-file':
      chrome.tabs.create({ url: chrome.runtime.getURL('editor.html?action=new') });
      break;
  }
});
