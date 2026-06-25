import type React from 'react'
import type {
  HtmlComponentMap,
  NodeComponentProps,
  StreamingComponentMap,
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

void streamingComponents
void htmlComponents
