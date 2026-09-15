import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const SIGNED_OUT = { loading: false, user: null, isAdmin: false, isManager: false, staffName: '' }

const SessionContext = createContext({ ...SIGNED_OUT, loading: true, isStaff: false, refresh: async () => {} })

async function readRole(collectionName, uid) {
  try {
    const snap = await getDoc(doc(db, collectionName, uid))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState({ ...SIGNED_OUT, loading: true })
  const latest = useRef(0)

  // Rôle du compte : admin (tout) ou gestionnaire invité (produits et vente)
  const load = useCallback(async (user, { silent = false } = {}) => {
    const current = ++latest.current
    if (!user) return setSession(SIGNED_OUT)
    if (user.isAnonymous) return setSession({ ...SIGNED_OUT, user })

    if (!silent) setSession({ ...SIGNED_OUT, loading: true, user })
    const [admin, manager] = await Promise.all([readRole('admins', user.uid), readRole('managers', user.uid)])
    if (current !== latest.current) return
    setSession({
      loading: false,
      user,
      isAdmin: Boolean(admin),
      isManager: !admin && Boolean(manager),
      staffName: manager?.name ?? '',
    })
  }, [])

  useEffect(() => onAuthStateChanged(auth, (user) => load(user)), [load])

  // Relit le rôle sans repasser par l'écran de chargement (ex. juste après une invitation acceptée)
  const refresh = useCallback(() => load(auth.currentUser, { silent: true }), [load])

  const value = { ...session, isStaff: session.isAdmin || session.isManager, refresh }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
