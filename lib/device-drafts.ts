'use client'

import type { PendingSave } from '@/lib/save-requests'

/**
 * IndexedDB storage for unsent work on this device. Every record carries the user and organization it
 * belongs to; reads always filter by both so another account on a shared tablet never sees it.
 */

const DB_NAME = 'bativo-device-drafts'
const DB_VERSION = 1
const DRAFTS = 'drafts'
const PHOTOS = 'photos'

export type DeviceDraft = {
  key: string
  userId: string
  orgId: string
  formType: string
  projectId: string | null
  recordId: string | null
  /** Server revision (version or updated_at) the draft was started from. */
  baseRevision: string | null
  entries: [string, string][]
  savedAt: number
  pending?: PendingSave
}

export type PendingPhoto = {
  id: string
  userId: string
  orgId: string
  projectId: string
  logId: string
  storagePath: string
  fileName: string
  mimeType: string
  size: number
  blob: Blob
  stage: 'queued' | 'uploaded'
  error?: string
  createdAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Device storage is unavailable'))
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: 'key' }).createIndex('userId', 'userId')
      if (!db.objectStoreNames.contains(PHOTOS)) {
        const photos = db.createObjectStore(PHOTOS, { keyPath: 'id' })
        photos.createIndex('userId', 'userId')
        photos.createIndex('logId', 'logId')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Device storage is unavailable'))
    req.onblocked = () => reject(new Error('Device storage is busy in another tab'))
  }).catch((e) => {
    dbPromise = null
    throw e
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req ? req.result : (undefined as T))
        tx.onerror = () => reject(tx.error ?? new Error('Device storage write failed'))
        tx.onabort = () => reject(tx.error ?? new Error('Device storage write was aborted'))
      }),
  )
}

export async function getDraft(key: string, userId: string, orgId: string): Promise<DeviceDraft | null> {
  const d = await run<DeviceDraft | undefined>(DRAFTS, 'readonly', (s) => s.get(key))
  return d && d.userId === userId && d.orgId === orgId ? d : null
}

export const putDraft = (draft: DeviceDraft) => run(DRAFTS, 'readwrite', (s) => s.put(draft)).then(() => undefined)
export const deleteDraft = (key: string) => run(DRAFTS, 'readwrite', (s) => s.delete(key)).then(() => undefined)

export async function listUserDrafts(userId: string): Promise<DeviceDraft[]> {
  return run<DeviceDraft[]>(DRAFTS, 'readonly', (s) => s.index('userId').getAll(userId))
}

export async function listPendingPhotos(userId: string, orgId: string, logId: string): Promise<PendingPhoto[]> {
  const all = await run<PendingPhoto[]>(PHOTOS, 'readonly', (s) => s.index('logId').getAll(logId))
  return all.filter((p) => p.userId === userId && p.orgId === orgId).sort((a, b) => a.createdAt - b.createdAt)
}

export async function countUserPhotos(userId: string): Promise<number> {
  return run<number>(PHOTOS, 'readonly', (s) => s.index('userId').count(userId))
}

export const putPendingPhoto = (p: PendingPhoto) => run(PHOTOS, 'readwrite', (s) => s.put(p)).then(() => undefined)
export const deletePendingPhoto = (id: string) => run(PHOTOS, 'readwrite', (s) => s.delete(id)).then(() => undefined)

/** Removes everything this user left on the device (used at sign-out). */
export async function deleteUserDeviceData(userId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([DRAFTS, PHOTOS], 'readwrite')
    for (const name of [DRAFTS, PHOTOS]) {
      const cursorReq = tx.objectStore(name).index('userId').openKeyCursor(IDBKeyRange.only(userId))
      cursorReq.onsuccess = () => {
        const c = cursorReq.result
        if (!c) return
        tx.objectStore(name).delete(c.primaryKey)
        c.continue()
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
