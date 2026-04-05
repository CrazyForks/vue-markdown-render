# CodeBlock 主题架构

> 核心决策：Monaco 区域与外壳区域分离。Monaco 自治，外壳走 token。

---

## 两区划分

```
┌─────────────────────────────────────────────┐
│  Shell（外壳）                               │  ← token 体系驱动
│  ┌─ header: 标题、语言标签、操作按钮         │
│  ├─ border / shadow / 圆角                   │
│  ├─ 折叠/展开 chrome                         │
│  └─ diff 框架: 外边框、标题栏、文件名        │
│                                               │
│  ┌───────────────────────────────────────┐   │
│  │  Monaco（编辑器区域）                  │   │  ← Monaco 主题自治
│  │  ┌─ 背景、前景                        │   │
│  │  ├─ 语法高亮色（keyword, string...）   │   │
│  │  ├─ 行号                              │   │
│  │  ├─ 选区背景                          │   │
│  │  ├─ diff 行背景（added/removed line） │   │
│  │  ├─ diff 内联高亮（added/removed word）│   │
│  │  └─ gutter 标记                       │   │
│  └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Shell 区域

| 元素 | 取值来源 | 当前 token |
|---|---|---|
| 容器边框 | 页面主题 token | `var(--code-border)` |
| Header 背景 | 页面主题 token | `var(--code-header-bg)` |
| 操作按钮 | 页面主题 token | `var(--code-action-*)` |
| 折叠/展开 | 页面主题 token | `var(--code-action-*)` |
| Diff 外框/阴影 | 页面主题 token | `var(--code-border)` 等 |
| Diff 标题栏/文件名 | 页面主题 token | `var(--code-header-bg)` 等 |

Shell 区域跟随页面 `.dark` 自动切换，无需 `.is-dark`。

### Monaco 区域

| 元素 | 取值来源 | 说明 |
|---|---|---|
| 编辑器背景/前景 | Monaco theme | `--vscode-editor-background/foreground` |
| 语法高亮色 | Monaco theme | 完全由 Monaco token colors 决定 |
| 行号色 | Monaco theme | `--vscode-editorLineNumber-foreground` |
| 选区背景 | Monaco theme | `--vscode-editor-selectionBackground` |
| Diff 行背景 | 基于 Monaco 明暗 | 需要感知 Monaco 表面亮度 |
| Diff 内联高亮 | 基于 Monaco 明暗 | 需要感知 Monaco 表面亮度 |
| Gutter 标记 | 基于 Monaco 明暗 | 需要感知 Monaco 表面亮度 |

Monaco 区域完全由 Monaco 主题决定，不受页面 `.dark` 直接影响。

---

## Monaco 主题切换规则

### 优先级

```
用户强制指定 > 页面明暗自动切换
```

### 行为矩阵

| 用户配置 | 页面 Light | 页面 Dark |
|---|---|---|
| 未指定（默认） | 使用 `lightTheme` | 使用 `darkTheme` |
| 仅指定 `lightTheme` | 使用指定值 | 使用 `darkTheme`（默认） |
| 仅指定 `darkTheme` | 使用 `lightTheme`（默认） | 使用指定值 |
| 指定 `forceTheme` | **始终使用 `forceTheme`** | **始终使用 `forceTheme`** |

### Props 设计

```ts
interface CodeBlockProps {
  // 自动切换（现有行为，保留）
  lightTheme?: string | MonacoThemeObject   // 亮色页面时使用
  darkTheme?: string | MonacoThemeObject    // 暗色页面时使用

  // 强制指定（新增）
  forceTheme?: string | MonacoThemeObject   // 设置后忽略明暗切换，始终使用此主题
}
```

### 切换逻辑

```ts
const activeTheme = computed(() => {
  if (props.forceTheme) return props.forceTheme
  return isDark.value ? props.darkTheme : props.lightTheme
})
```

其中 `isDark` 来自页面级 `.dark` 状态（不再反向检测 Monaco 表面亮度）。

---

## `.is-dark` 的角色变化

### 之前

```
Monaco 主题加载 → 检测 editor background 亮度 → resolvedSurfaceIsDark
  → .is-dark class → 驱动 diff/gutter/skeleton 颜色
```

问题：反向检测，增加复杂度且有延迟。

### 之后

```
页面 isDark → 选择 darkTheme/lightTheme → Monaco 加载
  → .is-dark class 仍需保留，但来源更清晰：

  if (forceTheme) → 检测 forceTheme 的 bg 亮度决定 .is-dark
  else            → 直接等于页面 isDark
```

`.is-dark` 在 Monaco 区域附近仍有必要——因为 diff 行背景、gutter 标记等需要匹配
Monaco 的表面亮度（不是页面亮度）。但触发逻辑从"反向检测"变为"正向推导"。

### `forceTheme` 的特殊情况

用户在亮色页面上强制使用暗色代码主题（如 Monokai）：
- Shell 外壳：亮色（跟随页面 token）
- Monaco 编辑器：暗色（forceTheme）
- `.is-dark`：true（因为编辑器表面是暗的）
- Diff 行高亮：暗色风格（匹配编辑器表面）

这正是分离的价值——两个区域可以有不同的明暗状态。

---

## `--markstream-diff-*` 变量归属

按归属区域重新分类：

### 归 Shell（走 token 体系）

| 变量 | 说明 | 迁移到 |
|---|---|---|
| `--markstream-diff-frame-border` | diff 外框边框 | `var(--code-border)` |
| `--markstream-diff-frame-shadow` | diff 外框阴影 | 新 token 或内联 |
| `--markstream-diff-shell-*` | diff 壳体样式 | token 化 |
| `--markstream-diff-header-border` | diff 标题分隔线 | `var(--code-border)` |
| `--markstream-diff-stage-bg` | diff 舞台区域背景 | token 化 |
| `--markstream-diff-focus` | focus 环 | `var(--focus-ring)` |
| `--markstream-diff-action-hover` | 操作按钮 hover | `var(--code-action-hover-bg)` |
| `--markstream-diff-panel-bg*` | 面板背景 | token 化 |
| `--markstream-diff-panel-border` | 面板边框 | token 化 |
| `--markstream-diff-pane-divider` | 面板分隔线 | token 化 |
| `--markstream-diff-widget-shadow` | 小部件阴影 | token 化 |

### 归 Monaco 区域（保留组件内，跟随 `.is-dark`）

| 变量 | 说明 | 原因 |
|---|---|---|
| `--markstream-diff-editor-bg/fg` | 编辑器区域背景/前景 | 匹配 Monaco 表面 |
| `--markstream-diff-added-fg/bg` | diff 新增行 | 需匹配编辑器表面亮度 |
| `--markstream-diff-removed-fg/bg` | diff 删除行 | 需匹配编辑器表面亮度 |
| `--markstream-diff-added/removed-inline` | diff 内联高亮 | 需匹配编辑器表面亮度 |
| `--markstream-diff-added/removed-gutter` | gutter 标记 | 需匹配编辑器表面亮度 |
| `--markstream-diff-line-number*` | 行号 | 匹配 Monaco 行号色 |
| `--markstream-diff-unchanged-*` | 未变更区域 | 匹配编辑器表面 |
| `--markstream-diff-gutter-*` | gutter 区域 | 匹配编辑器表面 |
| `--markstream-diff-added/removed-line-fill` | 行填充 | 匹配编辑器表面亮度 |

### Diff 色彩仍使用全局 token

diff 的基色（added/removed 的色相和饱和度）仍来自全局 token：

```
全局 token                    Monaco 区域使用
──────────                    ──────────────
--ms-diff-added              → --markstream-diff-added-fg (直引)
--ms-diff-removed            → --markstream-diff-removed-fg (直引)
--diff-added-bg (0.1 opacity) → --markstream-diff-added-line (直引)
--diff-removed-bg            → --markstream-diff-removed-line (直引)
```

用户改全局 `--ms-diff-added` → diff 编辑器区域颜色也会变。

---

## 实施步骤

| 阶段 | 内容 |
|---|---|
| 1 | 将 Shell 归属的 `--markstream-diff-*` 变量替换为 token 引用，移出 `.is-dark` 块 |
| 2 | Monaco 归属的变量保留在 `.is-dark` 块，但确认都引用 `--ms-*` 语义令牌 |
| 3 | 简化 `.is-dark` 触发逻辑：非 forceTheme 时直接等于 `isDark`，forceTheme 时检测主题亮度 |
| 4 | 实现 `forceTheme` prop |
| 5 | 清理冗余的 `--markstream-*` 变量（shell 部分已被 token 替代的可删除） |
