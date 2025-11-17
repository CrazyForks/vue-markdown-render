# Tailwind 集成与样式顺序

如果你的项目使用 Tailwind 或基于 Tailwind 的组件库（如 shadcn），可能会遇到样式覆盖问题。推荐将 `vue-renderer-markdown` 的 CSS 导入置于 `@layer components { ... }` 中以控制样式优先级。

示例：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  @import 'vue-renderer-markdown/index.css';
}
```

更多替代方案：使用 `prefix` 配置以避免类名冲突，或在应用层覆盖样式。
