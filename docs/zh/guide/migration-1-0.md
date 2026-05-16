---
description: 从 beta 或 rc 版本迁移到 markstream-vue 1.0 的说明。
---

# 迁移到 1.0

此页面为中文占位，原文（English）：/guide/migration-1-0。

`markstream-vue@1.0` 的稳定范围是 Vue 3 renderer。发布时请让 `markstream-vue`、`markstream-core`、`stream-markdown-parser` 一起升级到 `1.0.0`。

发布前运行：

```bash
pnpm run release:gate:1.0
```

同时把生成的 `benchmark/latest-summary.md` 或 `1.0 Benchmark` workflow artifact 附到 release notes。
