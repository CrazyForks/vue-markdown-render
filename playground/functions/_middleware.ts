const noindexPaths = new Set([
  '/markdown',
  '/test',
  '/cdn-peers',
  '/mermaid-export-demo',
  '/diff-theme-regression',
  '/diff-line-info-regression',
  '/test-sandbox',
  '/example',
  '/height-estimation-experiment',
  '/virtual-scroll',
  '/virtual-scroller-markstream',
  '/virtual-timeline-zero',
])

interface PagesContext {
  request: Request
  next: () => Promise<Response>
}

export async function onRequest(context: PagesContext) {
  const response = await context.next()
  const path = new URL(context.request.url).pathname.replace(/\/+$/, '') || '/'

  if (!noindexPaths.has(path))
    return response

  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', 'noindex, nofollow')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
