# `siyuan-craft` 工作区约定

本仓库用于存放个人编写（AI 协作实现）的**思源笔记（SiYuan Note）插件源码**与**插件开发实战经验**。

## 目录职责

- `plugins/`：各独立思源插件源码目录（`plugins/<plugin-name>/`）。
- `docs/`：思源插件机制拆解、API 踩坑记录与设计方案文档。
- `.agents/skills/siyuan-plugin-dev/`：供 AI 编写思源插件时加载的核心规范与防坑 Skill。
- `.agents/plugins/siyuan-mcp/` + `scripts/start-siyuan-mcp.sh`：连接本机思源内核的 MCP 服务配置。

## 安全与提交红线

1. **严禁硬编码敏感凭据与个人路径**：
   - 严禁在任何受 Git 跟踪的文件中写入真实的 `SIYUAN_TOKEN` 或本机绝对路径（如 `/Users/<username>/...`）。
   - 本地调试凭据统一存放在仓库根目录 `.env`（已被 `.gitignore` 忽略），模板维护在 `.env.example`。
2. **经验沉淀闭环**：
   - 开发思源插件时优先阅读 `.agents/skills/siyuan-plugin-dev/SKILL.md`；遇到新的思源内核/Protyle 坑点，解决后同步沉淀到 `docs/` 与该 Skill 中。
