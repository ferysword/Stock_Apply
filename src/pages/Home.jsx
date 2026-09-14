import { Link, Navigate } from 'react-router'
import { useSession } from '../lib/session'
import { FullPageSpinner } from '../components/Spinner'

export default function Home() {
  const { loading, user, isAdmin } = useSession()

  if (loading) return <FullPageSpinner />
  if (isAdmin) return <Navigate to="/admin" replace />
  if (user?.isAnonymous) return <Navigate to="/vente" replace />

  return (
    <main className="center-page">
      <div className="card narrow">
        <h1>Buvette</h1>
        <p className="muted">Pour enregistrer des ventes, scanne le QR code affiché à la buvette.</p>
        <Link className="btn" to="/admin/login">
          Espace administrateur
        </Link>
      </div>
    </main>
  )
}
