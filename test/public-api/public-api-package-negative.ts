import type * as MarkstreamUtils from 'markstream-vue/utils'
import type * as KatexThresholdUtils from 'markstream-vue/utils/katex-threshold'
import type * as KatexWorkerClient from 'markstream-vue/workers/katexWorkerClient'

// @ts-expect-error Declared utilities subpath must reject unknown exports.
type MissingUtilsExport = typeof MarkstreamUtils.__missingUtilsExport

// @ts-expect-error Utilities subpath must not expose root-only renderer exports.
type UnexpectedUtilsRenderer = typeof MarkstreamUtils.VueRendererMarkdown

// @ts-expect-error Isolated utility subpaths must not expose renderer/root exports.
type UnexpectedKatexThresholdRenderer = typeof KatexThresholdUtils.MarkdownRender

// @ts-expect-error Declared worker subpaths must reject unknown exports.
type MissingWorkerExport = typeof KatexWorkerClient.__missingWorkerExport

// @ts-expect-error Declared worker subpaths must reject root-only exports.
type UnexpectedWorkerRenderer = typeof KatexWorkerClient.MarkdownRender

void (null as unknown as MissingUtilsExport)
void (null as unknown as MissingWorkerExport)
void (null as unknown as UnexpectedKatexThresholdRenderer)
void (null as unknown as UnexpectedUtilsRenderer)
void (null as unknown as UnexpectedWorkerRenderer)
