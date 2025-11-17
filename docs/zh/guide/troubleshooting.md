# 排查问题

如果出现问题，请尝试下面这些通用解决方案：

- 在 SSR 中出现 `window is not defined`：在 Nuxt 中将客户端代码包装为 `<client-only>`，在 Vite SSR 场景中用 `onMounted` 延迟初始化。
- 数学渲染失败：安装并引入 `katex`，同时在应用入口引入 `katex/dist/katex.min.css`。
- Mermaid 渲染问题：升级到 `mermaid` >= 11，检查异步渲染日志。
- 性能问题：确认 `viewportPriority` 已启用，避免在单次 mount 中渲染大量重资产节点。

## 常见问题（FAQ）

- Tailwind / CSS 覆盖样式：当项目使用 Tailwind 或组件库（如 shadcn）时，Tailwind 的工具类或全局样式可能会覆盖库本身的样式。请参考 Tailwind 集成指南以了解样式导入顺序和解决策略：`/zh/guide/tailwind`。

  快速修复：

- 自定义样式：你可以通过覆盖 `src/index.css` 中的 CSS 变量来自定义外观（例如 `--vscode-editor-background`、`--vscode-editor-foreground`），或在你的应用样式中覆盖组件类。推荐使用 `@apply` 或将自定义样式限定到某个容器内。
- 插槽优先：如果你需要更改组件内布局，先检查组件是否暴露了插槽（例如 `header-left`、`header-right`、`loading`）。插槽提供稳健的扩展点，无需替换组件内部实现。

- 还是不够？试试 `setCustomComponents(id, mapping)` 将节点渲染器替换为你自己的 Vue 组件，详见 `Advanced` 页面的示例；记得在 SPA 中及时 `removeCustomComponents` 清理映射以避免内存泄露。

  快速示例（将 `code_block` 节点替换为自定义渲染器）：

  ```ts
  import { setCustomComponents } from 'vue-renderer-markdown'

  setCustomComponents('my-docs', {
    code_block: MyCustomCodeBlock,
  })
  ```

  这将告知所有带有 `custom-id="my-docs"` 的 `MarkdownRender` 实例，使用 `MyCustomCodeBlock` 渲染 `code_block` 节点；更多示例请参见 `Advanced` 页面。

 - 重现与提单：遇到渲染异常或报错时，请先在 `playground` 中尝试复现问题并提供最小 Markdown 示例（或使用托管的快速测试页面）。可以运行 `pnpm test` 进行本地测试以确认是否为回归问题。打开 issue 时请包含：

  1. 可复现的最小 Markdown 示例（粘贴在 issue 中或放到 gist）。
  2. 在 playground 的复现步骤或 `playground` 链接，以及运行环境信息（浏览器、Node 版本、Vite/Nuxt）。
  3. 错误堆栈或 console 输出。

  优先提供一个 `playground` 对应的复现链接；你也可以使用托管的快速测试以便快速调试：

  https://vue-markdown-renderer.netlify.app/test

  如果准备好了，使用快速创建 issue 链接：

  https://github.com/Simon-He95/vue-markdown-renderer/issues/new?template=bug_report.yml

  额外建议：如果你可以编写一个单测或集成测试来复现 bug，请将其放入 `test/` 文件夹并在本地运行 `pnpm test`，这通常能帮助维护者快速定位并修复回归。
