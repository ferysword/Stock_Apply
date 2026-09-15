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
const managerDb = (uid = 'gest', email = `${uid}@club.fr`) => env.authenticatedContext(uid, { email }).firestore()

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

test('un bénévole qui quitte note son départ, sans toucher aux autres ni prolonger son accès', async () => {
  await join(volunteerDb('autre'), 'autre')
  const db = volunteerDb()
  await join(db, 'vol')
  const leave = { leftAt: serverTimestamp(), expiresAt: serverTimestamp() }
  await assertFails(updateDoc(doc(db, 'devices/autre'), leave))
  await assertFails(updateDoc(doc(db, 'devices/vol'), { leftAt: serverTimestamp(), expiresAt: hoursFromNow(10) }))
  await assertFails(updateDoc(doc(db, 'devices/vol'), { ...leave, firstName: 'Autre' }))
  await assertFails(deleteDoc(doc(db, 'devices/vol')))
  await assertSucceeds(updateDoc(doc(db, 'devices/vol'), leave))
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

const inviteData = (createdBy = 'admin', expiresAt = hoursFromNow(48)) => ({
  role: 'manager',
  createdBy,
  createdAt: serverTimestamp(),
  expiresAt,
})

async function createInvite(token = 'jeton', expiresAt) {
  await assertSucceeds(setDoc(doc(adminDb(), 'invites', token), inviteData('admin', expiresAt)))
}

function acceptInvite(uid, token = 'jeton') {
  const db = managerDb(uid)
  const batch = writeBatch(db)
  batch.set(doc(db, 'managers', uid), { name: 'Paul Durand', email: `${uid}@club.fr`, invite: token, createdAt: serverTimestamp() })
  batch.update(doc(db, 'invites', token), { usedBy: uid, usedAt: serverTimestamp() })
  return batch.commit()
}

test('invitation : le gestionnaire gère les produits et vend, sans accès au reste', async () => {
  await createInvite()
  const db = managerDb('gest')
  await assertSucceeds(getDoc(doc(db, 'invites/jeton')))
  await assertSucceeds(acceptInvite('gest'))
  await assertSucceeds(updateDoc(doc(db, 'products/p1'), { stock: increment(24) }))
  await assertSucceeds(setDoc(doc(db, 'products/p2'), { name: 'Bière', price: 300, stock: 5, threshold: 1, order: 2, active: true, image: '' }))
  await assertSucceeds(sell(db, 'gest'))
  assert.equal(await stock(), 32)

  await assertFails(deleteDoc(doc(db, 'products/p1')))
  await assertFails(getDocs(collection(db, 'sales')))
  await assertFails(getDocs(collection(db, 'closures')))
  await assertFails(getDoc(doc(db, 'private/access')))
  await assertFails(getDocs(collection(db, 'devices')))
  await assertFails(getDocs(collection(db, 'invites')))
  await assertFails(getDocs(collection(db, 'managers')))
  await assertFails(setDoc(doc(db, 'invites/autre'), inviteData('gest')))
  await assertFails(setDoc(doc(db, 'admins/gest'), { email: 'gest@club.fr' }))

  // L'admin voit l'équipe et peut retirer l'accès
  await assertSucceeds(getDocs(collection(adminDb(), 'managers')))
  await assertSucceeds(getDocs(collection(adminDb(), 'invites')))
  await assertSucceeds(deleteDoc(doc(adminDb(), 'managers/gest')))
  await assertFails(updateDoc(doc(db, 'products/p1'), { stock: increment(1) }))
})

test('invitation à usage unique, avant expiration, et impossible à contourner', async () => {
  await createInvite()
  await assertSucceeds(acceptInvite('gest'))
  await assertFails(acceptInvite('autre'))

  await createInvite('vieux', hoursFromNow(-1))
  await assertFails(acceptInvite('autre', 'vieux'))
  await assertFails(acceptInvite('autre', 'inexistant'))

  // Se déclarer gestionnaire sans consommer l'invitation, ou avec un faux e-mail
  await createInvite('neuf')
  const intrus = managerDb('intrus')
  await assertFails(
    setDoc(doc(intrus, 'managers/intrus'), { name: 'Intrus', email: 'intrus@club.fr', invite: 'neuf', createdAt: serverTimestamp() }),
  )
  const batch = writeBatch(intrus)
  batch.set(doc(intrus, 'managers/intrus'), { name: 'Intrus', email: 'admin@club.fr', invite: 'neuf', createdAt: serverTimestamp() })
  batch.update(doc(intrus, 'invites/neuf'), { usedBy: 'intrus', usedAt: serverTimestamp() })
  await assertFails(batch.commit())

  // Ni un bénévole ni une invitation trop longue
  await assertFails(setDoc(doc(volunteerDb(), 'invites/x'), inviteData('vol')))
  await assertFails(setDoc(doc(adminDb(), 'invites/long'), inviteData('admin', hoursFromNow(100))))
})

test("personne ne peut se déclarer admin", async () => {
  await assertFails(setDoc(doc(volunteerDb('intrus'), 'admins/intrus'), { email: 'x' }))
})
