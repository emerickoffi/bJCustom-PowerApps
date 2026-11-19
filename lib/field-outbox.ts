'use client'

import type { OutboxItem } from '@/lib/field-outbox-shared'

/**
 * Device storage for the field outbox (IndexedDB). Items belong to one user and company; every read filters by
 * both so another account on a shared tablet never sees or sends someone else's work.
 */

const DB_NAME = 'trefort-field-outbox'
const DB_VERSION = 1
const STORE = 'items'
const CHANNEL = 'trefort-field-outbox'
/** Lets the offline page show this person's queue without a server session. */
const IDENTITY_KEY = 'trefort-outbox-identity'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Device storage is unavailable'))
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('userId', 'userId')
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

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req ? req.result : (undefined as T))
        tx.onerror = () => reject(tx.error ?? new Error('Device storage write failed'))
        tx.onabort = () => reject(tx.error ?? new Error('Device storage write was aborted'))
      }),
  )
}

const listeners = new Set<() => void>()
let channel: BroadcastChannel | null = null
function notify() {
  for (const l of listeners) l()
  channel?.postMessage('changed')
}

/** Calls back whenever the queue changes in this tab or another one. */
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener)
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = () => {
      for (const l of listeners) l()
    }
  }
  return () => listeners.delete(listener)
}

export async function listOutbox(userId: string, orgId: string): Promise<OutboxItem[]> {
  const all = await run<OutboxItem[]>('readonly', (s) => s.index('userId').getAll(userId))
  return all.filter((i) => i.orgId === orgId)
}

export async function getOutboxItem(id: string, userId: string): Promise<OutboxItem | null> {
  const item = await run<OutboxItem | undefined>('readonly', (s) => s.get(id))
  return item && item.userId === userId ? item : null
}

export const putOutboxItem = (item: OutboxItem) =>
  run('readwrite', (s) => s.put(item)).then(() => {
    notify()
  })

export const deleteOutboxItem = (id: string) =>
  run('readwrite', (s) => s.delete(id)).then(() => {
    notify()
  })

export function rememberOutboxIdentity(identity: { userId: string; orgId: string }) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  } catch {
    // Private mode or storage disabled: the offline page simply shows no queue.
  }
}

export function lastOutboxIdentity(): { userId: string; orgId: string } | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    const v = raw ? (JSON.parse(raw) as { userId?: unknown; orgId?: unknown }) : null
    return v && typeof v.userId === 'string' && typeof v.orgId === 'string' ? { userId: v.userId, orgId: v.orgId } : null
  } catch {
    return null
  }
}

export function forgetOutboxIdentity() {
  try {
    localStorage.removeItem(IDENTITY_KEY)
  } catch {
    // Nothing stored.
  }
}
