const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const dir = path.resolve(__dirname, '..', 'dist', 'types')
if (fs.existsSync(dir)) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
    console.log('Removed', dir)
  }
  catch (e) {
    console.error('Failed to remove', dir, e)
    process.exit(1)
  }
}
else {
  // nothing to do
}

// Append any standalone props types into the final dist/index.d.ts
// This ensures named prop interfaces are available to consumers
const bundledDts = path.resolve(__dirname, '..', 'dist', 'index.d.ts')
const propsDtsCandidates = [
  path.resolve(__dirname, '..', 'dist', 'types', 'types', 'props-export.d.ts'),
  path.resolve(__dirname, '..', 'dist', 'types', 'types', 'component-props.d.ts'),
]

for (const candidate of propsDtsCandidates) {
  if (fs.existsSync(candidate) && fs.existsSync(bundledDts)) {
    try {
      const content = fs.readFileSync(candidate, 'utf8')
      // Only append if the candidate provides exports not already present
      const candidateFirstExport = /export\s+interface\s+(\w+)/.exec(content)
      const already = candidateFirstExport && new RegExp(`interface\s+${candidateFirstExport[1]}`).test(fs.readFileSync(bundledDts, 'utf8'))
      if (!already) {
        fs.appendFileSync(bundledDts, `\n\n// Appended props types from ${path.relative(path.resolve(__dirname, '..'), candidate)}\n${content}`)
        console.log('Appended types from', candidate, 'to', bundledDts)
      }
    }
    catch (e) {
      console.error('Failed to append types from', candidate, e)
      // non-fatal
    }
  }
}
