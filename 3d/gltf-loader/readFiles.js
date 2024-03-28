/**
 * @param {FileSystemFileEntry} entry 
 */
export const readFileEntry = (entry) => new Promise((res, rej) => entry.file((file) => {
  res({ file, name: entry.name, fullPath: entry.fullPath })
}, rej))

/**
 * @param {FileSystemDirectoryEntry} entry 
 */
export const readDirectoryEntries = (entry) => {
  const directoryReader = entry.createReader()
  return new Promise((res, rej) => directoryReader.readEntries(res, rej))
}

/**
 * @param {FileSystemEntry} entry 
 * @param {Promise<{file: File; name: string; fullPath: string}>[]} ls 
 */
export const scanFileEntries = async (entry, ls = []) => {
  if (!entry) return ls
  if (!entry.isDirectory) {
    ls.push(readFileEntry(entry))
    return ls
  }
  const subEntries = await readDirectoryEntries(entry)
  await Promise.all(subEntries.map(e => scanFileEntries(e, ls)))
  return ls
}

/**
 * @param {DataTransferItemList} items 
 */
export const parseDataTransferItems = async (items) => {
  const ls = []
  const { length } = items
  for (let i = 0; i < length; i++) {
    const itemEntry = items[i].webkitGetAsEntry()
    ls.push(scanFileEntries(itemEntry))
  }
  return (await Promise.all(ls)).flat()
}