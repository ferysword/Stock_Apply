import { Link, Navigate } from 'react-router'
import { useSession } from '../lib/session'
import { FullPageSpinner } from '../components/Spinner'
import Crest from '../components/Crest'

export default function Home() {
  const { loading, user, isAdmin } = useSession()

  if (loading) return <FullPageSpinner />
  if (isAdmin) return <Navigate to="/admin" replace />
  if (user?.isAnonymous) return <Navigate to="/vente" replace />

  return (
    <main className="welcome">
      <div className="welcome-main">
        <Crest size={104} />
        <h1>Buvette</h1>
        <div className="bar" />
        <p className="lead">Pour enregistrer des ventes, scanne le QR code affiché à la buvette.</p>
      </div>
      <footer className="welcome-foot">
        <Link to="/admin/login">Espace administrateur</Link>
      </footer>
    </main>
  )
}
