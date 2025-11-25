# 数学公式（KaTeX）

`markstream-vue` 在检测到 `katex` 时使用 KaTeX 渲染数学。KaTeX 为可选 peer 依赖，需单独安装。

安装示例：

```bash
pnpm add katex
```

在入口文件导入样式：

```ts
import 'katex/dist/katex.min.css'
```

若没有安装 KaTeX，数学表达式将被保留为纯文本以保证 SSR 安全。
