import type { NodeComponentProps } from '../../types/node-component'
import clsx from 'clsx'
import React, { useEffect, useRef, useState } from 'react'
import { useStreamStateRef } from '../../context/streamState'

interface StreamSegment {
  id: number
  content: string
  fading: boolean
}

function settleAndMergeSegments(segments: StreamSegment[], segmentId?: number) {
  return segments.reduce<StreamSegment[]>((result, segment) => {
    const nextSegment = segmentId == null || segment.id === segmentId
      ? { ...segment, fading: false }
      : segment
    const previousSegment = result[result.length - 1]
    if (previousSegment && !previousSegment.fading && !nextSegment.fading) {
      result[result.length - 1] = {
        ...previousSegment,
        content: previousSegment.content + nextSegment.content,
      }
    }
    else {
      result.push(nextSegment)
    }
    return result
  }, [])
}

export function TextNode(props: NodeComponentProps<{ type: 'text', content: string, center?: boolean }>) {
  const { node, children, ctx, indexKey, fade } = props
  const content = String(node.content ?? '')
  const fadeEnabled = fade ?? ctx?.fade ?? true
  const streamStateKey = indexKey == null || indexKey === ''
    ? ''
    : String(indexKey)
  const [segments, setSegments] = useState<StreamSegment[]>(content
    ? [{ id: 0, content, fading: false }]
    : [])
  const streamStateRef = useStreamStateRef()
  const renderedContentRef = useRef(content)
  const nextSegmentIdRef = useRef(1)
  const lastStreamRenderVersionRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const streamRenderVersion = streamStateRef?.getStreamRenderVersion() ?? ctx?.streamRenderVersion
    const streamRenderVersionChanged = streamRenderVersion !== lastStreamRenderVersionRef.current

    if (children != null) {
      renderedContentRef.current = ''
      setSegments([])
      lastStreamRenderVersionRef.current = streamRenderVersion
      return
    }

    const textStreamState = streamStateRef?.textStreamState ?? ctx?.textStreamState
    const persistedContent = streamStateKey
      ? textStreamState?.get(streamStateKey)
      : undefined
    let previousContent = renderedContentRef.current

    const resumeFromPersistedContent = Boolean(
      previousContent === content
      && persistedContent
      && content.startsWith(persistedContent)
      && content.length > persistedContent.length,
    )
    if (resumeFromPersistedContent) {
      previousContent = persistedContent
    }

    if (!fadeEnabled) {
      setSegments(current => current.length === 1 && !current[0]?.fading && current[0].content === content
        ? current
        : content
          ? [{ id: nextSegmentIdRef.current++, content, fading: false }]
          : [])
    }
    else if (content !== previousContent) {
      if (previousContent && content.startsWith(previousContent)) {
        const appendedContent = content.slice(previousContent.length)
        setSegments((current) => {
          if (resumeFromPersistedContent) {
            return [
              { id: nextSegmentIdRef.current++, content: previousContent, fading: false },
              { id: nextSegmentIdRef.current++, content: appendedContent, fading: true },
            ]
          }
          const lastSegment = current[current.length - 1]
          if (lastSegment?.fading) {
            return [
              ...current.slice(0, -1),
              { ...lastSegment, content: lastSegment.content + appendedContent },
            ]
          }
          return [
            ...current,
            { id: nextSegmentIdRef.current++, content: appendedContent, fading: true },
          ]
        })
      }
      else {
        setSegments(content
          ? [{ id: nextSegmentIdRef.current++, content, fading: false }]
          : [])
      }
    }
    else if (streamRenderVersionChanged) {
      setSegments(current => current.some(segment => segment.fading)
        ? settleAndMergeSegments(current)
        : current)
    }

    renderedContentRef.current = content
    lastStreamRenderVersionRef.current = streamRenderVersion
    if (streamStateKey)
      textStreamState?.set(streamStateKey, content)
  }, [children, content, streamStateRef, ctx?.textStreamState, ctx?.streamRenderVersion, streamStateKey, fadeEnabled])

  const settleSegment = (segmentId: number) => {
    setSegments(current => current.some(segment => segment.id === segmentId && segment.fading)
      ? settleAndMergeSegments(current, segmentId)
      : current)
  }

  if (children != null) {
    return (
      <span
        className={clsx(
          'text-node whitespace-pre-wrap break-words',
          node.center && 'text-node-center',
        )}
      >
        {children}
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'text-node whitespace-pre-wrap break-words',
        node.center && 'text-node-center',
      )}
    >
      {segments.map(segment => (
        <span
          key={segment.id}
          className={segment.fading
            ? clsx(
                'text-node-stream-delta',
                segment.id % 2 === 0
                  ? 'text-node-stream-delta--a'
                  : 'text-node-stream-delta--b',
              )
            : undefined}
          onAnimationEnd={segment.fading ? () => settleSegment(segment.id) : undefined}
        >
          {segment.content}
        </span>
      ))}
    </span>
  )
}

export default TextNode
