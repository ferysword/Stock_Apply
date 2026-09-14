import { Timestamp, collection, doc, getDocs, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { businessDay, dayEnd, dayStart } from './day'
import { withDate } from './useSales'

async function fetchRange(name, start, end) {
  const constraints = [where('createdAt', '<', Timestamp.fromDate(end)), orderBy('createdAt')]
  if (start) constraints.unshift(where('createdAt', '>=', Timestamp.fromDate(start)))
  const snap = await getDocs(query(collection(db, name), ...constraints))
  return snap.docs.map(withDate)
}

const arrival = (v) => v.arrivedAt?.toMillis() ?? Number.MAX_SAFE_INTEGER

export function buildClosure(day, sales, shifts, final) {
  const people = new Map()
  const personFor = (name, arrivedAt = null) => {
    const key = name.trim().toLowerCase()
    if (!people.has(key)) {
      people.set(key, { name, arrivedAt, count: 0, units: 0, card: 0, cash: 0, items: new Map() })
    }
    return people.get(key)
  }

  // Présences (scan du QR code), la première arrivée de la journée fait foi
  for (const shift of [...shifts].sort((a, b) => a.createdAt - b.createdAt)) {
    personFor(`${shift.firstName} ${shift.lastName}`, shift.createdAt)
  }

  const products = new Map()
  const totals = { total: 0, card: 0, cash: 0, count: 0, units: 0 }

  for (const sale of sales) {
    totals.total += sale.total
    totals[sale.payment] += sale.total
    totals.count += 1
    totals.units += sale.qty

    const person = personFor(sale.volunteerName || 'Inconnu')
    person.count += 1
    person.units += sale.qty
    person[sale.payment] += sale.total
    person.items.set(sale.productName, (person.items.get(sale.productName) ?? 0) + sale.qty)

    const product = products.get(sale.productId) ?? { name: sale.productName, qty: 0, card: 0, cash: 0, total: 0 }
    product.qty += sale.qty
    product[sale.payment] += sale.total
    product.total += sale.total
    products.set(sale.productId, product)
  }

  return {
    day,
    final,
    ...totals,
    start: Timestamp.fromDate(dayStart(day)),
    end: Timestamp.fromDate(dayEnd(day)),
    closedAt: serverTimestamp(),
    volunteers: [...people.values()]
      .map(({ items, arrivedAt, ...person }) => ({
        ...person,
        arrivedAt: arrivedAt ? Timestamp.fromDate(arrivedAt) : null,
        items: [...items].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty),
      }))
      .sort((a, b) => arrival(a) - arrival(b)),
    products: [...products.values()].sort((a, b) => b.total - a.total),
  }
}

// Clôture (ou recalcule) une journée. final = false pour une clôture provisoire de la journée en cours
export async function closeDay(day, final = day < businessDay()) {
  const [sales, shifts] = await Promise.all([
    fetchRange('sales', dayStart(day), dayEnd(day)),
    fetchRange('shifts', dayStart(day), dayEnd(day)),
  ])
  const batch = writeBatch(db)
  batch.set(doc(db, 'closures', day), buildClosure(day, sales, shifts, final))
  await batch.commit()
}

// Clôture automatiquement toutes les journées terminées (4h passées) qui ne l'ont pas encore été
export async function finalizePastDays(closures) {
  const today = businessDay()
  const lastFinal = closures
    .filter((c) => c.final)
    .map((c) => c.day)
    .sort()
    .at(-1)
  const start = lastFinal ? dayEnd(lastFinal) : null
  const end = dayStart(today)
  if (start && start >= end) return 0

  const [sales, shifts] = await Promise.all([fetchRange('sales', start, end), fetchRange('shifts', start, end)])

  const days = new Map()
  const dayFor = (day) => {
    if (!days.has(day)) days.set(day, { sales: [], shifts: [] })
    return days.get(day)
  }
  sales.forEach((s) => dayFor(businessDay(s.createdAt)).sales.push(s))
  shifts.forEach((s) => dayFor(businessDay(s.createdAt)).shifts.push(s))
  closures.filter((c) => !c.final && c.day < today && (!lastFinal || c.day > lastFinal)).forEach((c) => dayFor(c.day))

  const entries = [...days]
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db)
    for (const [day, data] of entries.slice(i, i + 400)) {
      batch.set(doc(db, 'closures', day), buildClosure(day, data.sales, data.shifts, true))
    }
    await batch.commit()
  }
  return entries.length
}
