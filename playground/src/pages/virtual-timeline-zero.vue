<script setup lang="ts">
import type { Component } from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import MarkdownRender, { MarkstreamVirtualTimeline } from '../../../src/exports'
import '../../../src/index.css'

type ThreadId = 'thread-a' | 'thread-b'

type TimelineItem
  = | { kind: 'system-divider', id: string, text: string }
    | { kind: 'user-message', id: string, text: string }
    | { kind: 'assistant-markdown', id: string, content: string, final: boolean, revision?: number }
    | { kind: 'tool-call', id: string, status: 'running' | 'done', label: string }
    | { kind: 'thinking', id: string, content: string }
    | { kind: 'error', id: string, message: string }
    | { kind: 'custom', id: string, component: Component }

const activeThreadId = ref<ThreadId>('thread-a')

const InspectionPanel = defineComponent({
  name: 'InspectionPanel',
  setup() {
    return () => h('div', { class: 'custom-panel' }, [
      h('strong', 'Custom timeline item'),
      h('span', 'Rendered and measured by the outer timeline virtualizer.'),
    ])
  },
})

function makeLargeMarkdown(label: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const step = index + 1
    return [
      `## ${label} section ${step}`,
      `This block is part of a long assistant answer. It is intentionally repeated so MarkdownRender can virtualize block nodes while the timeline virtualizer owns the outer item height.`,
      '',
      '```ts',
      `const section${step} = ${JSON.stringify({ step, label })}`,
      '```',
    ].join('\n')
  }).join('\n\n')
}

const threadItems: Record<ThreadId, TimelineItem[]> = {
  'thread-a': [
    { kind: 'system-divider', id: 'a-d-1', text: 'Today' },
    { kind: 'user-message', id: 'a-u-1', text: 'Audit this PR and keep the scroll position stable while tools run.' },
    { kind: 'thinking', id: 'a-t-1', content: 'Inspecting changed files and estimating render cost.' },
    { kind: 'tool-call', id: 'a-tool-1', status: 'running', label: 'Reading GitHub PR' },
    { kind: 'assistant-markdown', id: 'a-md-1', content: makeLargeMarkdown('PR analysis', 28), final: true, revision: 1 },
    { kind: 'tool-call', id: 'a-tool-2', status: 'done', label: 'Search complete' },
    { kind: 'custom', id: 'a-custom-1', component: InspectionPanel },
    { kind: 'error', id: 'a-error-1', message: 'Tool call failed once and was retried.' },
  ],
  'thread-b': [
    { kind: 'system-divider', id: 'b-d-1', text: 'Yesterday' },
    { kind: 'user-message', id: 'b-u-1', text: 'Summarize the virtual timeline contract.' },
    { kind: 'assistant-markdown', id: 'b-md-1', content: makeLargeMarkdown('Timeline contract', 18), final: true, revision: 2 },
    { kind: 'tool-call', id: 'b-tool-1', status: 'done', label: 'Height cache imported' },
    { kind: 'assistant-markdown', id: 'b-md-2', content: makeLargeMarkdown('Restore notes', 12), final: true, revision: 1 },
  ],
}

const timelineItems = computed(() => threadItems[activeThreadId.value])

function switchThread(threadId: ThreadId) {
  activeThreadId.value = threadId
}
</script>

<template>
  <main class="virtual-timeline-zero">
    <header class="lab-header">
      <div>
        <strong>markstream-vue virtual timeline zero config</strong>
        <span>Mixed timeline item virtualization with Markdown node virtualization inside assistant items.</span>
      </div>
      <div class="thread-tabs">
        <button
          :class="{ active: activeThreadId === 'thread-a' }"
          @click="switchThread('thread-a')"
        >
          Thread A
        </button>
        <button
          :class="{ active: activeThreadId === 'thread-b' }"
          @click="switchThread('thread-b')"
        >
          Thread B
        </button>
      </div>
    </header>

    <MarkstreamVirtualTimeline
      class="timeline-surface"
      :items="timelineItems"
      :thread-key="activeThreadId"
      :overscan="4"
      stick-to-bottom="auto"
    >
      <template #default="{ item, measureRef, markdownProps }">
        <div
          v-if="item.kind === 'system-divider'"
          :ref="measureRef"
          class="divider-row"
        >
          {{ item.text }}
        </div>

        <article
          v-else-if="item.kind === 'user-message'"
          :ref="measureRef"
          class="bubble user-bubble"
        >
          {{ item.text }}
        </article>

        <article
          v-else-if="item.kind === 'thinking'"
          :ref="measureRef"
          class="status-row thinking-row"
        >
          {{ item.content }}
        </article>

        <article
          v-else-if="item.kind === 'tool-call'"
          :ref="measureRef"
          class="status-row tool-row"
        >
          <span>{{ item.status }}</span>
          {{ item.label }}
        </article>

        <MarkdownRender
          v-else-if="item.kind === 'assistant-markdown'"
          v-bind="markdownProps"
          class="assistant-markdown"
        />

        <component
          :is="item.component"
          v-else-if="item.kind === 'custom'"
          :ref="measureRef"
        />

        <article
          v-else-if="item.kind === 'error'"
          :ref="measureRef"
          class="status-row error-row"
        >
          {{ item.message }}
        </article>
      </template>
    </MarkstreamVirtualTimeline>
  </main>
</template>

<style scoped>
.virtual-timeline-zero {
  min-height: 100vh;
  padding: 20px;
  background: #f8fafc;
  color: #111827;
}

.lab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1040px;
  margin: 0 auto 16px;
}

.lab-header div:first-child {
  display: grid;
  gap: 4px;
}

.lab-header strong {
  font-size: 16px;
}

.lab-header span {
  color: #475569;
  font-size: 13px;
}

.thread-tabs {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
}

.thread-tabs button {
  min-width: 86px;
  padding: 7px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  cursor: pointer;
}

.thread-tabs button.active {
  background: #0f172a;
  color: #fff;
}

.timeline-surface {
  height: calc(100vh - 104px);
  max-width: 1040px;
  margin: 0 auto;
  padding: 10px 18px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
}

.divider-row {
  padding: 12px 0;
  color: #64748b;
  font-size: 12px;
  text-align: center;
}

.bubble,
.status-row,
.custom-panel {
  max-width: min(760px, 88%);
  margin: 10px 0;
  padding: 12px 14px;
  border-radius: 8px;
  line-height: 1.55;
}

.user-bubble {
  margin-left: auto;
  background: #dcfce7;
  color: #14532d;
}

.assistant-markdown {
  max-width: 860px;
  margin: 10px 0;
}

.status-row {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e3a8a;
}

.thinking-row {
  border-color: #ddd6fe;
  background: #f5f3ff;
  color: #4c1d95;
}

.tool-row span {
  display: inline-block;
  margin-right: 8px;
  color: #475569;
  font-size: 12px;
  text-transform: uppercase;
}

.error-row {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.custom-panel {
  display: grid;
  gap: 4px;
  border: 1px solid #fed7aa;
  background: #fff7ed;
  color: #7c2d12;
}

.custom-panel span {
  font-size: 13px;
}

@media (max-width: 760px) {
  .virtual-timeline-zero {
    padding: 12px;
  }

  .lab-header {
    align-items: stretch;
    flex-direction: column;
  }

  .thread-tabs {
    align-self: flex-start;
  }

  .timeline-surface {
    height: calc(100vh - 142px);
    padding: 8px 10px;
  }

  .bubble,
  .status-row,
  .custom-panel,
  .assistant-markdown {
    max-width: 100%;
  }
}
</style>
