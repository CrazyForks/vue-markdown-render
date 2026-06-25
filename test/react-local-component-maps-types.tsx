import type React from 'react'
import type {
  HtmlComponentMap,
  NodeComponentProps,
  StreamingComponentMap,
} from '../packages/markstream-react/src'
import {
  defineHtmlComponents,
  defineStreamingComponents,
} from '../packages/markstream-react/src'

interface DocumentLinkNode {
  type: 'documentlink'
  tag: 'documentlink'
  attrs?: [string, string][]
  content: string
  loading?: boolean
}

function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
  return <span>{props.node.content}</span>
}

function Badge({ kind, children }: React.PropsWithChildren<{ kind?: string }>) {
  return <span data-kind={kind}>{children}</span>
}

const streamingComponents = {
  documentlink: DocumentLink,
} satisfies StreamingComponentMap

const htmlComponents = {
  badge: Badge,
} satisfies HtmlComponentMap

const wrongHtmlComponents = {
  // @ts-expect-error html component maps must not require parser-backed props.node.
  documentlink: DocumentLink,
} satisfies HtmlComponentMap

const definedStreamingComponents = defineStreamingComponents({
  documentlink: DocumentLink,
})

const definedHtmlComponents = defineHtmlComponents({
  badge: Badge,
})

defineStreamingComponents({
  // @ts-expect-error streamingComponents require parser-backed NodeComponentProps.
  badge: Badge,
})

defineHtmlComponents({
  // @ts-expect-error htmlComponents must not require parser-backed props.node.
  documentlink: DocumentLink,
})

void streamingComponents
void htmlComponents
void wrongHtmlComponents
void definedStreamingComponents
void definedHtmlComponents
