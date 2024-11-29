// https://stackoverflow.com/questions/39040108/import-class-in-definition-file-d-ts
type $FolderImport = import('./folder-import').$FolderImport
declare var FolderImport: $FolderImport // eslint-disable-line no-var
declare const Zotero: { FolderImport: $FolderImport } & Omit<Record<string, any>, 'FolderImport'>
declare const AddonManager: any
declare const Components: any
declare const Services: any
declare const Localization: any
declare const rootURI: string
