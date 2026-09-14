import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { isConfigured } from './firebase'
import { SessionProvider, useSession } from './lib/session'
import { FullPageSpinner } from './components/Spinner'
import Home from './pages/Home'
import Join from './pages/Join'
import Sell from './pages/Sell'
import AdminLogin from './pages/admin/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Products from './pages/admin/Products'
import Access from './pages/admin/Access'
import Closures from './pages/admin/Closures'

function AdminGuard({ children }) {
  const { loading, isAdmin } = useSession()
  if (loading) return <FullPageSpinner />
  if (!isAdmin) return <Navigate to="/admin/login" replace />
  return children
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
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <AdminLayout />
              </AdminGuard>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="clotures" element={<Closures />} />
            <Route path="produits" element={<Products />} />
            <Route path="acces" element={<Access />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </SessionProvider>
  )
}
