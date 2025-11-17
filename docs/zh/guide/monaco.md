# Monaco 编辑器集成

Monaco 编辑器集成为可选功能（由 `stream-monaco` 提供）。它支持对大代码块进行快速的增量更新。

安装：

```bash
pnpm add stream-monaco
```

提示：
- 延迟初始化 Monaco（仅在可见或需要时才初始化）
- 在生产构建中需要配置 worker 打包（使用 `vite-plugin-monaco-editor-esm`）
- 如果需要更快的首次渲染，可使用 `getUseMonaco()` 在应用启动时预加载 Monaco

更多细节参见 `/zh/guide/monaco-internals`。
