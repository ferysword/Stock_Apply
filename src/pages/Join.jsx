import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { signInAnonymously } from 'firebase/auth'
import { Timestamp, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useSession } from '../lib/session'
import { businessDay, dayEnd, formatDay } from '../lib/day'
import { getVolunteerIdentity, setVolunteerIdentity } from '../lib/volunteer'
import { FullPageSpinner } from '../components/Spinner'

// Page ouverte par le QR code : #/b/<clé>
export default function Join() {
  const { key } = useParams()
  const navigate = useNavigate()
  const { loading, isAdmin } = useSession()
  const [identity, setIdentity] = useState(getVolunteerIdentity)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const day = businessDay()

  if (loading) return <FullPageSpinner />
  if (isAdmin) return <Navigate to="/vente" replace />

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
      setError(
        err.code === 'permission-denied'
          ? "Ce QR code n'est plus valide. Demande le nouveau QR code à un responsable."
          : `Connexion impossible : ${err.message}`,
      )
      setBusy(false)
    }
  }

  return (
    <main className="center-page">
      <form className="card narrow" onSubmit={submit}>
        <h1>Bienvenue à la buvette</h1>
        <div className="day-pill">Journée du {formatDay(day)}</div>
        {error && <p className="alert error">{error}</p>}
        <label className="field">
          <span>Prénom</span>
          <input className="input" {...bind('firstName')} maxLength={40} autoComplete="given-name" required />
        </label>
        <label className="field">
          <span>Nom</span>
          <input className="input" {...bind('lastName')} maxLength={40} autoComplete="family-name" required />
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Connexion…' : 'Commencer ma journée'}
        </button>
      </form>
    </main>
  )
}
