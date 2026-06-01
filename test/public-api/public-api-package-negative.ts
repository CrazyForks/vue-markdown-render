// @ts-expect-error Declared utilities subpath must reject unknown and root-only exports.
import { __missingUtilsExport, VueRendererMarkdown as __unexpectedUtilsRenderer } from 'markstream-vue/utils'

// @ts-expect-error Isolated utility subpaths must not expose renderer/root exports.
import { MarkdownRender as __unexpectedKatexThresholdRenderer } from 'markstream-vue/utils/katex-threshold'

// @ts-expect-error Declared worker subpaths must reject unknown and root-only exports.
import { __missingWorkerExport, MarkdownRender as __unexpectedWorkerRenderer } from 'markstream-vue/workers/katexWorkerClient'

void __missingUtilsExport
void __missingWorkerExport
void __unexpectedKatexThresholdRenderer
void __unexpectedUtilsRenderer
void __unexpectedWorkerRenderer
