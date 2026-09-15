import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { isConfigured } from './firebase'
import { SessionProvider, useSession } from './lib/session'
import { FullPageSpinner } from './components/Spinner'
import Home from './pages/Home'
import Join from './pages/Join'
import Sell from './pages/Sell'
import Invite from './pages/Invite'
import AdminLogin from './pages/admin/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Products from './pages/admin/Products'
import Access from './pages/admin/Access'
import Closures from './pages/admin/Closures'
import Team from './pages/admin/Team'

// Espace de gestion : admins et gestionnaires invités
function StaffGuard({ children }) {
  const { loading, isStaff } = useSession()
  if (loading) return <FullPageSpinner />
  if (!isStaff) return <Navigate to="/admin/login" replace />
  return children
}

// Pages réservées aux admins : un gestionnaire est renvoyé vers les produits
function AdminOnly({ children }) {
  const { isAdmin } = useSession()
  return isAdmin ? children : <Navigate to="/admin/produits" replace />
}

function SetupNotice() {
  return (
    <main className="center-page">
      <div className="card narrow">
        <h1>Configuration manquante</h1>
        <p>
          La configuration Firebase est absente. Copie <code>.env.example</code> en <code>.env.local</code>,
          remplis les valeurs puis relance <code>npm run dev</code>.
        </p>
      </div>
    </main>
  )
}

export default function App() {
  if (!isConfigured) return <SetupNotice />

  return (
    <SessionProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/b/:key" element={<Join />} />
          <Route path="/vente" element={<Sell />} />
          <Route path="/invitation/:token" element={<Invite />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={
              <StaffGuard>
                <AdminLayout />
              </StaffGuard>
            }
          >
            <Route
              index
              element={
                <AdminOnly>
                  <Dashboard />
                </AdminOnly>
              }
            />
            <Route
              path="clotures"
              element={
                <AdminOnly>
                  <Closures />
                </AdminOnly>
              }
            />
            <Route path="produits" element={<Products />} />
            <Route
              path="acces"
              element={
                <AdminOnly>
                  <Access />
                </AdminOnly>
              }
            />
            <Route
              path="equipe"
              element={
                <AdminOnly>
                  <Team />
                </AdminOnly>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </SessionProvider>
  )
}
