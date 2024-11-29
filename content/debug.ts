function replacer() {
  const seen = new WeakSet()
  return (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
    }
    if (value === null) return value
    if (value instanceof Set) return [...value]
    if (value instanceof Map) return Object.fromEntries(value)
    switch (typeof value) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'object':
        return value
    }
    if (Array.isArray(value)) return value
    return undefined
  }
}

function to_s(obj: any): string {
  switch (typeof obj) {
    case 'string':
      return obj
    case 'number':
    case 'boolean':
      return `${obj}`
  }
  return JSON.stringify(obj, replacer(), 2)
}

export function debug(...msg): void {
  Zotero.debug(`FolderImport: ${msg.map(to_s).join(' ')}`)
}
