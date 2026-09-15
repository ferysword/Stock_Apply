import { useState } from 'react'
import { Navigate } from 'react-router'
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import { useSession } from '../../lib/session'
import Crest from '../../components/Crest'

function loginError(err) {
  switch (err.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou mot de passe incorrect.'
    case 'auth/invalid-email':
      return 'Adresse e-mail invalide.'
    case 'auth/too-many-requests':
      return 'Trop de tentatives, réessaie dans quelques minutes.'
    default:
      return err.message
  }
}

export default function AdminLogin() {
  const { loading, user, isAdmin } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  if (!loading && isAdmin) return <Navigate to="/admin" replace />
  const notAdmin = !loading && user && !user.isAnonymous && !isAdmin

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setMessage({ type: 'error', text: loginError(err) })
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword() {
    if (!email.trim()) return setMessage({ type: 'error', text: "Saisis d'abord ton adresse e-mail." })
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setMessage({ type: 'warn', text: 'Si un compte existe, un e-mail de réinitialisation a été envoyé.' })
    } catch (err) {
      setMessage({ type: 'error', text: loginError(err) })
    }
  }

  return (
    <main className="login">
      <aside className="login-brand">
        <Crest size={92} />
        <div>
          <h1>
            Buvette
            <br />
            admin
          </h1>
          <div className="bar" />
          <p>Ventes, clôtures, produits et accès bénévoles du MVB.</p>
        </div>
      </aside>

      <div className="login-side">
        <form className="login-form" onSubmit={submit}>
          <h2>Se connecter</h2>
          {notAdmin && (
            <p className="alert error">
              <span className="alert-text">
                Le compte {user.email} n'est pas administrateur.{' '}
                <button type="button" className="link" onClick={() => signOut(auth)}>
                  Se déconnecter
                </button>
              </span>
            </p>
          )}
          {message && <p className={`alert ${message.type}`}>{message.text}</p>}
          <label className="field">
            <span>E-mail</span>
            <input
              className="input lg"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@mvb.fr"
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              className="input lg"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn primary lg block" disabled={busy || loading}>
            {busy || loading ? 'Connexion…' : 'Se connecter'}
          </button>
          <button type="button" className="link" onClick={resetPassword}>
            Mot de passe oublié
          </button>
        </form>
      </div>
    </main>
  )
}
