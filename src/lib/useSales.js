import { useEffect, useState } from 'react'
import { Timestamp, collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { dayEnd, dayStart } from './day'

export const withDate = (snap) => {
  const data = snap.data({ serverTimestamps: 'estimate' })
  return { id: snap.id, ...data, createdAt: data.createdAt?.toDate() ?? new Date() }
}

// Ventes en temps réel entre deux journées de buvette incluses (4h -> 4h)
export function useSales(fromDay, toDay) {
  const [state, setState] = useState({ sales: [], loading: true, error: null })

  useEffect(() => {
    if (!fromDay || !toDay) return
    setState((s) => ({ ...s, loading: true }))
    const q = query(
      collection(db, 'sales'),
      where('createdAt', '>=', Timestamp.fromDate(dayStart(fromDay))),
      where('createdAt', '<', Timestamp.fromDate(dayEnd(toDay))),
      orderBy('createdAt', 'desc'),
    )
    return onSnapshot(
      q,
      (snap) => setState({ sales: snap.docs.map(withDate), loading: false, error: null }),
      (error) => setState({ sales: [], loading: false, error }),
    )
  }, [fromDay, toDay])

  return state
}
