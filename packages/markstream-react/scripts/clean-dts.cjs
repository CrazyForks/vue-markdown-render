const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const typesDir = path.resolve(__dirname, '..', 'dist', 'types')

if (fs.existsSync(typesDir)) {
  try {
    fs.rmSync(typesDir, { recursive: true, force: true })
    console.log('Removed', typesDir)
  }
  catch (e) {
    console.error('Failed to remove', typesDir, e)
    process.exit(1)
  }
}
