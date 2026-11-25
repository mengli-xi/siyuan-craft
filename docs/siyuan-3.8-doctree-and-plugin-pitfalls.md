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

## 3. 原生 `parentDocTitleClickMode = 2` 的 250ms 单击延迟与捕获阶段分流

- **现象**：当用户在「设置 -> 文档树 -> 行为 -> 父文档标题点击动作」中开启了 `2`（单击展开/折叠，双击打开）时：
  1. 单击任意目录都会有明显的 **~250ms 延迟**（思源内置 `parentDocClick` 需要等待双击窗口期超时后才执行展开）；
  2. 含有导言正文的父文档（如 `00-未归纳`、`01-编程`）也会被一刀切拦截为折叠操作，无法单击直接阅读正文。
- **解决方案**：在 `document.addEventListener("click", handler, true)`（**捕获阶段**）接管分流：
  - 对 **0 字纯目录**：`preventDefault() + stopPropagation()` 后立即触发 `.b3-list-item__toggle` 点击，实现 **0ms 零延迟展开/收起**；若 340ms 内检测到同节点第二次点击（双击），自动补偿展开状态并调用 `openTab` 打开目录页。
  - 对 **含正文的父文档**：若检测到 `window.siyuan.config.fileTree.parentDocTitleClickMode !== 0`，同样在捕获阶段拦截并直接调用 `openTab`，避免落入原生 `parentDocClick` 的延迟折叠逻辑。

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
