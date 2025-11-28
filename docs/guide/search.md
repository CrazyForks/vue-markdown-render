# Search (Quick Guide)

This documentation site supports search in two ways:

- Local search (built-in) — fast and easy, works out of the box for the docs site
- Algolia DocSearch — hosted search that provides better language and typo handling for large sites (recommended for production)

## Local search (default)
Local search is enabled by default in `docs/.vitepress/config.ts`:

```ts
export default defineConfig({
  themeConfig: {
    search: { provider: 'local' },
  },
})
```

This creates an on-device index from all markdown pages and headings during the docs build step. It works out-of-the-box and does not require external services.

Notes:
- Local search is limited for languages without whitespace tokenization (e.g., Chinese). For better Chinese search experience, use Algolia.

  Tip: The docs site has a language selector in the top-right of the navigation bar — use it to switch between English and Chinese (`zh`).
- Local search works with the built-in VitePress styles and provides a lightweight client-side search across your docs.

## Algolia DocSearch (optional, recommended)
Algolia provides a robust search experience and supports multiple languages. To use DocSearch:

1. Sign up for Algolia DocSearch (https://docsearch.algolia.com/).
2. Add the provider options to `docs/.vitepress/config.ts`:

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

3. Rebuild the docs and verify the search box appears in the navigation bar.

Algolia also provides options for multilingual indexing and synonyms to improve search coverage.

## Local dev and tests
- Local search is generated during `pnpm docs:build`.
- For Algolia, configure the indexing on Algolia's side and then update the site keys.

If you want me to register an index for this repo and add DocSearch configuration, provide the appId, apiKey, and indexName and I'll update the config accordingly.

Try this — enable local search (already the default) and test locally by running the docs server:

```bash
pnpm docs:dev
# open the site and try the search box in the top-right
```
