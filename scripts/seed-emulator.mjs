// Remplit les émulateurs locaux avec un admin, des produits et un QR code de démo
// Usage : npm run emulators (dans un terminal) puis npm run seed
const PROJECT = 'demo-buvette'
const AUTH_URL = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1'
const FIRESTORE_URL = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`

const ADMIN = { email: 'admin@buvette.test', password: 'buvette123' }
const ACCESS_KEY = 'demo-qr-key'

const PRODUCTS = [
  { name: 'Coca-Cola 33cl', price: 200, stock: 48, threshold: 12 },
  { name: 'Eau 50cl', price: 100, stock: 36, threshold: 12 },
  { name: 'Bière pression', price: 300, stock: 60, threshold: 15 },
  { name: 'Café', price: 100, stock: 100, threshold: 20 },
  { name: 'Hot-dog', price: 350, stock: 4, threshold: 5 },
  { name: 'Chips', price: 150, stock: 0, threshold: 5 },
]

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: res.ok, data: await res.json() }
}

async function adminUid() {
  const credentials = { ...ADMIN, returnSecureToken: true }
  const signUp = await post(`${AUTH_URL}/accounts:signUp?key=demo-key`, credentials)
  if (signUp.ok) return signUp.data.localId
  const signIn = await post(`${AUTH_URL}/accounts:signInWithPassword?key=demo-key`, credentials)
  if (!signIn.ok) throw new Error(`Création admin impossible : ${JSON.stringify(signIn.data)}`)
  return signIn.data.localId
}

const toValue = (v) =>
  typeof v === 'boolean'
    ? { booleanValue: v }
    : typeof v === 'number'
      ? { integerValue: String(v) }
      : { stringValue: v }

async function put(path, fields) {
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) }
  const res = await fetch(`${FIRESTORE_URL}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} : ${res.status} ${await res.text()}`)
}

try {
  const uid = await adminUid()
  await put(`admins/${uid}`, { email: ADMIN.email })
  await put('private/access', { key: ACCESS_KEY })
  for (const [i, product] of PRODUCTS.entries()) {
    await put(`products/demo-${i + 1}`, { ...product, order: (i + 1) * 10, active: true, image: '' })
  }
  console.log('Émulateurs remplis.')
  console.log(`  Admin     : http://localhost:5173/#/admin/login  (${ADMIN.email} / ${ADMIN.password})`)
  console.log(`  Bénévoles : http://localhost:5173/#/b/${ACCESS_KEY}`)
} catch (err) {
  console.error(err.message)
  console.error('Les émulateurs sont-ils démarrés ? (npm run emulators)')
  process.exit(1)
}
