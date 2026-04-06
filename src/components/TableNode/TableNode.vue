<script setup lang="ts">
import { computed } from 'vue'
import NodeRenderer from '../NodeRenderer'

interface TableCellNode {
  type: 'table_cell'
  header: boolean
  children: {
    type: string
    raw: string
  }[]
  raw: string
  align?: 'left' | 'right' | 'center'
}

interface TableRowNode {
  type: 'table_row'
  cells: TableCellNode[]
  raw: string
}

interface TableNode {
  type: 'table'
  header: TableRowNode
  rows: TableRowNode[]
  raw: string
  loading: boolean
}

const props = defineProps<{
  node: TableNode
  indexKey: string | number
  isDark?: boolean
  typewriter?: boolean
  customId?: string
}>()

defineEmits(['copy'])

const isLoading = computed(() => props.node.loading ?? false)
const bodyRows = computed(() => props.node.rows ?? [])
</script>

<template>
  <div class="table-node-wrapper">
    <table
      class="table-node"
      :class="{ 'table-node--loading': isLoading }"
      :aria-busy="isLoading"
    >
      <thead>
        <tr>
          <th
            v-for="(cell, index) in node.header.cells"
            :key="`header-${index}`"
            dir="auto"
            :class="[
              cell.align === 'right'
                ? 'text-right'
                : cell.align === 'center'
                  ? 'text-center'
                  : 'text-left',
            ]"
          >
            <NodeRenderer
              :nodes="cell.children"
              :index-key="`table-th-${props.indexKey}`"
              :custom-id="props.customId"
              :typewriter="props.typewriter"
              @copy="$emit('copy', $event)"
            />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIndex) in bodyRows"
          :key="`row-${rowIndex}`"
        >
          <td
            v-for="(cell, cellIndex) in row.cells"
            :key="`cell-${rowIndex}-${cellIndex}`"
            :class="[
              cell.align === 'right'
                ? 'text-right'
                : cell.align === 'center'
                  ? 'text-center'
                  : 'text-left',
            ]"
            dir="auto"
          >
            <NodeRenderer
              :nodes="cell.children"
              :index-key="`table-td-${props.indexKey}`"
              :custom-id="props.customId"
              :typewriter="props.typewriter"
              @copy="$emit('copy', $event)"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <transition name="table-node-fade">
      <div v-if="isLoading" class="table-node__loading" role="status" aria-live="polite">
        <slot name="loading" :is-loading="isLoading">
          <span class="table-node__spinner animate-spin" aria-hidden="true" />
          <span class="sr-only">Loading</span>
        </slot>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.table-node-wrapper {
  position: relative;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  overscroll-behavior-y: auto;
  scrollbar-gutter: stable;
}

.table-node {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: var(--ms-flow-table-y) 0;
  font-size: inherit;
  border: 1px solid var(--table-border);
  border-radius: var(--ms-radius);
  overflow: hidden;
  box-shadow: var(--ms-shadow-subtle);
}

/* ── Full grid borders (inner only, outer handled by table border) ── */
.table-node :deep(th),
.table-node :deep(td) {
  border-bottom: 1px solid var(--table-border);
  border-right: 1px solid var(--table-border);
  padding: 0.5em 0.75em;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
}

/* Remove right border on last cell */
.table-node :deep(th:last-child),
.table-node :deep(td:last-child) {
  border-right: none;
}

/* Remove bottom border on last row */
.table-node :deep(tbody tr:last-child td) {
  border-bottom: none;
}

/* ── Header ── */
.table-node :deep(thead th) {
  font-weight: 600;
  background-color: var(--table-header-bg);
  border-bottom-width: 2px;
}

/* ── Zebra striping (very subtle) ── */
.table-node :deep(tbody tr:nth-child(even)) {
  background-color: hsl(var(--ms-muted) / 0.35);
}

/* ── Row hover ── */
.table-node :deep(tbody tr):hover {
  background-color: var(--code-action-hover-bg);
}

/* ── Loading ── */
.table-node--loading tbody td {
  position: relative;
  overflow: hidden;
}

.table-node--loading tbody td > * {
  visibility: hidden;
}

.table-node--loading tbody td::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 0.25rem;
  background: linear-gradient(
    90deg,
    var(--loading-shimmer) 25%,
    var(--loading-shimmer) 50%,
    var(--loading-shimmer) 75%
  );
  background-size: 200% 100%;
  animation: table-node-shimmer 1.2s linear infinite;
  will-change: background-position;
}

.table-node__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.table-node__spinner {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  border: 2px solid color-mix(in srgb, var(--loading-spinner) 25%, transparent);
  border-top-color: color-mix(in srgb, var(--loading-spinner) 80%, transparent);
  will-change: transform;
}

.table-node-fade-enter-active,
.table-node-fade-leave-active {
  transition: opacity var(--ms-duration-standard) var(--ms-ease-standard);
}

.table-node-fade-enter-from,
.table-node-fade-leave-to {
  opacity: 0;
}

/* ── Table inside NodeRenderer ── */
:deep(.table-node .markdown-renderer) {
  display: contents;
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}

:deep(.table-node .markdown-renderer .node-slot),
:deep(.table-node .markdown-renderer .node-content),
:deep(.table-node .markdown-renderer .node-space) {
  display: contents;
}

:deep(.table-node .text-node),
:deep(.table-node code) {
  white-space: inherit;
  overflow-wrap: inherit;
  word-break: inherit;
  max-width: none;
}

@keyframes table-node-shimmer {
  0% { background-position: 0% 0%; }
  50% { background-position: 100% 0%; }
  100% { background-position: 200% 0%; }
}

.hr + .table-node-wrapper {
  margin-top: 0;
}

.hr + .table-node-wrapper .table-node {
  margin-top: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
