# Token 扩展方案（草案）

> 状态：**待审查**。需要全项目 review 确认覆盖度和值的准确性。

---

## 背景

当前 token 系统只覆盖了**颜色**和**圆角**。非颜色维度（间距、排版、阴影、动画、尺寸、边框粗细）
全部是硬编码值，散落在 25+ 个组件中。这导致：

1. 用户无法通过覆盖变量实现"紧凑/舒适"密度切换
2. 间距/排版不一致（同类元素用不同值）
3. 阴影/动画风格分散，无统一节奏

---

## 一、间距 Token（最高优先级）

### 基础阶梯

```css
.markstream-vue {
  --ms-space-1: 0.25rem;    /* 4px  */
  --ms-space-2: 0.5rem;     /* 8px  */
  --ms-space-3: 0.75rem;    /* 12px */
  --ms-space-4: 1rem;       /* 16px */
  --ms-space-6: 1.5rem;     /* 24px */
  --ms-space-8: 2rem;       /* 32px */
  --ms-space-12: 3rem;      /* 48px */
}
```

### 语义间距

```css
.markstream-vue {
  --ms-space-block: 1.25em;        /* 段落/块元素上下间距 */
  --ms-space-heading-top: 2rem;    /* 标题上方间距（h2 级） */
  --ms-space-indent: 1.625em;      /* 列表缩进 (calc(13/8*1em)) */
  --ms-space-cell: 0.57em;         /* 表格单元格 (calc(4/7*1em)) */
  --ms-space-inset: 1rem;          /* 容器内边距（admonition 内容、code header） */
  --ms-space-inset-sm: 0.5rem;     /* 小容器内边距（admonition header、按钮） */
}
```

### 当前硬编码值映射

| 当前值 | 出现位置 | 映射到 |
|---|---|---|
| `margin: 1.25em 0` | ParagraphNode | `--ms-space-block` |
| `mt-8` (2rem) | HeadingNode h2 | `--ms-space-heading-top` |
| `my-12` (3rem) | ThematicBreakNode | `--ms-space-12` |
| `my-8` (2rem) | TableNode | `--ms-space-8` |
| `my-4` (1rem) | MermaidBlockNode, CodeBlockNode, D2, Infographic | `--ms-space-4` |
| `my-5` (1.25rem) | ListNode | `--ms-space-block` (或 5 级) |
| `my-2` (0.5rem) | ListItemNode | `--ms-space-2` |
| `pl-[calc(13/8*1em)]` | ListNode 缩进 | `--ms-space-indent` |
| `p-[calc(4/7*1em)]` | TableNode td/th | `--ms-space-cell` |
| `padding: 0.5rem 1rem` | AdmonitionNode header/content | `--ms-space-inset-sm` / `--ms-space-inset` |
| `gap: 16px` | CodeBlockNode header | `--ms-space-4` |
| `gap: 8px` | CodeBlockNode actions | `--ms-space-2` |
| `padding-left: 1em` | BlockquoteNode | `--ms-space-4` |
| `margin: 1.6em` | BlockquoteNode top/bottom | 约 `--ms-space-6` |
| `margin: 1rem 0` | AdmonitionNode | `--ms-space-4` |
| `px-4 py-2.5` | Code header, Mermaid header | `--ms-space-4` / `--ms-space-inset-sm` |

---

## 二、阴影 Token

```css
.markstream-vue {
  --ms-shadow-sm: 0 1px 2px 0 hsl(var(--ms-foreground) / 0.05);
  --ms-shadow: 0 4px 6px -1px hsl(var(--ms-foreground) / 0.1);
  --ms-shadow-md: 0 10px 15px -3px hsl(var(--ms-foreground) / 0.1);
  --ms-shadow-lg: 0 10px 40px hsl(var(--ms-foreground) / 0.25);
}
```

### 当前硬编码值映射

| 当前值 | 出现位置 | 映射到 |
|---|---|---|
| Tailwind `shadow-sm` | CodeBlockNode, D2, Infographic, MarkdownCodeBlock | `--ms-shadow-sm` |
| Tailwind `shadow-md` | Tooltip | `--ms-shadow-md` |
| Tailwind `shadow-lg` | Mermaid modal, Infographic modal | `--ms-shadow-lg` |
| `0 1px 2px 0 hsl(...)` | Mermaid, Infographic (action bar) | `--ms-shadow-sm` |
| `0 10px 40px hsl(...)` | HtmlPreviewFrame | `--ms-shadow-lg` |
| Diff 专用阴影 | CodeBlockNode `.is-dark` 块 | 保留组件内（Monaco 区域） |

---

## 三、动画 Token

```css
.markstream-vue {
  /* 时长 */
  --ms-duration-fast: 120ms;     /* tooltip fade, 快速反馈 */
  --ms-duration-normal: 180ms;   /* 高度过渡、表格淡入 */
  --ms-duration-slow: 300ms;     /* 数学公式切换 */
  --ms-duration-stream: 900ms;   /* 流式打字机淡入 */

  /* 缓动 */
  --ms-ease-default: ease;
  --ms-ease-out: ease-out;
  --ms-ease-spring: cubic-bezier(.16, 1, .3, 1);  /* tooltip 位移 */
}
```

### 当前硬编码值映射

| 当前值 | 出现位置 | 映射到 |
|---|---|---|
| `120ms` | Tooltip enter/leave | `--ms-duration-fast` |
| `150ms` | Mermaid 容器高度 | `--ms-duration-fast` 或 `--ms-duration-normal` |
| `180ms` | CodeBlockNode 高度、TableNode 淡入 | `--ms-duration-normal` |
| `200ms` | Mermaid/Infographic dialog、MathBlock 渲染 | `--ms-duration-normal` |
| `220ms` | ImageNode 切换、Tooltip 位移 | `--ms-duration-normal` 或 `--ms-duration-slow` |
| `300ms` / `0.3s` | MathBlockNode 切换 | `--ms-duration-slow` |
| `900ms` | InlineCodeNode 流式淡入 | `--ms-duration-stream` |
| `1.2s` | Shimmer 动画 | 保留（shimmer 专用） |
| `1.6s` | LinkNode 脉冲 | 保留（脉冲专用） |
| `ease` | 多处 | `--ms-ease-default` |
| `ease-out` | Mermaid 容器、打字机 | `--ms-ease-out` |
| `cubic-bezier(.16,1,.3,1)` | Tooltip | `--ms-ease-spring` |

---

## 四、边框粗细 Token

```css
.markstream-vue {
  --ms-border-width: 1px;        /* 标准边框 */
  --ms-border-width-thick: 4px;  /* 强调边框（admonition、blockquote 左边框） */
}
```

### 当前硬编码值映射

| 当前值 | 出现位置 | 映射到 |
|---|---|---|
| `1px solid` | InlineCodeNode, 多处 `border` | `--ms-border-width` |
| `border-left: 4px solid` | AdmonitionNode | `--ms-border-width-thick` |
| `border-left: 0.25rem solid` | BlockquoteNode (= 4px) | `--ms-border-width-thick` |
| `border: 2px solid` | Spinner (MathBlock, Table, Image) | 保留（spinner 专用） |

---

## 五、容器尺寸 Token

```css
.markstream-vue {
  --ms-container-height: 360px;      /* mermaid / infographic 默认最小高度 */
  --ms-code-max-height: 500px;       /* 代码块折叠最大高度 */
  --ms-image-max-width: 24rem;       /* 图片最大宽度 */
}
```

### 当前硬编码值映射

| 当前值 | 出现位置 | 映射到 |
|---|---|---|
| `min-h-[360px]` | MermaidBlockNode, InfographicBlockNode | `--ms-container-height` |
| `500px` (max-height) | MarkdownCodeBlock, CodeBlock, D2, Infographic, Mermaid | `--ms-code-max-height` |
| `max-width: 24rem` | ImageNode | `--ms-image-max-width` |

---

## 六、不 token 化的项（及原因）

| 项 | 原因 |
|---|---|
| 标题 calc 表达式 (`calc(8/9*1em)` 等) | 排版设计常量，用户不需要改 |
| z-index (`z-50`, `z-[9999]`) | 内部层叠实现，对外无意义 |
| icon 尺寸 (`w-4 h-4`, `w-3 h-3`) | 过于细碎，改了破坏对齐 |
| Spinner border-width (`2px`) | 极少定制需求 |
| Shimmer 时长 (`1.2s`) | 单一用途的动画 |
| 脉冲时长 (`1.6s`) | 链接加载专用 |
| viewport 相对值 (`70vh`, `80vw`) | 运行时响应式，不适合固定 token |

---

## 七、密度主题示例

扩展 token 后可实现的效果：

```css
/* 舒适模式（默认，适合博客/文档阅读） */
.markstream-vue {
  --ms-space-block: 1.25em;
  --ms-space-heading-top: 2rem;
  --ms-space-inset: 1rem;
  --ms-container-height: 360px;
  --ms-duration-normal: 180ms;
}

/* 紧凑模式（适合仪表盘/侧边栏/密集内容） */
.markstream-vue.compact {
  --ms-space-block: 0.75em;
  --ms-space-heading-top: 1rem;
  --ms-space-inset: 0.5rem;
  --ms-container-height: 240px;
  --ms-duration-normal: 120ms;
}
```

---

## 待审查项

- [ ] 间距映射：每个组件的硬编码值是否正确对应到语义 token？
- [ ] 阴影值：当前 Tailwind `shadow-*` 和自定义阴影值是否准确？
- [ ] 动画时长分档：120/180/300/900 是否合理？150ms 和 200ms 归哪档？
- [ ] 容器尺寸：360px、500px 是否在所有组件中一致？
- [ ] 遗漏：是否有其他硬编码维度未列出？
