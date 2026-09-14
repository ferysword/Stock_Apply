import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const SessionContext = createContext({ loading: true, user: null, isAdmin: false })

export function SessionProvider({ children }) {
  const [session, setSession] = useState({ loading: true, user: null, isAdmin: false })

  useEffect(() => {
    let latest = 0
    return onAuthStateChanged(auth, async (user) => {
      const current = ++latest
      if (!user) return setSession({ loading: false, user: null, isAdmin: false })
      if (user.isAnonymous) return setSession({ loading: false, user, isAdmin: false })

      setSession({ loading: true, user, isAdmin: false })
      let isAdmin = false
      try {
        isAdmin = (await getDoc(doc(db, 'admins', user.uid))).exists()
      } catch {
        isAdmin = false
      }
      if (current === latest) setSession({ loading: false, user, isAdmin })
    })
  }, [])

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
