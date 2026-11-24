# 思源插件目录 (`plugins/`)

每个思源插件独立建一个子目录，例如：

```text
plugins/
└── my-first-plugin/
    ├── plugin.json
    ├── src/
    └── vite.config.ts
```

新建或修改插件时，AI 会自动参考 [`.agents/skills/siyuan-plugin-dev/SKILL.md`](../.agents/skills/siyuan-plugin-dev/SKILL.md) 中的生命周期规范与内核 API 踩坑记录。
