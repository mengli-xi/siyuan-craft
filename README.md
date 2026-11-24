# siyuan-craft

个人思源笔记（SiYuan Note）插件合集、MCP 协作工作区与插件开发经验沉淀仓库。

## 目录结构

```text
.
├── plugins/                      # 思源插件源码目录（每个插件独立子目录）
├── docs/                         # 思源插件实现机制与踩坑经验文档
├── scripts/
│   └── start-siyuan-mcp.sh       # 自动读取环境变量 / 本地 .env 启动思源 MCP
├── .agents/
│   ├── plugins/siyuan-mcp/       # 工作区思源 MCP 插件配置（无明文密钥）
│   └── skills/siyuan-plugin-dev/ # AI 编写思源插件的规范与防坑 Skill
├── AGENTS.md                     # 仓库级 AI 协作约束
└── .env.example                  # 本地环境变量配置模板
```

## 本地环境初始化

1. 安装依赖：
   ```bash
   npm install
   ```
2. 配置本地思源 API Token（`.env` 已被 `.gitignore` 忽略，不会提交）：
   ```bash
   cp .env.example .env
   ```
   在思源笔记「设置 -> 关于 -> API token」中复制 Token 填入 `.env` 的 `SIYUAN_TOKEN`（也可直接在系统环境变量中导出 `SIYUAN_TOKEN`）。
