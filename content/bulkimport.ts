declare var Zotero: any // eslint-disable-line no-var

type XULElement = HTMLElement & {
  selectedItem?: HTMLElement
  columns?: any
  view?: any
}
let ui: Record<string, XULElement> = {}
let extensions: string[]

let params: {
  extensions: Set<string>
  link: boolean
  libraryID: number
  progress: any
}

const xul = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul'

function onLoad() { // eslint-disable-line @typescript-eslint/no-unused-vars
  params = (window as any).arguments[0]
  ui = {
    extensions: document.getElementById('folder-import-extensions'),
    mode: document.getElementById('folder-import-link-or-import'),
    link: document.getElementById('folder-import-link'),
  }

  const rows = document.getElementById('folder-import-extensions-rows')

  extensions = Array.from(params.extensions).sort().filter((ext: string) => ext !== 'lnk')
  const defaults = [ 'pdf', 'docx', 'html', 'odt' ].filter(ext => extensions.includes(ext))
  extensions = defaults.concat(extensions.filter(ext => !defaults.includes(ext)))

  for (const ext of extensions) {
    const ti = rows.appendChild(document.createElementNS(xul, 'treeitem'))
    const tr = ti.appendChild(document.createElementNS(xul, 'treerow'))
    tr.appendChild(document.createElementNS(xul, 'treecell')).setAttribute('value', defaults.includes(ext) ? 'true' : 'false')
    tr.appendChild(document.createElementNS(xul, 'treecell')).setAttribute('label', ext)
  }

  ui.mode.selectedItem = document.getElementById('folder-import-import')
  if (!params.link) ui.mode.setAttribute('disabled', 'true')
}

function onCancel() { // eslint-disable-line @typescript-eslint/no-unused-vars
  params.extensions = new Set
  return true
}

function onAccept() { // eslint-disable-line @typescript-eslint/no-unused-vars
  params.link = ui.mode && ui.mode.selectedItem === ui.link
  params.extensions = new Set
  for (let i = 0; i < ui.extensions.view.rowCount; i++) {
    const checked = ui.extensions.view.getCellValue(i, ui.extensions.columns.getColumnAt(0)) === 'true'
    const ext = extensions[i]
    Zotero.debug(`selected: ${JSON.stringify({ checked, ext })}`)
    if (checked) params.extensions.add(ext)
  }
  return true
}
