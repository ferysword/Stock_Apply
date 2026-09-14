import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'fr')

export function useProducts() {
  const [state, setState] = useState({ products: [], loading: true, error: null })

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'products'),
        (snap) => {
          const products = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byOrder)
          setState({ products, loading: false, error: null })
        },
        (error) => setState({ products: [], loading: false, error }),
      ),
    [],
  )

  return state
}
