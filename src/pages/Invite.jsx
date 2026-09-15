import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useSession } from '../lib/session'
import { FullPageSpinner } from '../components/Spinner'
import Crest from '../components/Crest'

const INVALID_MESSAGES = {
  invalid: "Ce lien d'invitation n'existe pas ou a été annulé.",
  used: 'Ce lien a déjà été utilisé.',
  expired: 'Ce lien a expiré.',
}

function inviteError(err) {
  switch (err.code) {
    case 'auth/email-already-in-use':
      return 'Un compte existe déjà avec cet e-mail : choisis « J’ai déjà un compte ».'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou mot de passe incorrect.'
    case 'auth/invalid-email':
      return 'Adresse e-mail invalide.'
    case 'auth/weak-password':
      return 'Le mot de passe doit contenir au moins 6 caractères.'
    case 'auth/too-many-requests':
      return 'Trop de tentatives, réessaie dans quelques minutes.'
    case 'permission-denied':
      return "Cette invitation n'est plus valide. Demande un nouveau lien à un administrateur."
    default:
      return err.message
  }
}

// Page ouverte par un lien d'invitation : #/invitation/<jeton>
export default function Invite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { loading, isStaff, refresh } = useSession()
  const [invite, setInvite] = useState({ loading: true, status: null })
  const [mode, setMode] = useState('create')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getDoc(doc(db, 'invites', token))
      .then((snap) => {
        const data = snap.data()
        let status = 'ok'
        if (!snap.exists()) status = 'invalid'
        else if (data.usedBy) status = 'used'
        else if (data.expiresAt.toMillis() <= Date.now()) status = 'expired'
        setInvite({ loading: false, status })
      })
      .catch(() => setInvite({ loading: false, status: 'invalid' }))
  }, [token])

  if (invite.loading || (loading && !busy)) return <FullPageSpinner />
  if (isStaff && !busy) return <Navigate to="/admin" replace />

  if (invite.status !== 'ok') {
    return (
      <main className="join">
        <div className="join-form">
          <Crest size={64} />
          <h1>Invitation</h1>
          <p className="alert error">{INVALID_MESSAGES[invite.status]} Demande un nouveau lien à un administrateur.</p>
        </div>
      </main>
    )
  }

  const bind = (field) => ({
    value: form[field],
    onChange: (e) => setForm((current) => ({ ...current, [field]: e.target.value })),
  })

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  async function submit(e) {
    e.preventDefault()
    const name = form.name.trim().slice(0, 60)
    if (!name) return setError('Indique ton prénom et ton nom.')

    setBusy(true)
    setError('')
    try {
      // Un téléphone déjà utilisé comme bénévole (compte anonyme) passe sur le vrai compte
      if (auth.currentUser?.isAnonymous) await signOut(auth)
      const email = form.email.trim()
      const { user } =
        mode === 'create'
          ? await createUserWithEmailAndPassword(auth, email, form.password)
          : await signInWithEmailAndPassword(auth, email, form.password)

      const batch = writeBatch(db)
      batch.set(doc(db, 'managers', user.uid), { name, email: user.email, invite: token, createdAt: serverTimestamp() })
      batch.update(doc(db, 'invites', token), { usedBy: user.uid, usedAt: serverTimestamp() })
      await batch.commit()

      await refresh()
      navigate('/admin/produits', { replace: true })
    } catch (err) {
      setError(inviteError(err))
      // Pas de session ouverte sans rôle si l'invitation a été refusée
      if (err.code === 'permission-denied') await signOut(auth).catch(() => {})
      setBusy(false)
    }
  }

  return (
    <main className="join">
      <form className="join-form" onSubmit={submit}>
        <Crest size={64} />
        <h1>Rejoindre l'équipe buvette</h1>
        <p className="muted">
          Tu as reçu une invitation pour gérer les stocks de la buvette du MVB : réapprovisionner, ajouter et modifier
          les produits.
        </p>

        <div className="segmented lg" role="radiogroup" aria-label="Compte">
          <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => switchMode('create')}>
            Créer un compte
          </button>
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            J'ai déjà un compte
          </button>
        </div>

        {error && <p className="alert error">{error}</p>}

        <div className="join-fields">
          <label className="field">
            <span>Prénom et nom</span>
            <input className="input xl" {...bind('name')} maxLength={60} autoComplete="name" required />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input
              className="input xl"
              type="email"
              {...bind('email')}
              autoComplete={mode === 'create' ? 'email' : 'username'}
              required
            />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              className="input xl"
              type="password"
              {...bind('password')}
              minLength={mode === 'create' ? 6 : undefined}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              required
            />
          </label>
          {mode === 'create' && <span className="muted small-text">6 caractères minimum.</span>}
          <button className="btn primary xl block" disabled={busy}>
            {busy ? 'Un instant…' : mode === 'create' ? 'Créer mon compte' : 'Me connecter et rejoindre'}
          </button>
        </div>
      </form>
    </main>
  )
}
