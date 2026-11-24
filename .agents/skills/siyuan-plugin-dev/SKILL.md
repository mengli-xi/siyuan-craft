---
name: siyuan-plugin-dev
description: 开发、调试与打包思源笔记（SiYuan Note）插件的工作流与踩坑经验库。在本仓库新建、修改、调试思源插件或总结插件实现经验时必须先阅读此 Skill。
---

# 思源笔记插件开发指南与经验沉淀

本 Skill 用于指导 AI 在 `plugins/<plugin-name>/` 下编写、调试思源笔记插件，并持续沉淀实战踩坑经验。

## 一、思源插件标准目录结构

每个插件独立放在仓库 `plugins/<plugin-name>/` 目录下，构建产物输出到 `plugins/<plugin-name>/dist/`（软链或同步至思源工作空间的 `<SiYuanWorkspace>/data/plugins/<plugin-name>/` 即可热调试）：

```text
plugins/<plugin-name>/
├── plugin.json          # 思源插件清单（name, author, version, minAppVersion, backends, frontends, i18n）
├── README.md            # 插件功能说明（中英 README_zh_CN.md / README.md）
├── icon.png / preview.png
├── i18n/
│   ├── zh_CN.json
│   └── en_US.json
├── src/
│   └── index.ts         # 继承 import { Plugin } from "siyuan"
├── package.json
├── tsconfig.json
└── vite.config.ts       # 打包为 index.js + index.css 到 dist/ 或开发目录
```

## 二、核心生命周期与 API 要点

1. **插件入口类（继承 `Plugin`）**：
   - `onload()`：插件启用/启动时调用，适合注册顶栏图标（`this.addTopBar`）、命令快捷键（`this.addCommand`）、斜杠菜单（`this.protyleSlash`）、事件总线监听（`this.eventBus.on(...)`）。**注意此时界面 DOM 未必就绪**。
   - `onLayoutReady()`：思源主界面布局加载完成后调用，涉及读取 DOM、打开自定义 Tab/Dock 的初始化操作应放在这里。
   - `onunload()`：插件禁用或卸载时调用，务必在此清理 `eventBus.off`、定时器与手动挂载的全局 DOM 节点，防止内存泄漏。
2. **数据持久化**：
   - 插件自身配置统一用 `this.loadData(storageName)` 与 `this.saveData(storageName, data)`（自动存储在 `data/storage/petal/<plugin-name>/` 下），不要私自往笔记目录乱写配置文件。
3. **调用思源内核 API**：
   - 插件前端内部优先使用 `import { fetchPost, fetchSyncPost } from "siyuan"`，自带当前会话鉴权，**严禁在插件源码中硬编码 API Token**。
4. **已知内核与数据模型踩坑记录（持续补充）**：
   - **SQLite `blocks` 表异步索引延迟与深层未索引坑**：
     - 调用 `renameDocByID`、`moveDocsByID`、`moveBlock` 后，SQLite `blocks` 表的 `hpath` 等字段为异步刷新；批量脚本需注意 `/api/sqlite/flushTransaction` 或短暂等待，遇到 `msg: "indexing"` 时做退避重试。
     - 超深层级（>7 层）导入的 `.sy` 文档可能存在磁盘文件有内容、但 `blocks` 子块未入库导致 SQL 统计长度为 `0` 的情况，核实真实内容应以 `/api/export/exportMdContent` 或块树接口为准。
   - **块移动（`moveBlock`）位置参数细节**：
     - 插到父容器最前面时只传 `{ id, parentID }`，**不要传空字符串 `previousID: ""`**（内核会报 `previousID block not found`）；插到某块之后时传 `{ id, previousID, parentID }`。
   - **目录即文档模型**：
     - 思源没有纯文件夹概念，所有目录节点本身都是 `type = 'd'` 的文档，可直接承载目录导言与说明，无需额外创建 `README` 子文档。

## 三、经验回写约定

每次开发插件过程中踩到新的思源 API 怪癖、Protyle 编辑器事件坑点或打包调试技巧：
1. 详细分析与复现背景写入仓库 [`docs/`](../../../docs/README.md) 下的专题文档；
2. 浓缩后的可执行防坑规则同步追加到本 `SKILL.md` 的「已知内核与数据模型踩坑记录」中，让后续 AI 会话直接复用。
