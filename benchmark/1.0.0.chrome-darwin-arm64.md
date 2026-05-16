# markstream-vue 1.0 Benchmark Report

Generated at: 2026-05-16T02:33:59.231Z

## Environment

| Field | Value |
| --- | --- |
| markstream-vue | 1.0.0 |
| markstream-core | 1.0.0 |
| stream-markdown-parser | 1.0.0 |
| Node | v23.11.0 |
| OS | Darwin 23.5.0 (darwin arm64) |
| CPU | Apple M1 Pro |
| Memory | 32768.00 MB |
| Browser | Google Chrome 148.0.7778.168 |
| Browser executable | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Viewport | 1600 x 1200 |
| Server mode | Vite production preview after playground build, CI=1 |

## Results

| Scenario | Phase | LCP ms | CLS | Settle ms | Frame interval p95 ms | Max long task ms | DOM nodes | Fallbacks | Heavy blocks readiness | Scroll drift px | Heap after component unmount + GC |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| Diagnostic Studio / baseline | markdown initial | 372.0 | 0.0000 | 785.2 | 66.6 | 237.0 | 833 | 0 visible / 1 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 73.58 MB |
| Diagnostic Studio / baseline | markdown full scroll | - | - | 3586.5 | 42.2 | - | 960 | 0 | Mermaid 1/1<br>Infographic 1/1<br>D2 1/1 | 0.0 | 73.58 MB |
| Diagnostic Studio / baseline | monaco initial | 376.0 | 0.0000 | 855.7 | 66.7 | 238.0 | 758 | 0 visible / 1 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 69.59 MB |
| Diagnostic Studio / baseline | monaco full scroll | - | - | 3454.8 | 50.5 | - | 1018 | 0 | Mermaid 1/1<br>Infographic 1/1<br>D2 1/1 | 0.0 | 69.59 MB |
| Diagnostic Studio / thinking | markdown initial | 400.0 | 0.0000 | 956.6 | 57.4 | 260.0 | 585 | 0 visible / 1 total | Mermaid 1/1<br>Infographic 0/0<br>D2 0/0 | - | 38.82 MB |
| Diagnostic Studio / thinking | markdown full scroll | - | - | 1354.4 | 49.1 | - | 610 | 0 | Mermaid 1/1<br>Infographic 0/0<br>D2 0/0 | 0.0 | 38.82 MB |
| Diagnostic Studio / thinking | monaco initial | 400.0 | 0.0000 | 864.6 | 58.6 | 264.0 | 524 | 0 visible / 1 total | Mermaid 1/1<br>Infographic 0/0<br>D2 0/0 | - | 40.37 MB |
| Diagnostic Studio / thinking | monaco full scroll | - | - | 1491.5 | 41.6 | - | 668 | 0 | Mermaid 1/1<br>Infographic 0/0<br>D2 0/0 | 0.0 | 40.37 MB |
| Diagnostic Studio / diff | markdown initial | 404.0 | 0.0000 | 1370.9 | 58.7 | 261.0 | 867 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 52.04 MB |
| Diagnostic Studio / diff | markdown full scroll | - | - | 1766.2 | 74.0 | - | 867 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 52.04 MB |
| Diagnostic Studio / diff | monaco initial | 408.0 | 0.0000 | 1417.6 | 83.3 | 262.0 | 801 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 49.06 MB |
| Diagnostic Studio / diff | monaco full scroll | - | - | 2006.6 | 41.7 | - | 866 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 49.06 MB |
| Diagnostic Studio / stress | markdown initial | 416.0 | 0.0000 | 766.4 | 16.7 | 273.0 | 533 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 24.44 MB |
| Diagnostic Studio / stress | markdown full scroll | - | - | 1159.8 | 16.6 | - | 533 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 24.44 MB |
| Diagnostic Studio / stress | monaco initial | 416.0 | 0.0000 | 772.5 | 24.4 | 277.0 | 533 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 24.46 MB |
| Diagnostic Studio / stress | monaco full scroll | - | - | 1166.9 | 16.6 | - | 533 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 24.46 MB |
| Main Playground / reverse-flex chat | initial | 200.0 | 0.0000 | 516.3 | 8.9 | 116.0 | 282 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 16.58 MB |
| Main Playground / reverse-flex chat | full scroll | - | - | 773.9 | 9.3 | - | 317 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 16.58 MB |
| Main Playground / reverse-flex chat | stream replay | - | - | 442.7 | 9.3 | - | 317 | - | - | - | 16.58 MB |

## Scenario Notes

- **Diagnostic Studio / baseline**: Runs /test in MarkdownCodeBlock and Monaco modes, then scrolls the preview surface.
- **Diagnostic Studio / thinking**: Runs /test in MarkdownCodeBlock and Monaco modes, then scrolls the preview surface.
- **Diagnostic Studio / diff**: Runs /test in MarkdownCodeBlock and Monaco modes, then scrolls the preview surface.
- **Diagnostic Studio / stress**: Runs /test in MarkdownCodeBlock and Monaco modes, then scrolls the preview surface.
- **Main Playground / reverse-flex chat**: Runs the main AI chat playground, full-scrolls the reverse-flex viewport, and replays streaming.

This report records measured release evidence from the shipped playgrounds. Frame interval is the p95 `requestAnimationFrame` delta, and heap after component unmount is best-effort Chrome-only `performance.memory` after unmount plus GC. Keep benchmark claims tied to this environment disclosure and rerun before publishing 1.0.
