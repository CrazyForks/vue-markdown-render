# 性能特性与建议

本渲染器针对流式与大型文档进行优化。

关键功能：

- 针对代码块的增量解析
- 最小化的 DOM 更新与内存优化
- Monaco 的流式更新
- 渐进式 Mermaid 渲染

性能建议：

- 将长文档分块流式传输，避免阻塞主线程
- 对只读代码块使用 `MarkdownCodeBlockNode` 或 `renderCodeBlocksAsPre`
- 使用 `setDefaultMathOptions` 在应用启动时设置数学渲染默认项
- 对重型节点启用 `viewportPriority`（默认开启）以延迟离屏工作

更多详细信息见 `/zh/guide/performance`。

## 让渲染保持稳定的“逐字更新”

有些 LLM 会一次推送大量文本，导致前端表现为“卡顿一会儿再一次性显示”。想让用户始终看到稳定的打字机效果，可以：

- **保持 `typewriter` 为默认开启**，这样非代码节点都会通过进入动画逐字呈现。
- **调整批次渲染参数**：调低 `initialRenderBatchSize` / `renderBatchSize`（如 `12` / `24`），并设置一个 20–30 ms 的 `renderBatchDelay`，让每次渲染只插入很小的一段文本。
- **在上游做节流或拆包**：把后端一次性推送的大段文本按段落拆分，或用 50–100 ms 的防抖再更新 `content`，减少一次性 diff。
- **保留延迟可见渲染**：继续启用 `deferNodesUntilVisible` / `viewportPriority`，避免 Mermaid、Monaco 这类重型节点阻塞文字流。
- **必要时降级代码块**：在突发大块传输时暂时关闭 `codeBlockStream` 或启用 `renderCodeBlocksAsPre`，避免语法高亮抢占时间片。

这些组合可以把 DOM 工作量稳定在可控范围，哪怕服务端一次发送很多文本，用户也会感知为持续、丝滑的逐字输出。
