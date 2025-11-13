# TODO / Future Optimizations

- Fine-tune virtualization windows (dynamic `maxLiveNodes` per node type, smaller buffers) so the DOM size stays minimal.
- Reuse a fixed pool of vnode containers during virtualization instead of mounting/unmounting slots as you scroll.
- Throttle/debounce hover and pointer events (e.g., `mousemove`) so they never enter the critical input path.
- Offload markdown parsing to a Web Worker and feed the resulting AST back via the `nodes` prop to remove RegExp work from the main thread.
