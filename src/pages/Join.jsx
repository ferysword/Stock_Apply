import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { signInAnonymously } from 'firebase/auth'
import { Timestamp, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useSession } from '../lib/session'
import { businessDay, dayEnd, formatDay } from '../lib/day'
import { getVolunteerIdentity, setVolunteerIdentity } from '../lib/volunteer'
import { FullPageSpinner } from '../components/Spinner'
import Crest from '../components/Crest'

// Page ouverte par le QR code : #/b/<clé>
export default function Join() {
  const { key } = useParams()
  const navigate = useNavigate()
  const { loading, isStaff } = useSession()
  const [identity, setIdentity] = useState(getVolunteerIdentity)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invalidKey, setInvalidKey] = useState(false)
  const day = businessDay()

  if (loading) return <FullPageSpinner />
  if (isStaff) return <Navigate to="/vente" replace />

  const bind = (field) => ({
    value: identity[field],
    onChange: (e) => setIdentity((current) => ({ ...current, [field]: e.target.value })),
  })

  async function submit(e) {
    e.preventDefault()
    const firstName = identity.firstName.trim().slice(0, 40)
    const lastName = identity.lastName.trim().slice(0, 40)
    if (!firstName || !lastName) return setError('Indique ton prénom et ton nom.')

    setBusy(true)
    setError('')
    try {
      const user = auth.currentUser?.isAnonymous ? auth.currentUser : (await signInAnonymously(auth)).user
      const batch = writeBatch(db)
      batch.set(doc(db, 'devices', user.uid), {
        key,
        firstName,
        lastName,
        day,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(dayEnd(day)),
      })
      batch.set(doc(collection(db, 'shifts')), { uid: user.uid, firstName, lastName, day, createdAt: serverTimestamp() })
      await batch.commit()
      setVolunteerIdentity({ firstName, lastName })
      navigate('/vente', { replace: true })
    } catch (err) {
      if (err.code === 'permission-denied') {
        setInvalidKey(true)
        setError("Ce QR code n'est plus valide. Demande le nouveau QR code à un responsable.")
      } else {
        setError(`Connexion impossible : ${err.message}`)
      }
      setBusy(false)
    }
  }

  return (
    <main className="join">
      <form className="join-form" onSubmit={submit}>
        <Crest size={64} />
        <h1>Bienvenue à la buvette</h1>
        <div className="day-pill">Journée du {formatDay(day).toLowerCase()}</div>
        {error && <p className="alert error">{error}</p>}
        <fieldset className="join-fields" disabled={invalidKey}>
          <label className="field">
            <span>Prénom</span>
            <input className="input xl" {...bind('firstName')} maxLength={40} autoComplete="given-name" required />
          </label>
          <label className="field">
            <span>Nom</span>
            <input className="input xl" {...bind('lastName')} maxLength={40} autoComplete="family-name" required />
          </label>
          <button className="btn primary xl block" disabled={busy || invalidKey}>
            {busy ? 'Connexion…' : 'Commencer ma journée'}
          </button>
        </fieldset>
        {!invalidKey && <p className="muted small-text">L'accès reste actif jusqu'à 4 h du matin.</p>}
      </form>
    </main>
  )
}
