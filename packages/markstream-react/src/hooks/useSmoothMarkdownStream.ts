import type {
  SmoothMarkdownStreamOptions,
  SmoothMarkdownStreamSnapshot,
} from 'markstream-core'
import { createSmoothMarkdownStream } from 'markstream-core'
import { useEffect, useMemo, useRef, useState } from 'react'

export type { SmoothMarkdownStreamOptions, SmoothMarkdownStreamSnapshot }

export function useSmoothMarkdownStream(options: SmoothMarkdownStreamOptions = {}) {
  const controllerRef = useRef<ReturnType<typeof createSmoothMarkdownStream> | null>(null)

  if (!controllerRef.current)
    controllerRef.current = createSmoothMarkdownStream(options)

  const controller = controllerRef.current

  const [snapshot, setSnapshot] = useState<SmoothMarkdownStreamSnapshot>(() => controller.getSnapshot())

  useEffect(() => {
    const unsubscribe = controller.subscribe(() => {
      setSnapshot(controller.getSnapshot())
    })

    controller.resume()
    setSnapshot(controller.getSnapshot())

    return () => {
      unsubscribe()
      controller.pause()
    }
  }, [controller])

  return useMemo(() => ({
    ...snapshot,
    enqueue: controller.enqueue,
    finish: controller.finish,
    flush: controller.flush,
    reset: controller.reset,
    pause: controller.pause,
    resume: controller.resume,
    getSnapshot: controller.getSnapshot,
  }), [controller, snapshot])
}
