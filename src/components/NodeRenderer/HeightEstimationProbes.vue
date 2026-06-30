<script setup lang="ts">
import type { ParsedNode } from 'stream-markdown-parser'
import HeadingNode from '../../components/HeadingNode'
import ListItemNode from '../../components/ListItemNode'
import ListNode from '../../components/ListNode'
import ParagraphNode from '../../components/ParagraphNode'

defineOptions({ name: 'HeightEstimationProbes' })

const props = defineProps<{
  width: number
  flowRoot: boolean
  paragraphNode: ParsedNode | null
  listItemNode: ParsedNode | null
  listNode: ParsedNode | null
  headingNodes: Record<number, ParsedNode | null> | null
  setParagraphWrapper: (el: HTMLElement | null) => void
  setListItemWrapper: (el: HTMLElement | null) => void
  setListWrapper: (el: HTMLElement | null) => void
  setHeadingWrapper: (level: number, el: HTMLElement | null) => void
}>()

function getHeadingNode(level: number) {
  return props.headingNodes?.[level] ?? null
}
</script>

<template>
  <div
    class="height-estimation-probes"
    :style="{ width: `${width}px` }"
    aria-hidden="true"
  >
    <div
      :ref="el => setParagraphWrapper(el as HTMLElement | null)"
      class="node-content"
      :class="{ 'node-content-flow-root': flowRoot }"
      data-probe="paragraph"
    >
      <ParagraphNode
        :node="paragraphNode as any"
        index-key="probe-paragraph"
      />
    </div>
    <div
      :ref="el => setListItemWrapper(el as HTMLElement | null)"
      class="node-content"
      :class="{ 'node-content-flow-root': flowRoot }"
      data-probe="list-item"
    >
      <ul class="m-0 p-0">
        <ListItemNode
          :node="listItemNode as any"
          index-key="probe-list-item"
        />
      </ul>
    </div>
    <div
      :ref="el => setListWrapper(el as HTMLElement | null)"
      class="node-content"
      :class="{ 'node-content-flow-root': flowRoot }"
      data-probe="list"
    >
      <ListNode
        :node="listNode as any"
        index-key="probe-list"
      />
    </div>
    <div
      v-for="level in 6"
      :key="`probe-heading-${level}`"
      :ref="el => setHeadingWrapper(level, el as HTMLElement | null)"
      class="node-content"
      :class="{ 'node-content-flow-root': flowRoot }"
      :data-probe="`heading-${level}`"
    >
      <HeadingNode
        :node="getHeadingNode(level) as any"
        :index-key="`probe-heading-${level}`"
      />
    </div>
  </div>
</template>

<style scoped>
.height-estimation-probes {
  position: absolute;
  left: -100000px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  overflow: hidden;
  z-index: -1;
}

.node-content {
  width: 100%;
}

.node-content-flow-root {
  display: flow-root;
}
</style>
