declare var Zotero: any // eslint-disable-line no-var
declare const FileUtils: any
declare const Services: any

declare const Components: any
Components.utils.import('resource://gre/modules/FileUtils.jsm')

declare const ChromeUtils: any

import { FilePickerHelper, ZoteroToolkit } from 'zotero-plugin-toolkit'
const ztoolkit = new ZoteroToolkit()

import { DebugLog as DebugLogSender } from 'zotero-plugin/debug-log'
import { log } from './debug'

declare const OS: {
  Path: {
    basename: (path: string) => string
    join: (path: string, name: string) => string
  }
  File: {
    DirectoryIterator: (path: string) => void // Iterable<DirectoryEntry>
    remove: (path: string) => Promise<void>
    exists: (path: string) => Promise<boolean>
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class FolderScanner {
  files: string[] = []
  folders: FolderScanner[] = []
  extensions: Set<string> = new Set()

  name: string

  constructor(public path: string, isRoot: boolean) {
    log.info(`scanning ${path}`)
    this.path = path
    this.name = isRoot ? '' : PathUtils.filename(path)
  }

  public async scan() {
    for (const entry of (await IOUtils.getChildren(this.path))) {
      const info = await IOUtils.stat(entry)
      if (info.type === 'directory') {
        this.folders.push(new FolderScanner(entry, false))
      }
      else {
        log.info(`${this.path}: file ${JSON.stringify(entry)}`)
        this.files.push(entry)
        const ext = this.extension(entry)
        if (ext && ext !== 'lnk') this.extensions.add(ext)
      }
    }

    await Promise.all(this.folders.map(dir => dir.scan()))
    for (const dir of this.folders) {
      this.extensions = new Set([...this.extensions, ...dir.extensions])
    }
    log.info(`scanned ${this.path}: ${JSON.stringify(Array.from(this.extensions))}`)
  }

  public selected(extensions) {
    let selected = this.files.filter(f => extensions.has(this.extension(f))).length
    for (const folder of this.folders) {
      selected += folder.selected(extensions)
    }
    return selected
  }

  public async import(params, collection, pdfs, duplicates: Set<string>) {
    // don't do anything if no selected extensions exist in this folder
    if (![...this.extensions].find(ext => params.extensions.has(ext))) return

    log.info(`importing path ${this.path}`)

    if (this.name) {
      const existing = (collection ? collection.getChildCollections() : Zotero.Collections.getByLibrary(params.libraryID)).find(child => child.name === this.name)

      if (existing) {
        log.info(`${this.name} exists under ${collection ? collection.name : 'the selected library'}`)
        collection = existing
      }
      else {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands, prefer-template
        log.info(`${this.name} does not exist, creating${collection ? ' under ' + collection.name : ''}`)
        const parentKey = collection ? collection.key : undefined
        collection = new Zotero.Collection()
        collection.libraryID = params.libraryID
        collection.name = this.name
        collection.parentKey = parentKey
        await collection.saveTx()
        log.info(`${this.name} created`)
        await sleep(10) // eslint-disable-line @typescript-eslint/no-magic-numbers
        log.info(`${this.name} loaded`)
      }
    }
    if (collection) await collection.loadAllData()

    for (const file of this.files.sort()) {
      if (!params.extensions.has(this.extension(file))) {
        log.info(`not importing ${file} with extension ${this.extension(file)}`)
        continue
      }
      if (duplicates.has(file)) {
        log.info(`not importing duplicate ${file}`)
        continue
      }

      try {
        if (params.link) {
          log.info(`linking ${file} into ${collection ? collection.name : '<root>'}`)
          const item = await Zotero.Attachments.linkFromFile({
            file,
            parentItemID: false,
            collections: collection ? [collection.id] : undefined,
          })
          if (file.toLowerCase().endsWith('.pdf')) pdfs.push(item)
        }
        else if (file.endsWith('.lnk')) {
          log.info(`not importing ${file} with extension ${this.extension(file)}`)
        }
        else {
          log.info(`importing ${file} into ${collection ? collection.name : '<root>'}`)
          const item = await Zotero.Attachments.importFromFile({
            file,
            libraryID: params.libraryID,
            collections: collection ? [collection.id] : undefined,
          })
          if (file.toLowerCase().endsWith('.pdf')) pdfs.push(item)
        }
      }
      catch (err) {
        log.error(err)
      }

      await sleep(10) // eslint-disable-line @typescript-eslint/no-magic-numbers
      params.progress.update()
    }

    for (const folder of this.folders) {
      await folder.import(params, collection, pdfs, duplicates)
    }
  }

  private extension(path: string): false | string {
    const name: string = PathUtils.filename(path)
    if (name[0] === '.') return false
    const parts: string[] = name.split('.')
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : false
  }
}

export class $FolderImport {
  private status: { total: number; done: number }

  public async startup() {
    await Zotero.initializationPromise
    DebugLogSender.register('Folder import', [])
    for (const win of Zotero.getMainWindows()) {
      if (win.ZoteroPane) this.onMainWindowLoad(win)
    }
  }

  public async shutdown() {
    for (const win of Zotero.getMainWindows()) {
      if (win.ZoteroPane) this.onMainWindowUnload(win)
    }
  }

  public onMainWindowLoad(win: Window) {
    log.debug('onMainWindowLoad')

    ztoolkit.Menu.register('menuFile', {
      tag: 'menuitem',
      label: 'Add Files from Folder…',
      oncommand: 'Zotero.FolderImport.addAttachmentsFromFolder()',
    })
  }

  public onMainWindowUnload(win: Window) {
    ztoolkit.Menu.unregisterAll()
  }

  public update() {
    this.status.done += 1
    const total = `${this.status.total}`
    const done = `${this.status.done}`.padStart(total.length)
    const msg = `Imported ${done}/${total}...`
    log.debug(msg)
    // const label = Zotero.getActiveZoteroPane().document.getElementById('zotero-pane-progress-label')
    // if (label) label.value = msg
    Zotero.updateZoteroPaneProgressMeter(Math.min((this.status.done * 100) / this.status.total, 100)) // eslint-disable-line @typescript-eslint/no-magic-numbers
  }

  private async duplicates(path: string): Promise<string[]> {
    const rmlint: string = Zotero.Prefs.get('extensions.folder-import.rmlint')
    if (!rmlint) return []
    if (!await IOUtils.exists(rmlint)) return []

    const duplicates: string = PathUtils.join(Zotero.getTempDirectory().path as string, `rmlint${Zotero.Utilities.randomString()}.json`)

    try {
      const cmd = new FileUtils.File(rmlint)
      if (!cmd.isExecutable()) return []

      const proc = Components.classes['@mozilla.org/process/util;1'].createInstance(Components.interfaces.nsIProcess)
      proc.init(cmd)
      proc.startHidden = true
      const args = ['-o', `json:${duplicates}`, '-T', 'df', Zotero.getStorageDirectory(), path]
      await new Promise((resolve, reject) => {
        proc.runwAsync(args, args.length, {
          observe: (subject, topic) => {
            if (topic !== 'process-finished') {
              reject(new Error(`failed: ${rmlint} ${args}`))
            }
            else if (proc.exitValue > 0) {
              reject(new Error(`failed with exit status ${proc.exitValue}: ${rmlint} ${args}`))
            }
            else {
              resolve(true)
            }
          },
        })
      })

      return JSON.parse(Zotero.File.getContents(duplicates) as string)
        .filter((d: any) => d.type === 'duplicate_file')
        .map((d: any) => d.path as string) as string[]
    }
    catch (err) {
      log.debug(`duplicates: ${err}`)
      return []
    }
    finally {
      try {
        await IOUtils.remove(duplicates)
      }
      catch (err) {
      }
    }
  }

  public async addAttachmentsFromFolder() {
    log.debug('addAttachmentsFromFolder')
    await Zotero.Schema.schemaUpdatePromise
    const zoteroPane = Zotero.getActiveZoteroPane()

    if (!zoteroPane.canEdit()) {
      zoteroPane.displayCannotEditLibraryMessage()
      return
    }
    if (!zoteroPane.canEditFiles()) {
      zoteroPane.displayCannotEditLibraryFilesMessage()
      return
    }
    const collection = zoteroPane.getSelectedCollection()
    if (!collection) {
      Services.prompt.alert(null, 'No collection selected', 'A collection must be selected to import into')
      return
    }

    log.debug('opening file picker')
    const folder = await (new FilePickerHelper(`${Zotero.getString('fileInterface.import')} Folder`, 'folder')).open()
    if (!folder) return

    Zotero.showZoteroPaneProgressMeter('Scanning for attachments...')
    const root = new FolderScanner(folder, true)
    await root.scan()
    Zotero.hideZoteroPaneOverlays()

    // Zotero.Translators.getAllForType('import')

    log.debug(`scan complete: ${JSON.stringify(Array.from(root.extensions))} (${root.extensions.size})`)
    if (root.extensions.size) {
      const collectionTreeRow = zoteroPane.getCollectionTreeRow()
      const params = {
        link: !collectionTreeRow.isWithinGroup() && !collectionTreeRow.isPublications(),
        extensions: root.extensions,
        libraryID: collectionTreeRow.ref.libraryID,
        progress: this,
      } // TODO: warn for .lnk files when params.link === false

      log.debug('opening selector')
      const defaults = {
        selected: [...root.extensions].sort().join(', '),
        link: !!params.link,
      }

      /*
      const window = Zotero.getMainWindow()
      window.openDialog('chrome://zotero-folder-import/content/wizard.xhtml', '', 'chrome,dialog,centerscreen,modal', {
        extensions: [...root.extensions],
        defaults: {
          pdf: 'attach',
          bib: 'import',
        },
      })
      */

      do {
        const selected = { value: defaults.selected }
        const link = { value: defaults.link }
        if (!Services.prompt.prompt(null, 'File extensions', 'File extensions to import', selected, 'Link instead of import', link)) return
        log.debug({ selected, link })
        params.extensions = new Set(selected.value.split(',').map(_ => _.trim()).filter(_ => _))
        params.link = link.value
      }
      while ([...params.extensions].find(ext => !root.extensions.has(ext)))
      log.debug('selected:', Array.from(params.extensions))

      if (params.extensions.size) {
        const pdfs = []
        Zotero.showZoteroPaneProgressMeter('Importing attachments...', true)
        this.status = { total: root.selected(params.extensions), done: 0 }
        await root.import(params, zoteroPane.getSelectedCollection(), pdfs, new Set(await this.duplicates(folder)))
        Zotero.hideZoteroPaneOverlays()
        if (pdfs.length) {
          Zotero.showZoteroPaneProgressMeter('Fetching metadata for attachments...')
          Zotero.RecognizeDocument.autoRecognizeItems(pdfs)
          Zotero.hideZoteroPaneOverlays()
        }
      }
    }
  }
}

export var FolderImport = Zotero.FolderImport = new $FolderImport()
