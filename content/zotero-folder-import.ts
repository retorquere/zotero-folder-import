declare const Zotero: any
declare const Components: any
declare const ZoteroPane_Local: any
declare const OS: any

const marker = 'FolderImportMonkeyPatched'

function patch(object, method, patcher) {
  if (object[method][marker]) return
  object[method] = patcher(object[method])
  object[method][marker] = true
}

function debug(msg) {
  Zotero.debug(`folder-import: ${msg}`)
}

class FilePicker { // minimal shim of Zotero FilePicker -- replace with actual picker on merge
  public modeGetFolder: number = Components.interfaces.nsIFilePicker.modeGetFolder

  public returnOK: number = Components.interfaces.nsIFilePicker.returnOK
  public returnCancel: number = Components.interfaces.nsIFilePicker.Cancel

  public file: any = null

  private fp: any

  constructor() {
    this.fp = Components.classes['@mozilla.org/filepicker;1'].createInstance(Components.interfaces.nsIFilePicker)
  }

  public init(parent: Window, title: string, mode: number) {
    this.fp.init(parent, title, mode)
  }

  public async show() {
    return new Zotero.Promise(resolve => {
      this.fp.open(userChoice => {
        switch (userChoice) {
          case Components.interfaces.nsIFilePicker.returnOK:
          case Components.interfaces.nsIFilePicker.returnReplace:
            this.file = this.fp.file
            resolve(Components.interfaces.nsIFilePicker.returnOK)
            break

          default:
            resolve(Components.interfaces.nsIFilePicker.returnCancel)
            break
        }
      })
    })
  }
}

class FolderScanner {
  files: string[] = []
  folders: FolderScanner[] = []
  extensions: Set<string> = new Set

  path: string
  name: string

  constructor(path, isRoot) {
    debug(`scanning ${path}`)
    this.path = path
    this.name = isRoot ? '' : OS.Path.basename(path)
  }

  public async scan() {
    const iterator = new OS.File.DirectoryIterator(this.path)
    await iterator.forEach(entry => {
      debug(`entry: ${JSON.stringify(Object.keys(entry))} ${JSON.stringify(entry)}`)
      if (entry.isDir) {
        debug(`${this.path}: subdir ${JSON.stringify(entry.name)}`)
        this.folders.push(new FolderScanner(OS.Path.join(this.path, entry.name), false))
      } else {
        debug(`${this.path}: file ${JSON.stringify(entry.name)}`)
        debug(OS.Path.join(this.path, entry.name))
        this.files.push(OS.Path.join(this.path, entry.name))
        const ext = this.extension(entry.name)
        if (ext) this.extensions.add(ext.toLowerCase())
      }
    })
    iterator.close()

    await Promise.all(this.folders.map(dir => dir.scan()))
    for (const dir of this.folders) {
      this.extensions = new Set([...this.extensions, ...dir.extensions])
    }
    debug(`scanned ${this.path}: ${JSON.stringify(Array.from(this.extensions))}`)
  }

  public async import(params, collection) {
    // don't do anything if no selected extensions exist in this folder
    if (! [...this.extensions].find(ext => params.extensions.has(ext))) return

    if (this.name) {
      const parentKey = collection ? collection.key : undefined
      collection = new Zotero.Collection
      collection.libraryID = params.libraryID
      collection.name = this.name
      collection.parentKey = parentKey
      await collection.saveTx()
    }

    const pdfs = []
    for (const file of this.files) {
      if (!params.extensions.has(this.extension(file))) continue
      debug(`${this.path}: importing ${file}`)

      try {
        if (params.link) {
          await Zotero.Attachments.linkFromFile({
            file,
            parentItemID: false,
            collections: collection ? [ collection.id ] : undefined,
          })
        } else if (!file.endsWith('.lnk')) {
          const item = await Zotero.Attachments.importFromFile({
            file,
            libraryID: params.libraryID,
            collections: collection ? [ collection.id ] : undefined,
          })
          if (file.toLowerCase().endsWith('.pdf')) pdfs.push(item)
        }
      } catch (err) {
        debug(err)
      }
    }
    if (pdfs.length) Zotero.RecognizePDF.autoRecognizeItems(pdfs)

    for (const folder of this.folders) {
      await folder.import(params, collection)
    }
  }

  private extension(path) {
    const name = OS.Path.basename(path)
    if (name[0] === '.') return false
    const parts = name.split('.')
    return parts.length > 1 ? parts[parts.length - 1] : false
  }
}

const FolderImport = Zotero.FolderImport || new class { // tslint:disable-line:variable-name
  private initialized: boolean = false

  constructor() {
    window.addEventListener('load', event => {
      this.init().catch(err => Zotero.logError(err))
    }, false)
  }

  private async init() {
    if (!document.getElementById('zotero-tb-add-folder')) {
      // temporary hack because I can't overlay without an id
      const toolbarbutton = document.getElementById('zotero-tb-add')
      const menupopup = toolbarbutton.querySelector('menupopup')
      const menuseparators = Array.from(menupopup.querySelectorAll('menuseparator'))
      const menuseparator = menuseparators[menuseparators.length - 1]
      const menuitem = document.createElement('menuitem')
      menuitem.setAttribute('label', 'Add Files from Folder…')
      menuitem.setAttribute('tooltiptext', '')
      menuitem.setAttribute('id', 'zotero-tb-add-folder')
      menuitem.addEventListener('command', this.addAttachmentsFromFolder.bind(this), false)
      menupopup.insertBefore(menuitem, menuseparator)
    }

    if (this.initialized) return
    this.initialized = true
  }

  public async addAttachmentsFromFolder() {
    await Zotero.Schema.schemaUpdatePromise

    if (!ZoteroPane_Local.canEdit()) {
      ZoteroPane_Local.displayCannotEditLibraryMessage()
      return
    }
    if (!ZoteroPane_Local.canEditFiles()) {
      ZoteroPane_Local.displayCannotEditLibraryFilesMessage()
      return
    }

    const fp = new FilePicker()
    fp.init(window, Zotero.getString('pane.item.attachments.select'), fp.modeGetFolder)
    if (await fp.show() !== fp.returnOK) return
    debug(`dir picked: ${fp.file.path}`)

    Zotero.showZoteroPaneProgressMeter('Scanning...')
    const root = new FolderScanner(fp.file.path, true)
    await root.scan()
    Zotero.hideZoteroPaneOverlays()

    debug(`scan complete: ${JSON.stringify(Array.from(root.extensions))} (${root.extensions.size})`)
    if (root.extensions.size) {
      const collectionTreeRow = ZoteroPane_Local.getCollectionTreeRow()
      const params = {
        link: !collectionTreeRow.isWithinGroup() && !collectionTreeRow.isPublications(),
        extensions: root.extensions,
        libraryID: collectionTreeRow.ref.libraryID,
      };
      // TODO: warn for .lnk files when params.link === false
      (window as any).openDialog('chrome://zotero-folder-import/content/import.xul', '', 'chrome,dialog,centerscreen,modal', params)
      if (params.extensions.size) {
        await root.import(params, ZoteroPane_Local.getSelectedCollection())
      }
    }
  }
}

export = FolderImport

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
