---
description: 从 beta 或 rc 版本迁移到 markstream-vue 1.0 的说明。
---

# 迁移到 1.0

此页面为中文占位，原文（English）：/guide/migration-1-0。

`markstream-vue@1.0` 的稳定范围是 Vue 3 renderer。发布时请让 `markstream-vue`、`markstream-core`、`stream-markdown-parser` 一起升级到 `1.0.0`。

普通应用升级只需要安装 Vue 包：

```bash
pnpm add markstream-vue@1.0.0
```

只有直接 import `markstream-core` 或 `stream-markdown-parser` API 时，才需要显式 pin 这两个包。

发布前运行：

```bash
pnpm run release:gate:1.0
```

同时把 `1.0 Benchmark` workflow artifact，或带环境披露的本地 benchmark report，附到 release notes。
