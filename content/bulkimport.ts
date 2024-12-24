type XULElement = HTMLElement & {
  selectedItem?: HTMLElement
  columns?: any
  view?: any
  options?: any
  selected?: string
  value?: string
}
let ui: Record<string, XULElement> = {}
let extensions: string[]

let params: {
  extensions: Set<string>
  link: boolean
  libraryID: number
  progress: any
}

const html = 'http://www.w3.org/1999/xhtml'

export function onLoad() { // eslint-disable-line @typescript-eslint/no-unused-vars
  params = (window as any).arguments[0]
  ui = {
    extensions: document.getElementById('folder-import-extensions'),
    mode: document.getElementById('folder-import-link-or-import'),
    link: document.getElementById('folder-import-link'),
  }

  extensions = Array.from(params.extensions).sort().filter((ext: string) => ext !== 'lnk')
  const defaults = ['pdf', 'docx', 'html', 'odt'].filter(ext => extensions.includes(ext))
  extensions = defaults.concat(extensions.filter(ext => !defaults.includes(ext)))

  for (const ext of extensions) {
    const option = ui.extensions.appendChild(document.createElementNS(html, 'option'))
    option.textContent = ext
    option.setAttribute('value', ext)
    option.setAttribute('class', 'checkbox-multiselect')
    if (defaults.includes(ext)) option.setAttribute('selected', '')
  }

  ui.mode.selectedItem = document.getElementById('folder-import-import')
  if (!params.link) ui.mode.setAttribute('disabled', 'true')
}

export function onCancel() { // eslint-disable-line @typescript-eslint/no-unused-vars
  params.extensions = new Set()
  return true
}

export function onAccept() { // eslint-disable-line @typescript-eslint/no-unused-vars
  params.link = ui.mode && ui.mode.selectedItem === ui.link
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return
  params.extensions = new Set(Array.from(ui.extensions.options).filter((opt: XULElement) => opt.selected).map((opt: XULElement) => opt.value))
  return true
}
