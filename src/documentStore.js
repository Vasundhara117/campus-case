const DATABASE_NAME = 'campus-case-documents'
const STORE_NAME = 'documents'
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Unable to open document storage.'))
  })
}

async function withStore(mode, action) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = action(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Document storage operation failed.'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error || new Error('Document storage transaction failed.'))
  })
}

export function validateDocument(file) {
  if (!ALLOWED_EXTENSIONS.test(file.name) || !ALLOWED_TYPES.has(file.type)) {
    return `${file.name} is not supported. Choose a PDF, JPG, JPEG, or PNG file.`
  }
  return ''
}

export async function saveDocument(file) {
  const invalid = validateDocument(file)
  if (invalid) throw new Error(invalid)
  const id = crypto.randomUUID()
  const uploadedAt = new Date().toISOString()
  await withStore('readwrite', (store) => store.add({
    id,
    file,
    caseIds: [],
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    uploadedAt,
  }))
  return {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    uploadedAt,
    storageRef: id,
  }
}

export async function addDocumentCaseReference(storageRef, caseId) {
  const record = await withStore('readonly', (store) => store.get(storageRef))
  if (!record) throw new Error(`The uploaded file "${storageRef}" is no longer available.`)
  if (record.caseIds.includes(caseId)) return
  record.caseIds.push(caseId)
  await withStore('readwrite', (store) => store.put(record))
}

export async function loadDocument(storageRef) {
  const record = await withStore('readonly', (store) => store.get(storageRef))
  if (!record?.file) throw new Error('This document is no longer available in local storage.')
  return record.file
}
