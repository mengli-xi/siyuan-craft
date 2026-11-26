# 思源 `3.8.x` 文档树机制与插件开发踩坑实录

在开发 [`siyuan-smart-folder`](../plugins/siyuan-smart-folder/README_zh_CN.md)（智能目录）插件过程中，围绕思源 `3.8.10` 新版虚拟化文档树、内核 HTTP API 路由、原生父文档点击模式及第三方主题兼容性踩到了多个隐蔽坑点，特此归档。

---

## 1. SQL 查询接口路由陷阱：`/api/query/sql` vs `sql.sql`

- **现象**：插件在 `onload()` 中通过 `fetchPost("/api/sql/sql", { stmt })` 拉取文档块统计信息时静默返回 HTTP `404 Not Found`，导致内存索引 `indexLoaded` 永远为 `false`。
- **根因**：社区常用 MCP 服务（如 `@fromsko/siyuan-mcp-server`）将 SQL 工具命名空间封装成了 `sql.sql`，容易误导开发者拼出 `/api/sql/sql`；而思源内核真实的 HTTP 端点为 **`/api/query/sql`**。
- **防坑规则**：前端插件内执行只读 SQL 一律请求 `/api/query/sql`（刷盘事务接口同理为 `/api/sqlite/flushTransaction` 而非 `/api/sql/flushTransaction`）。

---

## 2. 思源 `3.8+` 虚拟化文档树 (`docTree`) 的 DOM 变化

相比早期版本的递归 `<ul>` 树，思源 `3.8+` 重构为了扁平虚拟化列表，开发文档树类插件需注意以下 3 点：

1. **条目选择器与层级缩进**：
   - 每个文档条目为 `li.b3-list-item.file-tree__row[data-type="navigation-file"][data-node-id][data-tree-key]`，缩进通过行内 CSS 变量 `--file-tree-depth` 控制，不再嵌套多层子 `<ul>`。
2. **展开/折叠状态判定**：
   - 新版文档树通过 `<li>` 上的 **`aria-expanded="true" | "false"`** 属性标识当前展开状态（而非仅靠箭头 `<svg>` 的 `.b3-list-item__arrow--open` 类名）。
   - `MutationObserver` 监听展开状态切换时，必须在 `attributeFilter` 中同时包含 `["class", "aria-expanded"]`。
3. **面板挂载时的 `MutationObserver` 漏检陷阱**：
   - `onLayoutReady()` 触发时，左侧文档树面板（`.sy__file`）的子列表往往尚未完成异步挂载。
   - 当面板首次插入 DOM 时，`childList` 变更的 `mutation.target` 是外层 Dock 容器（`.sy__file` 的祖先），此时 `mutation.target.closest(".sy__file")` 返回 `null`；必须同时检查 `mutation.addedNodes` 中是否包含 `.sy__file` 或 `li.file-tree__row`。

---

## 3. 原生 `parentDocTitleClickMode = 2` 的 250ms 单击延迟与捕获阶段拦截

- **现象**：当用户在「设置 -> 文档树 -> 行为 -> 父文档标题点击动作」中开启了 `2`（单击展开/折叠，双击打开）时，单击任意父目录都会有明显的 **~250ms 延迟**（思源内置 `parentDocClick` 需要等待双击窗口期超时后才执行展开）。
- **解决方案**：在 `document.addEventListener("click", handler, true)`（**捕获阶段**）接管点击事件：
  - 对**所有父目录节点**（无论纯目录还是含正文父文档）：`preventDefault() + stopPropagation()` 后立即触发 `.b3-list-item__toggle` 点击，实现 **0ms 零延迟展开/收起**；
  - 若 340ms 内检测到同节点第二次点击（**双击**），自动回补展开状态并调用 `openTab` 打开对应目录页（或直接使用 **`Option/Alt + 单击`** 直接打开目录页而不改变折叠状态）。

---

## 4. 第三方主题（如 `Neo`）下的图标着色覆盖问题

- **现象**：部分主题（如 `Neo`）存在 `.b3-list-item__icon:hover svg { color: var(--b3-theme-on-background) }` 规则，且其暗色模式下的 `--b3-theme-primary` 色相偏暖橙红（`oklch(0.62 0.16 30.8)`），与暖金色文件夹图标色相接近、难以一眼区分。
- **解决方案**：
  - 插件自定义文档树 SVG 图标颜色需加 `!important` 防止 hover 态被主题重置；
  - 区分「纯目录」与「含正文父文档」时使用明确冷暖对比色（如暖金 `#f0a44c` vs 冷蓝 `#60a5fa`），避免直接依赖色相不确定的 `--b3-theme-primary`。

---

## 5. 无侵入式 Protyle 视图扩展挂载位置

- **红线**：切勿向 `.protyle-wysiwyg` 内部直接插入非标准块 DOM（Protyle 编辑器的输入与序列化观察器会将其视作文档内容甚至污染 `.sy` 文件）。
- **正确做法**：将自定义概览面板（如 `.smart-folder-overview`）挂载在 `.protyle-content` 内、作为 `.protyle-wysiwyg` 的**前序兄弟节点**，并通过 `ResizeObserver` 同步 `.protyle-title` / `.protyle-wysiwyg` 的左右边距以保持版心对齐。

---

## 6. 文档树默认图标双模式坑：`fileTree.useSVGDefaultIcon`

- **现象**：部分工作空间开启了「使用 SVG 默认图标」（`useSVGDefaultIcon: true`），此时未设自定义图标的文档 `.b3-list-item__icon` 内为 `<svg>`；但思源默认配置为 **`useSVGDefaultIcon: false`**，此时 `.b3-list-item__icon` 内渲染的是 **Unicode Emoji 文本节点**（`📑` / `📄`，或 `window.siyuan.storage["local-images"]` 中的默认映射），并不存在 `<svg>`。
- **根因**：如果插件用 `if (!iconSpan.querySelector("svg")) return;` 来区分“默认图标 vs 用户自定义 Emoji”，在 `useSVGDefaultIcon: false` 的工作空间里会把所有默认图标全部跳过。
- **正确做法**：
  1. SQL 查询中顺带读取 `d.ial`，通过 `/\bicon="[^"]+"/` 判断文档是否设置了自定义图标；
  2. DOM 层同时兼容 `<svg>` 与默认 Emoji 文本（`📑` / `📄` 及 `local-images` 默认值），并在替换前将原始 `innerHTML` 暂存在 `data-*` 属性中，卸载或禁用时原样恢复。

---

## 7. 插件更新检查机制与多端同步 `push_reload` 自动热重载

1. **集市插件（Bazaar）更新机制**：
   - 思源启动或在「设置 -> 集市 -> 已下载」检查更新时，会拉取官方 `siyuan-note/bazaar` 索引清单，比对本地 `data/storage/bazaar.json` 中的 `repoRef` 与插件 `plugin.json` 的 `version`；下载更新时拉取的是对应仓库 GitHub Release 构建产物 **`package.zip`**，不会直接拉取源码分支。
   - **未上架集市的自研插件**不会向 GitHub 轮询检查更新。
2. **多端同步与 `push_reload` 自动热重载**：
   - 思源的数据仓库同步（官方云端 / WebDAV / S3）默认将 `<SiYuanWorkspace>/data/plugins/` 纳入同步范围。
   - 在思源 `3.8+` 中，任一设备直接修改 `data/plugins/<plugin-name>/` 并触发同步后，另一端内核的 `push_reload` 机制会在同步落盘时检测到插件文件哈希变化，**自动通知前端热重载受影响的插件**，无需重启思源。
3. **跨平台开发防坑提示**：
   - 若在多台设备（如 Windows + macOS）上直接热改工作空间 `data/plugins/`，很容易出现「运行态代码比 Git 仓库更新」或 Windows CRLF 换行符带入仓库的情况；回收改动回 Git 仓库前务必对比两边时间戳并统一规整为 LF 换行符。
