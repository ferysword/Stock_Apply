import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { signOut } from 'firebase/auth'
import { collection, doc, increment, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useSession } from '../lib/session'
import { useProducts } from '../lib/useProducts'
import { businessDay, formatDay } from '../lib/day'
import { PAYMENT_LABELS, describeError, formatEuros } from '../lib/format'
import { FullPageSpinner, Spinner } from '../components/Spinner'
import ProductImage from '../components/ProductImage'
import StockBadge from '../components/StockBadge'
import Modal from '../components/Modal'

export default function Sell() {
  const { loading, user, isAdmin } = useSession()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/" replace />
  return isAdmin ? <SellScreen user={user} volunteerName="Admin" /> : <VolunteerGate user={user} />
}

function useNow(interval) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [interval])
  return now
}

// Vérifie que le téléphone est bien enregistré pour la journée en cours
function VolunteerGate({ user }) {
  const navigate = useNavigate()
  const [device, setDevice] = useState({ loading: true, data: null })
  const now = useNow(30_000)

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'devices', user.uid),
        (snap) => setDevice({ loading: false, data: snap.exists() ? snap.data() : null }),
        () => setDevice({ loading: false, data: null }),
      ),
    [user.uid],
  )

  async function quit() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  if (device.loading) return <FullPageSpinner />

  const expired = !device.data || device.data.expiresAt.toMillis() <= now
  if (expired) {
    return (
      <main className="center-page">
        <div className="card narrow">
          <h1>{device.data ? 'Journée terminée' : 'Accès non valide'}</h1>
          <p className="muted">Scanne le QR code de la buvette pour commencer une nouvelle journée.</p>
          <button className="btn block" onClick={quit}>
            Fermer
          </button>
        </div>
      </main>
    )
  }

  const { firstName, lastName } = device.data
  return <SellScreen user={user} volunteerName={`${firstName} ${lastName}`} onQuit={quit} />
}

function SellScreen({ user, volunteerName, onQuit }) {
  const { products, loading, error } = useProducts()
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState(null)
  const visible = products.filter((p) => p.active)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.type === 'error' ? 6000 : 2500)
    return () => clearTimeout(timer)
  }, [toast])

  function sell(product, qty, payment) {
    setSelected(null)
    const saleRef = doc(collection(db, 'sales'))
    const batch = writeBatch(db)
    batch.set(saleRef, {
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      qty,
      total: qty * product.price,
      payment,
      createdAt: serverTimestamp(),
      deviceId: user.uid,
      volunteerName,
    })
    batch.update(doc(db, 'products', product.id), { stock: increment(-qty), lastSaleId: saleRef.id })

    // Pas d'attente : hors connexion la vente part dès que le réseau revient
    batch.commit().catch((err) =>
      setToast({ type: 'error', text: `Vente NON enregistrée (${qty} × ${product.name}) : ${describeError(err)}` }),
    )
    setToast({
      type: 'success',
      text: `${qty} × ${product.name} · ${formatEuros(qty * product.price)} · ${PAYMENT_LABELS[payment]}`,
    })
  }

  return (
    <div className="sell">
      <header className="sell-bar">
        <div className="sell-id">
          <span className="brand">{volunteerName}</span>
          <span className="who">{formatDay(businessDay(), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        <span className="spacer" />
        {onQuit ? (
          <button className="btn small ghost" onClick={onQuit}>
            Quitter
          </button>
        ) : (
          <Link className="btn small" to="/admin">
            Admin
          </Link>
        )}
      </header>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="center-block">
          <p className="alert error">
            {error.code === 'permission-denied'
              ? 'Accès expiré. Scanne à nouveau le QR code de la buvette.'
              : `Impossible de charger les produits : ${error.message}`}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="empty">Aucun produit disponible.</p>
      ) : (
        <div className="tiles">
          {visible.map((p) => (
            <button key={p.id} className={`tile${p.stock <= 0 ? ' out' : ''}`} onClick={() => setSelected(p)}>
              <span className="tile-badge">
                <StockBadge product={p} compact />
              </span>
              <ProductImage product={p} className="tile-logo" />
              <span className="tile-name">{p.name}</span>
              <span className="tile-price">{formatEuros(p.price)}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <SaleSheet
          product={selected}
          onClose={() => setSelected(null)}
          onConfirm={(qty, payment) => sell(selected, qty, payment)}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  )
}

function SaleSheet({ product, onClose, onConfirm }) {
  const [qty, setQty] = useState(1)

  return (
    <Modal label={product.name} onClose={onClose} sheet>
      <div className="sheet-head">
        <ProductImage product={product} className="sheet-logo" />
        <div>
          <div className="sheet-title">{product.name}</div>
          <div className="muted">{formatEuros(product.price)} l'unité</div>
        </div>
        <button className="btn ghost small close" onClick={onClose} aria-label="Fermer">
          Fermer
        </button>
      </div>

      <div className="stepper">
        <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Moins">
          −
        </button>
        <output aria-live="polite">{qty}</output>
        <button onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Plus">
          +
        </button>
      </div>

      <div className="quick">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} className={n === qty ? 'active' : ''} onClick={() => setQty(n)}>
            {n}
          </button>
        ))}
      </div>

      <div className="sheet-total">
        <span>Total</span>
        <strong>{formatEuros(qty * product.price)}</strong>
      </div>

      <div className="pay">
        <button className="pay-card" onClick={() => onConfirm(qty, 'card')}>
          Carte
        </button>
        <button className="pay-cash" onClick={() => onConfirm(qty, 'cash')}>
          Espèces
        </button>
      </div>
    </Modal>
  )
}
