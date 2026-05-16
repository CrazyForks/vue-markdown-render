# markstream-vue 1.0 Benchmark Report

Generated at: 2026-05-16T02:10:20.243Z

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

| Scenario | Phase | LCP ms | CLS | Settle ms | Frame p95 ms | Max long task ms | DOM nodes | Fallbacks | Heavy blocks | Scroll drift px | Heap after unmount |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| Diagnostic Studio / baseline | markdown initial | 392.0 | 0.0000 | 794.1 | 66.6 | 247.0 | 833 | 0 visible / 1 total | Mermaid 1/1<br>Infographic 1/1<br>D2 0/1 | - | 1.10 MB |
| Diagnostic Studio / baseline | markdown full scroll | - | - | 3629.9 | 50.0 | - | 960 | 0 | Mermaid 1/1<br>Infographic 1/1<br>D2 1/1 | 0.0 | 1.10 MB |
| Diagnostic Studio / baseline | monaco initial | 488.0 | 0.0000 | 993.8 | 75.0 | 273.0 | 651 | 0 visible / 1 total | Mermaid 1/1<br>Infographic 1/1<br>D2 0/1 | - | 1.10 MB |
| Diagnostic Studio / baseline | monaco full scroll | - | - | 3443.4 | 58.3 | - | 1018 | 0 | Mermaid 1/1<br>Infographic 1/1<br>D2 1/1 | 0.0 | 1.10 MB |
| Diagnostic Studio / thinking | markdown initial | 404.0 | 0.0000 | 952.3 | 50.1 | 259.0 | 585 | 0 visible / 1 total | Mermaid 1/1<br>Infographic 0/0<br>D2 0/0 | - | 1.06 MB |
| Diagnostic Studio / thinking | markdown full scroll | - | - | 1351.0 | 50.0 | - | 610 | 0 | Mermaid 1/1<br>Infographic 0/0<br>D2 0/0 | 0.0 | 1.06 MB |
| Diagnostic Studio / thinking | monaco initial | 384.0 | 0.0000 | 825.1 | 58.6 | 250.0 | 524 | 0 visible / 1 total | Mermaid 1/1<br>Infographic 0/0<br>D2 0/0 | - | 1.09 MB |
| Diagnostic Studio / thinking | monaco full scroll | - | - | 1484.4 | 33.4 | - | 668 | 0 | Mermaid 1/1<br>Infographic 0/0<br>D2 0/0 | 0.0 | 1.09 MB |
| Diagnostic Studio / diff | markdown initial | 404.0 | 0.0000 | 1687.4 | 75.0 | 300.0 | 867 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 1.08 MB |
| Diagnostic Studio / diff | markdown full scroll | - | - | 2083.0 | 50.0 | - | 867 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 1.08 MB |
| Diagnostic Studio / diff | monaco initial | 412.0 | 0.0000 | 1468.9 | 82.5 | 263.0 | 808 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 1.08 MB |
| Diagnostic Studio / diff | monaco full scroll | - | - | 2055.3 | 41.2 | - | 866 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 1.08 MB |
| Diagnostic Studio / stress | markdown initial | 432.0 | 0.0000 | 791.5 | 17.6 | 287.0 | 533 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 1.06 MB |
| Diagnostic Studio / stress | markdown full scroll | - | - | 1196.6 | 9.3 | - | 533 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 1.06 MB |
| Diagnostic Studio / stress | monaco initial | 420.0 | 0.0000 | 778.0 | 17.5 | 281.0 | 533 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 1.06 MB |
| Diagnostic Studio / stress | monaco full scroll | - | - | 1171.0 | 16.7 | - | 533 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 1.06 MB |
| Main Playground / reverse-flex chat | initial | 184.0 | 0.0000 | 494.0 | 9.3 | 110.0 | 305 | 0 visible / 0 total | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | - | 994.8 KB |
| Main Playground / reverse-flex chat | full scroll | - | - | 754.5 | 9.3 | - | 317 | 0 | Mermaid 0/0<br>Infographic 0/0<br>D2 0/0 | 0.0 | 994.8 KB |
| Main Playground / reverse-flex chat | stream replay | - | - | 439.5 | 8.9 | - | 317 | - | - | - | 994.8 KB |

## Scenario Notes

- **Diagnostic Studio / baseline**: Runs /test in MarkdownCodeBlock and Monaco modes, then scrolls the preview surface.
- **Diagnostic Studio / thinking**: Runs /test in MarkdownCodeBlock and Monaco modes, then scrolls the preview surface.
- **Diagnostic Studio / diff**: Runs /test in MarkdownCodeBlock and Monaco modes, then scrolls the preview surface.
- **Diagnostic Studio / stress**: Runs /test in MarkdownCodeBlock and Monaco modes, then scrolls the preview surface.
- **Main Playground / reverse-flex chat**: Runs the main AI chat playground, full-scrolls the reverse-flex viewport, and replays streaming.

This report records measured release evidence from the shipped playgrounds. Keep benchmark claims tied to this environment disclosure and rerun before publishing 1.0.
