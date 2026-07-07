# Markstream-Vue 性能优化报告

## 优化概览

本次优化针对以下关键性能瓶颈：
1. **RAF/setTimeout 调用过多**：多个组件独立调度导致帧率下降
2. **批量渲染调度器效率**：嵌套的 RAF + setTimeout 链导致延迟
3. **高度估算计算**：频繁的回退计算影响 streaming 性能
4. **DOM 读取批处理**：未充分利用批处理减少 layout thrashing

## 已完成的优化

### 1. 统一调度器 (`src/utils/unifiedScheduler.ts`)

**问题**：
- 多个组件独立使用 RAF/setTimeout
- 每个组件的每次更新都可能触发新的 RAF
- 没有优先级管理

**优化方案**：
- 创建单例调度器，合并所有 RAF 调用
- 实现优先级系统：immediate, high, normal, low, idle
- 在单个帧内批量执行多个任务
- 支持 requestIdleCallback 用于低优先级任务

**预期收益**：
- 减少 50-70% 的 RAF 调用次数
- 降低 CPU 占用率 15-25%
- 改善帧率稳定性

### 2. 优化节流函数 (`src/utils/throttle.ts`)

**问题**：
- 每次调用都创建新的 setTimeout
- 不保存最新参数，可能丢失更新

**优化方案**：
- 缓存最新参数，确保使用最新值
- 减少 setTimeout 创建次数
- 更精确的时间计算

**预期收益**：
- 减少 30-40% 的 setTimeout 调用
- 避免丢失最新更新

### 3. 批量 DOM 读取优化 (`src/utils/batchDOMReader.ts`)

**问题**：
- readSync 在有 pending RAF 时强制 flush
- 可能导致布局抖动

**优化方案**：
- 添加 isProcessing 标志避免重入
- readSync 在未调度时立即执行，避免不必要的 RAF
- 改进取消逻辑

**预期收益**：
- 减少强制同步布局次数
- 降低 layout thrashing

### 4. 批量渲染调度器优化 (`useBatchRenderingScheduler.optimized.ts`)

**问题**：
- 嵌套的 RAF → setTimeout 链
- 每次测量都创建多个 RAF/timeout
- 复杂的清理逻辑

**优化方案**：
- 统一调度状态管理（scheduleId + scheduleType）
- 消除 RAF 嵌套，直接使用单一调度路径
- 简化 commit measurement，使用单次 RAF + fallback timeout
- 优先使用 requestIdleCallback

**预期收益**：
- 减少 streaming 场景下的调度延迟 40-60%
- 降低 CPU 占用率 20-30%
- 减少帧抖动

## 下一步优化计划

### 5. Parser 缓存策略优化

**目标文件**：`src/components/NodeRenderer/composables/useMarkdownParsing.ts`

**优化点**：
- 改进 token 克隆策略，避免不必要的深拷贝
- 优化 append/tail 缓存命中判断
- 减少 stabilize 计算复杂度

### 6. 高度估算算法优化

**目标文件**：`src/components/NodeRenderer/composables/useHeightModel.ts`

**优化点**：
- 缓存回退高度计算结果
- 优化文本长度估算公式
- 减少遍历次数

### 7. CSS 动画性能

**优化点**：
- 确保所有动画使用 transform/opacity
- 添加 will-change 提示
- 使用 contain 属性隔离重绘区域

### 8. 虚拟滚动批量测量

**目标文件**：`src/composables/useMarkstreamVirtualAdapter.ts`

**优化点**：
- 批量测量高度，减少 reflow
- 使用 IntersectionObserver 优化可见性检测
- 优化滚动恢复逻辑

## 测试计划

### 性能指标

1. **Parser 速度**
   - 1KB 内容：< 1ms (P95)
   - 10KB 内容：< 5ms (P95)
   - 100KB 内容：< 50ms (P95)

2. **Streaming 渲染**
   - 每秒渲染节点数：> 100 nodes/s
   - CPU 占用率：< 30%
   - 帧率：> 55 FPS

3. **全量恢复**
   - 10,000 字符：< 100ms
   - 100,000 字符：< 500ms
   - 容器高度变化：仅 image/katex

4. **重绘次数**
   - Streaming 场景：< 每节点 1.5 次重绘
   - 滚动场景：< 每帧 3 次布局

### 测试场景

1. **短文本 streaming**（模拟打字效果）
2. **中等文本 streaming**（AI 回复）
3. **大文档全量恢复**（聊天历史恢复）
4. **虚拟滚动性能**（长列表滚动）
5. **混合内容**（代码块、数学公式、图片）

## 实施步骤

1. ✅ 创建优化版本文件
2. ⏳ 运行现有测试建立基准
3. ⏳ 应用优化并运行对比测试
4. ⏳ Code review 验证无副作用
5. ⏳ 集成优化版本
6. ⏳ 全量测试验证

## 风险评估

### 低风险
- 统一调度器：纯新增，不影响现有逻辑
- 节流函数优化：行为保持一致
- DOM 批处理优化：向后兼容

### 中风险
- 批量渲染调度器：核心渲染路径，需要充分测试
  - 缓解措施：保留原版本，feature flag 切换

### 测试重点
- SSR 兼容性
- 嵌套渲染器场景
- 快速内容更新场景
- 大文档场景
- 移动设备性能

## 性能监控

添加性能监控钩子：
- `__MARKSTREAM_PERF__` 全局对象
- RAF 调用计数
- 渲染批次统计
- 高度估算命中率
- Layout read 计数

## 预期总体收益

- **Parser 速度**：提升 10-20%
- **Streaming 性能**：提升 40-60%
- **CPU 占用率**：降低 25-35%
- **帧率稳定性**：提升 30-50%
- **全量恢复**：提升 15-25%
- **RAF 调用次数**：减少 60-80%
