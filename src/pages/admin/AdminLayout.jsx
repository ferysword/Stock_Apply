import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import Crest from '../../components/Crest'

export default function AdminLayout() {
  const navigate = useNavigate()

  async function logout() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  return (
    <>
      <header className="topbar no-print">
        <div className="topbar-inner">
          <div className="brand">
            <Crest size={40} decorative />
            <span>Buvette admin</span>
          </div>
          <nav className="tabs">
            <NavLink end to="/admin">
              Ventes
            </NavLink>
            <NavLink to="/admin/clotures">Clôtures</NavLink>
            <NavLink to="/admin/produits">Produits</NavLink>
            <NavLink to="/admin/acces">Accès bénévoles</NavLink>
          </nav>
          <div className="topbar-actions">
            <Link className="btn primary" to="/vente">
              Vendre
            </Link>
            <button className="btn dark-outline" onClick={logout}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  )
}
