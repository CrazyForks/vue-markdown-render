// Simple global Markdown instance registry for the app/tests.
// Consumers can call `setGlobalMarkdown(md)` to provide a MarkdownIt
// instance that `NodeRenderer` and other components will prefer.

let _globalMarkdown: any = null

export function setGlobalMarkdown(md: any) {
  _globalMarkdown = md
}

export function getGlobalMarkdown(): any {
  return _globalMarkdown
}

export function clearGlobalMarkdown() {
  _globalMarkdown = null
}
