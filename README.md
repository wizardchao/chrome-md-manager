# Markdown 文件管理器

一个 Chrome 浏览器扩展，用于在浏览器中直接管理本地 Markdown 和 HTML 文件。

## 项目背景

在日常开发和文档编写中，我们经常需要快速查看和编辑 Markdown 文件。传统的做法是使用专门的编辑器或 IDE，但有时我们只需要一个轻量级的工具来快速浏览和简单编辑。

这个 Chrome 扩展提供了以下功能：
- 在浏览器中打开本地文件夹
- 查看 Markdown 和 HTML 文件
- 编辑文件内容
- 删除和新增文件
- 支持代码高亮显示
- 支持快捷键操作

## 技术栈

- **Chrome Extension Manifest V3**: 使用最新的 Chrome 扩展规范
- **HTML/CSS/JavaScript**: 原生前端技术
- **Marked.js**: Markdown 解析库
- **Highlight.js**: 代码语法高亮库

## 打包方法

### 方法一：使用已打包的 zip 文件

项目中已包含打包好的 `chrome-md-manager.zip` 文件，可以直接使用。

### 方法二：手动打包

1. 确保你已经安装了 Node.js 和 npm（可选，用于压缩）
2. 进入 `chrome-md-manager` 目录
3. 选择所有文件并压缩为 zip 格式

```bash
cd chrome-md-manager
zip -r ../chrome-md-manager.zip . -x "*.DS_Store"
```

### 方法三：使用 Chrome 开发者模式加载

1. 打开 Chrome 浏览器，进入 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `chrome-md-manager` 文件夹

## 安装使用

### 从 zip 文件安装

1. 下载 `chrome-md-manager.zip` 文件
2. 解压到本地文件夹
3. 打开 Chrome 浏览器，进入 `chrome://extensions/`
4. 开启"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压后的 `chrome-md-manager` 文件夹

### 快捷键

- `Alt+M`: 打开 Markdown 编辑器
- `Alt+Shift+M`: 打开编辑器并选择文件夹
- `Alt+N`: 快速新建 Markdown 文件

## 项目结构

```
chrome-md-manager/
├── manifest.json          # 扩展配置文件
├── background.js          # 后台服务脚本
├── popup.html             # 弹出窗口页面
├── popup.js               # 弹出窗口脚本
├── editor.html            # 编辑器页面
├── editor.js              # 编辑器脚本
├── editor.css             # 编辑器样式
├── options.html           # 选项页面
├── options.js             # 选项脚本
├── icons/                 # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── libs/                  # 第三方库
    ├── marked.min.js
    └── highlight.min.js
```

## 开发说明

如需修改或扩展功能：

1. 克隆本仓库
2. 在 Chrome 中加载扩展（开发者模式）
3. 修改代码后，在扩展管理页面点击刷新按钮
4. 测试修改后的功能

## 许可证

MIT License