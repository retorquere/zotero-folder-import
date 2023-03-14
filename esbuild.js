const path = require('path')
const fs = require('fs')
const esbuild = require('esbuild')
const rmrf = require('rimraf')
rmrf.sync('gen')

require('zotero-plugin/copy-assets')
require('zotero-plugin/rdf')
require('zotero-plugin/version')

async function main() {
  await esbuild.build({
    bundle: true,
    format: 'iife',
    target: ['firefox60'],
    entryPoints: [ 'content/zotero-folder-import.ts' ],
    outdir: 'build/content',
    banner: { js: 'if (!Zotero.DebugLog) {\n' },
    footer: { js: '\n}' },
  })

  await esbuild.build({
    bundle: false,
    target: ['firefox60'],
    entryPoints: [ 'content/bulkimport.ts' ],
    outdir: 'build/content',
  })
}

main().catch(err => {
  console.log(err)
  process.exit(1)
})
