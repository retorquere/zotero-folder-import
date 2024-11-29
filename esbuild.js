const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')
const rmrf = require('rimraf')

rmrf.sync('gen')

require('zotero-plugin/copy-assets')
require('zotero-plugin/rdf')
require('zotero-plugin/version')

async function bundle(entry) {
  const outdir = 'build'
  const config = {
    entryPoints: [ entry ],
    outdir,
    bundle: true,
    format: 'iife',
    target: ['firefox60'],
    treeShaking: true,
    minify: false,
    drop: ['console'],
    external: [ 'zotero/itemTree' ]
  }

  const target = path.join(outdir, path.basename(entry).replace(/[.]ts$/, '.js'))
  const esm = await esbuild.build({ ...config, logLevel: 'silent', format: 'esm', metafile: true, write: false })
  const postfix = `$$${Date.now()}`
  for (const output of Object.values(esm.metafile.outputs)) {
    if (output.entryPoint) {
      config.globalName = `${escape(`{ ${output.exports.join(', ')} }`).replace(/%/g, '$')}${postfix}`
      console.log(config.globalName)
    }
  }

  await esbuild.build(config)

  await fs.promises.writeFile(
    target,
    (await fs.promises.readFile(target, 'utf-8')).replace(config.globalName, unescape(config.globalName.replace(postfix, '').replace(/[$]/g, '%')))
  )
}

async function build() {
  await bundle('bootstrap.ts')
  await bundle('content/folder-import.ts')
}

build().catch(err => {
  console.log(err)
  process.exit(1)
})
