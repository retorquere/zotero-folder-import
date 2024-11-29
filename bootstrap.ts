import { debug } from './content/debug'

export function install() {
  debug('installed')
}
export function uninstall() {
  debug('uninstalled')
}

let chromeHandle
export async function startup({ id, version, rootURI }) {
  debug('startup', id, version)

  const aomStartup = Components.classes['@mozilla.org/addons/addon-manager-startup;1'].getService(Components.interfaces.amIAddonManagerStartup)
  const manifestURI = Services.io.newURI(`${rootURI}manifest.json`)
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ['content', 'zotero-folder-import', 'content/'],
    ['locale', 'zotero-folder-import', 'en-US', 'locale/en-US/'],
  ])

  Services.scriptloader.loadSubScript(rootURI + 'folder-import.js', { rootURI, Zotero })
  await Zotero.FolderImport.startup()
}

export async function shutdown() {
  debug('shutdown')
  await Zotero.FolderImport.shutdown()
  if (chromeHandle) {
    chromeHandle.destruct()
    chromeHandle = undefined
  }
  Zotero.FolderImport = null
}

export function onMainWindowLoad({ window }) {
  debug('onMainWindowLoad')
  window.MozXULElement.insertFTLIfNeeded('folder-import.ftl')
  Zotero.FolderImport?.onMainWindowLoad(window)
}

export function onMainWindowUnload({ window }) {
  debug('onMainWindowUnload')
  Zotero.FolderImport?.onMainWindowUnload(window)
}
