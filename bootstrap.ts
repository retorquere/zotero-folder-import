import { log } from './content/debug'

export function install() {
  log.info('installed')
}
export function uninstall() {
  log.info('uninstalled')
}

let chromeHandle
export async function startup({ id, version, rootURI }) {
  log.info('startup', id, version)

  const aomStartup = Components.classes['@mozilla.org/addons/addon-manager-startup;1'].getService(Components.interfaces.amIAddonManagerStartup)
  const manifestURI = Services.io.newURI(`${rootURI}manifest.json`)
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ['content', 'zotero-folder-import', 'content/'],
    ['locale', 'zotero-folder-import', 'en-US', 'locale/en-US/'],
  ])

  Services.scriptloader.loadSubScript(rootURI + 'folder-import.js', { rootURI, Zotero })
  await Zotero.FolderImport.startup()
  log.info('startup', id, version, 'ready')
}

export async function shutdown() {
  log.info('shutdown')
  await Zotero.FolderImport.shutdown()
  if (chromeHandle) {
    chromeHandle.destruct()
    chromeHandle = undefined
  }
  Zotero.FolderImport = null
}

export function onMainWindowLoad({ window }) {
  log.info('onMainWindowLoad')
  window.MozXULElement.insertFTLIfNeeded('folder-import.ftl')
  Zotero.FolderImport?.onMainWindowLoad(window)
}

export function onMainWindowUnload({ window }) {
  log.info('onMainWindowUnload')
  Zotero.FolderImport?.onMainWindowUnload(window)
}
