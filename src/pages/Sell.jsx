import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { signOut } from 'firebase/auth'
import { collection, doc, increment, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useSession } from '../lib/session'
import { useProducts } from '../lib/useProducts'
import { businessDay, formatDay } from '../lib/day'
import { PAYMENT_LABELS, describeError, formatEuros } from '../lib/format'
import { FullPageSpinner } from '../components/Spinner'
import ProductImage from '../components/ProductImage'
import StockBadge from '../components/StockBadge'
import Modal from '../components/Modal'
import Crest from '../components/Crest'

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
  const [leaving, setLeaving] = useState(false)
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

  async function quit(markLeft) {
    setLeaving(true)
    if (markLeft) {
      // Coupe l'accès et affiche « Déconnecté » côté admin (sans bloquer si hors réseau)
      const leave = updateDoc(doc(db, 'devices', user.uid), {
        leftAt: serverTimestamp(),
        expiresAt: serverTimestamp(),
      }).catch(() => {})
      await Promise.race([leave, new Promise((resolve) => setTimeout(resolve, 3000))])
    }
    await signOut(auth)
    navigate('/', { replace: true })
  }

  if (device.loading || leaving) return <FullPageSpinner />

  const expired = !device.data || device.data.expiresAt.toMillis() <= now
  if (expired) {
    return (
      <main className="day-over">
        <Crest size={88} />
        <h1>{device.data ? 'Journée terminée' : 'Accès non valide'}</h1>
        <div className="bar" />
        <p>Scanne le QR code de la buvette pour commencer une nouvelle journée.</p>
        <button className="btn primary" onClick={() => quit(false)}>
          Fermer
        </button>
      </main>
    )
  }

  const { firstName, lastName } = device.data
  return <SellScreen user={user} volunteerName={`${firstName} ${lastName}`} onQuit={() => quit(true)} />
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

  const denied = error?.code === 'permission-denied'

  return (
    <div className="sell">
      <header className="sell-bar">
        <Crest size={34} decorative />
        <div className="sell-id">
          <span className="sell-name">{volunteerName}</span>
          <span className="sell-date">{formatDay(businessDay())}</span>
        </div>
        {onQuit ? (
          <button className="btn dark-outline" onClick={onQuit}>
            Quitter
          </button>
        ) : (
          <Link className="btn dark-outline" to="/admin">
            Admin
          </Link>
        )}
      </header>

      <div className="sell-body">
        {loading ? (
          <div className="tiles" role="status" aria-label="Chargement">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="tile skeleton">
                <span className="tile-logo" />
                <span className="sk-line" />
                <span className="sk-price" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="state-card error">
            <h2>{denied ? 'Accès expiré' : 'Connexion perdue'}</h2>
            <p>
              {denied
                ? 'Scanne à nouveau le QR code de la buvette.'
                : 'Impossible de charger les produits. Vérifie le réseau.'}
            </p>
            {!denied && (
              <button className="btn secondary lg" onClick={() => window.location.reload()}>
                Réessayer
              </button>
            )}
          </div>
        ) : visible.length === 0 ? (
          <div className="state-card">
            <div className="state-icon" />
            <h2>Aucun produit</h2>
            <p>Aucun produit n'est disponible pour l'instant. Préviens un responsable.</p>
          </div>
        ) : (
          <>
            <div className="tiles">
              {visible.map((p) => (
                <button key={p.id} className={`tile${p.stock <= 0 ? ' out' : ''}`} onClick={() => setSelected(p)}>
                  <StockBadge product={p} compact />
                  <ProductImage product={p} className="tile-logo" />
                  <span className="tile-name">{p.name}</span>
                  <span className="tile-price">{formatEuros(p.price)}</span>
                </button>
              ))}
            </div>
            <p className="sell-hint">Touche un produit pour enregistrer une vente.</p>
          </>
        )}
      </div>

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
        <div className="sheet-id">
          <div className="sheet-title">{product.name}</div>
          <div className="muted">{formatEuros(product.price)} l'unité</div>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>

      <div className="stepper">
        <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Moins">
          −
        </button>
        <output aria-live="polite">{qty}</output>
        <button className="plus" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Plus">
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
      <p className="sheet-note">Un appui enregistre la vente.</p>
    </Modal>
  )
}
