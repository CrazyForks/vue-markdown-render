# 搜索（快速指南）

本站点支持两种搜索方式：

- 本地搜索（默认）— 轻量，构建时自动生成索引
- Algolia DocSearch — 托管搜索，支持更好的语言处理与拼写纠错（建议用于生产站点）

## 本地搜索（默认）
在 `docs/.vitepress/config.ts` 中启用了本地搜索：

```ts
export default defineConfig({
  themeConfig: {
    search: { provider: 'local' }
  }
})
```

本地搜索在 `pnpm docs:build` 时生成站内索引并在客户端进行检索。对于中文等不以空格分词的语言，效果可能不如 Algolia 精准；建议在此类场景下使用 Algolia。

## Algolia DocSearch（可选，推荐）
要使用 Algolia：

1. 注册 Algolia DocSearch（https://docsearch.algolia.com/）
2. 在 `docs/.vitepress/config.ts` 中添加 provider 配置：

```ts
export default defineConfig({
  themeConfig: {
    search: {
      provider: 'algolia',
      options: {
        appId: 'YOUR_APP_ID',
        apiKey: 'YOUR_SEARCH_ONLY_API_KEY',
        indexName: 'YOUR_INDEX_NAME',
      },
    },
  },
})
```

3. 在 Algolia 控制台配置索引和语言设置。

## 本地运行
- 本地搜索会在 `pnpm docs:build` 时自动生成
- Algolia 需要在控制台创建索引后更新站点密钥

如果你想我帮忙申请 Algolia 或填入站点密钥，我可以把配置写进 `docs/.vitepress/config.ts` 并补充部署步骤。

提示：本站点右上角可切换文档语言（`英文 / 中文`），切换后会加载对应语言的侧边栏和页面。
