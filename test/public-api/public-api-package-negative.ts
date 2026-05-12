// @ts-expect-error Declared subpaths must still reject unknown exports.
import { __missingUtilsExport } from 'markstream-vue/utils'

// @ts-expect-error Declared worker subpaths must still reject unknown exports.
import { __missingWorkerExport } from 'markstream-vue/workers/katexWorkerClient'

void __missingUtilsExport
void __missingWorkerExport
