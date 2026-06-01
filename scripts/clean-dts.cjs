const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const distDir = path.resolve(__dirname, '..', 'dist')
const typesDir = path.join(distDir, 'types')

function rewriteTypesEntry(content) {
  return content
    .replace(/from\s+(['"])\.\//g, 'from $1./types/')
    .replace(/import\((['"])\.\//g, 'import($1./types/')
}

function referencesTypesDir(content) {
  return /from\s+['"]\.\/types\/|import\(['"]\.\/types\//.test(content)
}

function stripDeclarationComments(content) {
  return content.replace(/\/\*\*[\s\S]*?\*\//g, '')
}

function stripDistDeclarationComments(dir = distDir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      stripDistDeclarationComments(fullPath)
      continue
    }

    if (!entry.name.endsWith('.d.ts'))
      continue

    const content = fs.readFileSync(fullPath, 'utf8')
    const stripped = stripDeclarationComments(content)
    if (stripped !== content)
      fs.writeFileSync(fullPath, stripped)
  }
}

const sourcePath = path.join(typesDir, 'exports.d.ts')
const targetPath = path.join(distDir, 'index.d.ts')

if (fs.existsSync(targetPath)) {
  const bundledContent = fs.readFileSync(targetPath, 'utf8')
  if (!referencesTypesDir(bundledContent)) {
    stripDistDeclarationComments()
    if (fs.existsSync(typesDir))
      fs.rmSync(typesDir, { recursive: true, force: true })
    console.log('Keeping bundled', targetPath)
    process.exit(0)
  }
}

if (fs.existsSync(sourcePath)) {
  const content = rewriteTypesEntry(fs.readFileSync(sourcePath, 'utf8'))
  fs.writeFileSync(targetPath, content)
  stripDistDeclarationComments()
  console.log('Rewrote', targetPath, 'from', sourcePath)
}
