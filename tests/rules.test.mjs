// Tests des règles Firestore (émulateur requis) : npm run test:rules
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

const KEY = 'cle-secrete'
let env

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-buvette',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

after(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'admins/admin'), { email: 'admin@club.fr' })
    await setDoc(doc(db, 'private/access'), { key: KEY })
    await setDoc(doc(db, 'products/p1'), { name: 'Coca', price: 250, stock: 10, threshold: 2, order: 1, active: true, image: '' })
  })
})

const hoursFromNow = (h) => Timestamp.fromMillis(Date.now() + h * 3600_000)
const volunteerDb = (uid = 'vol') => env.authenticatedContext(uid).firestore()
const adminDb = () => env.authenticatedContext('admin').firestore()

async function asRoot(fn) {
  let result
  await env.withSecurityRulesDisabled(async (ctx) => {
    result = await fn(ctx.firestore())
  })
  return result
}

const stock = () => asRoot(async (db) => (await getDoc(doc(db, 'products/p1'))).data().stock)

function join(db, uid, { key = KEY, expiresAt = hoursFromNow(6), shiftName = 'Julie' } = {}) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'devices', uid), {
    key,
    firstName: 'Julie',
    lastName: 'Martin',
    day: '2026-09-14',
    createdAt: serverTimestamp(),
    expiresAt,
  })
  batch.set(doc(collection(db, 'shifts')), {
    uid,
    firstName: shiftName,
    lastName: 'Martin',
    day: '2026-09-14',
    createdAt: serverTimestamp(),
  })
  return batch.commit()
}

function sell(db, uid, { qty = 2, unitPrice = 250, total, decrement, payment = 'cash', withSale = true, withStock = true } = {}) {
  const batch = writeBatch(db)
  const saleRef = doc(collection(db, 'sales'))
  if (withSale) {
    batch.set(saleRef, {
      productId: 'p1',
      productName: 'Coca',
      unitPrice,
      qty,
      total: total ?? qty * unitPrice,
      payment,
      createdAt: serverTimestamp(),
      deviceId: uid,
      volunteerName: 'Julie Martin',
    })
  }
  if (withStock) batch.update(doc(db, 'products/p1'), { stock: increment(-(decrement ?? qty)), lastSaleId: saleRef.id })
  return batch.commit()
}

test('scan avec une clé invalide refusé', async () => {
  await assertFails(join(volunteerDb(), 'vol', { key: 'mauvaise' }))
})

test('scan avec une expiration au-delà de la journée refusé', async () => {
  await assertFails(join(volunteerDb(), 'vol', { expiresAt: hoursFromNow(30) }))
})

test('présence sans enregistrement du téléphone refusée', async () => {
  const db = volunteerDb()
  await assertFails(
    setDoc(doc(db, 'shifts/x'), { uid: 'vol', firstName: 'A', lastName: 'B', day: '2026-09-14', createdAt: serverTimestamp() }),
  )
  await assertFails(join(db, 'vol', { shiftName: 'Autre' }))
})

test('sans scan, aucun accès aux produits', async () => {
  await assertFails(getDocs(collection(volunteerDb(), 'products')))
})

test('scan valide puis ventes avec mise à jour du stock', async () => {
  const db = volunteerDb()
  await assertSucceeds(join(db, 'vol'))
  await assertSucceeds(getDocs(collection(db, 'products')))
  await assertSucceeds(sell(db, 'vol', { qty: 2 }))
  await assertSucceeds(sell(db, 'vol', { qty: 1, payment: 'card' }))
  assert.equal(await stock(), 7)
})

test('un bénévole ne lit ni les ventes, ni la clé, ni les clôtures', async () => {
  const db = volunteerDb()
  await join(db, 'vol')
  await assertFails(getDocs(collection(db, 'sales')))
  await assertFails(getDoc(doc(db, 'private/access')))
  await assertFails(getDocs(collection(db, 'closures')))
  await assertFails(getDocs(collection(db, 'shifts')))
  await assertFails(setDoc(doc(db, 'closures/2026-09-14'), { day: '2026-09-14' }))
})

test('ventes truquées refusées', async () => {
  const db = volunteerDb()
  await join(db, 'vol')
  await assertFails(sell(db, 'vol', { total: 1 }))
  await assertFails(sell(db, 'vol', { unitPrice: 100 }))
  await assertFails(sell(db, 'vol', { decrement: 1 }))
  await assertFails(sell(db, 'vol', { withStock: false }))
  await assertFails(sell(db, 'vol', { withSale: false }))
  await assertFails(sell(db, 'vol', { payment: 'cheque' }))
  await assertFails(sell(db, 'vol', { qty: 0 }))
  await assertFails(updateDoc(doc(db, 'products/p1'), { stock: 100 }))
  await assertFails(updateDoc(doc(db, 'products/p1'), { price: 1 }))
  assert.equal(await stock(), 10)
})

test('accès coupé quand le QR code est régénéré', async () => {
  const db = volunteerDb()
  await join(db, 'vol')
  await asRoot((root) => setDoc(doc(root, 'private/access'), { key: 'nouvelle' }))
  await assertFails(sell(db, 'vol'))
  await assertFails(getDocs(collection(db, 'products')))
})

test('accès coupé à la fin de la journée (4h)', async () => {
  const db = volunteerDb()
  await join(db, 'vol')
  await asRoot((root) => updateDoc(doc(root, 'devices/vol'), { expiresAt: hoursFromNow(-1) }))
  await assertFails(sell(db, 'vol'))
})

test('un bénévole qui quitte retire son téléphone, pas celui des autres', async () => {
  await join(volunteerDb('autre'), 'autre')
  const db = volunteerDb()
  await join(db, 'vol')
  await assertFails(deleteDoc(doc(db, 'devices/autre')))
  await assertSucceeds(deleteDoc(doc(db, 'devices/vol')))
  await assertFails(sell(db, 'vol'))
})

test("l'admin gère produits, ventes, clôtures et accès", async () => {
  const db = adminDb()
  await assertSucceeds(setDoc(doc(db, 'products/p2'), { name: 'Bière', price: 300, stock: 5, threshold: 1, order: 2, active: true, image: '' }))
  await assertSucceeds(updateDoc(doc(db, 'products/p1'), { stock: increment(24) }))
  await assertSucceeds(sell(db, 'admin'))
  await assertSucceeds(getDocs(collection(db, 'sales')))
  await assertSucceeds(getDoc(doc(db, 'private/access')))
  await assertSucceeds(setDoc(doc(db, 'private/access'), { key: 'autre' }))
  await assertSucceeds(setDoc(doc(db, 'closures/2026-09-14'), { day: '2026-09-14' }))
  await assertSucceeds(getDocs(collection(db, 'shifts')))
  assert.equal(await stock(), 32)
})

test("personne ne peut se déclarer admin", async () => {
  await assertFails(setDoc(doc(volunteerDb('intrus'), 'admins/intrus'), { email: 'x' }))
})
