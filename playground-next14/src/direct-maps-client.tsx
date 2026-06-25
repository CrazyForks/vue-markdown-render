'use client'

import type { NodeComponentProps } from 'markstream-react/next'
import { defineHtmlComponents, defineStreamingComponents, NodeRenderer } from 'markstream-react/next'
import React from 'react'

interface DocumentLinkNode {
  type: 'documentlink'
  tag: 'documentlink'
  attrs?: [string, string | null][]
  content: string
}

function readAttr(node: DocumentLinkNode, name: string) {
  return node.attrs?.find(([key]) => key === name)?.[1] ?? undefined
}

function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
  return (
    <span
      data-next-direct-map="streaming"
      data-next-direct-map-id={readAttr(props.node, 'id')}
    >
      {props.node.content}
    </span>
  )
}

function Badge(props: React.PropsWithChildren<{ tone?: string }>) {
  return (
    <span
      data-next-direct-map="html"
      data-next-direct-map-tone={props.tone}
    >
      {props.children}
    </span>
  )
}

const streamingComponents = defineStreamingComponents({
  documentlink: DocumentLink,
})

const htmlComponents = defineHtmlComponents({
  badge: Badge,
})

export function DirectMapsClient({ content }: { content: string }) {
  return (
    <NodeRenderer
      content={content}
      final
      htmlComponents={htmlComponents}
      smoothStreaming={false}
      streamingComponents={streamingComponents}
    />
  )
}
