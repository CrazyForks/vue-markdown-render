# 安装

使用 `pnpm`, `npm` 或 `yarn`:

```bash
pnpm add vue-renderer-markdown
# 或
npm install vue-renderer-markdown
# 或
yarn add vue-renderer-markdown
```

可选 peer 依赖：

- mermaid
- stream-monaco
- shiki
- katex

KaTeX 的 CSS 需要在应用入口处导入，例如 `main.ts`:

```ts
import 'katex/dist/katex.min.css'
```
