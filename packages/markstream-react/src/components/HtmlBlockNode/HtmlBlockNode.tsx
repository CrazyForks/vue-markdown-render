import type { NodeComponentProps } from '../../types/node-component'
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useViewportPriority } from '../../context/viewportPriority'
import { getCustomComponentsRevision, getCustomNodeComponents, subscribeCustomComponents } from '../../customComponents'
import { tokenAttrsToProps } from '../../renderers/renderChildren'
import { hasCustomHtmlComponents, parseHtmlToReactNodes } from '../../utils/htmlToReact'

export function HtmlBlockNode(props: NodeComponentProps<{
  type: 'html_block'
  content: string
  attrs?: [string, string | null][] | null
  loading?: boolean
}> & {
  customComponents?: Record<string, React.ComponentType<any>>
  placeholder?: React.ReactNode
}) {
  const { node, placeholder, customId } = props
  const registerViewport = useViewportPriority()
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null)
  const handleRef = useRef<ReturnType<typeof registerViewport> | null>(null)
  const [shouldRender, setShouldRender] = useState(() => typeof window === 'undefined')
  const [renderContent, setRenderContent] = useState(node.content)
  const isDeferred = Boolean(node.loading)

  const customComponentsRevision = useSyncExternalStore(
    subscribeCustomComponents,
    getCustomComponentsRevision,
    getCustomComponentsRevision,
  )

  const effectiveCustomComponents = useMemo(() => {
    // Allow explicit injection (primarily for tests), otherwise fall back to global store.
    return props.customComponents ?? getCustomNodeComponents(customId)
  }, [customId, props.customComponents, customComponentsRevision])

  useEffect(() => {
    if (typeof window === 'undefined') {
      setShouldRender(true)
      return
    }
    handleRef.current?.destroy()
    handleRef.current = null
    if (!isDeferred) {
      setShouldRender(true)
      setRenderContent(node.content)
      return
    }
    if (!hostEl) {
      setShouldRender(false)
      return
    }
    const handle = registerViewport(hostEl, { rootMargin: '400px' })
    handleRef.current = handle
    if (handle.isVisible())
      setShouldRender(true)
    handle.whenVisible.then(() => setShouldRender(true)).catch(() => {})
    return () => {
      handle.destroy()
      handleRef.current = null
    }
  }, [hostEl, isDeferred, node.content, registerViewport])

  useEffect(() => () => {
    handleRef.current?.destroy()
    handleRef.current = null
  }, [])

  useEffect(() => {
    if (!isDeferred || shouldRender)
      setRenderContent(node.content)
  }, [isDeferred, node.content, shouldRender])

  const boundAttrs = useMemo(() => tokenAttrsToProps(node.attrs ?? undefined), [node.attrs])

  // Check if we should use dynamic rendering
  const useDynamic = useMemo(() => {
    return hasCustomHtmlComponents(node.content ?? '', effectiveCustomComponents)
  }, [effectiveCustomComponents, node.content])

  const reactNodes = useMemo(() => {
    if (!useDynamic || !node.content)
      return null
    return parseHtmlToReactNodes(node.content, effectiveCustomComponents)
  }, [effectiveCustomComponents, node.content, useDynamic])

  return (
    <div ref={setHostEl} className="html-block-node" {...(boundAttrs as any)}>
      {shouldRender
        ? (
            useDynamic && reactNodes
              ? (
                  <>{reactNodes}</>
                )
              : (
                  <div dangerouslySetInnerHTML={{ __html: renderContent ?? '' }} />
                )
          )
        : (
            <div className="html-block-node__placeholder">
              {placeholder ?? (
                <>
                  <span className="html-block-node__placeholder-bar" />
                  <span className="html-block-node__placeholder-bar w-4/5" />
                  <span className="html-block-node__placeholder-bar w-2/3" />
                </>
              )}
            </div>
          )}
    </div>
  )
}

export default HtmlBlockNode
