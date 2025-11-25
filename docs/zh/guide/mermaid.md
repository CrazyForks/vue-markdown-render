# Mermaid：渐进式渲染示例

Mermaid 图表可以随内容逐步渲染。图表在语法达到可渲染状态时会立即显示，随后随着更多内容到达而逐步完善。

示例代码见下方：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const steps = [
  '```mermaid\n',
  'graph TD\n',
  'A[Start]-->B{Is valid?}\n',
  'B -- Yes --> C[Render]\n',
  'B -- No  --> D[Wait]\n',
  '```\n',
]

let i = 0
const id = setInterval(() => {
  content.value += steps[i] || ''
  i++
  if (i >= steps.length)
    clearInterval(id)
}, 120)
</script>

<template>
  <MarkdownRender :content="content" />
  <!-- Diagram 将在内容流入时逐步出现 -->
</template>
```

注意：
- Mermaid 为可选 peer 依赖；若未安装，渲染器会回退到显示原始源文本。
- 若解析/渲染失败，请检查浏览器控制台与网络请求中是否缺失 Mermaid 资源。

`Mermaid` 为可选 peer 依赖：要启用请安装 `mermaid`。
