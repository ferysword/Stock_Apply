import { useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useProducts } from '../../lib/useProducts'
import { centsToInput, describeError, formatEuros, parseEuros } from '../../lib/format'
import { resizeImage } from '../../lib/image'
import { Spinner } from '../../components/Spinner'
import ProductImage from '../../components/ProductImage'
import StockBadge from '../../components/StockBadge'
import Modal, { DialogHead } from '../../components/Modal'

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`

export default function Products() {
  const { products, loading, error } = useProducts()
  const [editing, setEditing] = useState(null) // null | 'new' | produit
  const [restocking, setRestocking] = useState(null)
  const [bulk, setBulk] = useState(false)
  const nextOrder = products.reduce((max, p) => Math.max(max, p.order ?? 0), 0) + 10
  const hiddenCount = products.filter((p) => !p.active).length

  async function remove(product) {
    if (!window.confirm(`Supprimer « ${product.name} » ?\nL'historique des ventes est conservé.`)) return
    try {
      await deleteDoc(doc(db, 'products', product.id))
    } catch (err) {
      window.alert(`Suppression impossible : ${describeError(err)}`)
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Produits</h1>
        {products.length > 0 && (
          <span className="muted">
            {plural(products.length, 'produit')} · {plural(hiddenCount, 'masqué')}
          </span>
        )}
        <span className="spacer" />
        <div className="head-actions">
          <button className="btn md" onClick={() => setBulk(true)} disabled={products.length === 0}>
            Réappro groupé
          </button>
          <button className="btn primary md" onClick={() => setEditing('new')}>
            Ajouter un produit
          </button>
        </div>
      </div>

      {error && <p className="alert error">Chargement impossible : {describeError(error)}</p>}

      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <p className="panel empty">Aucun produit pour l'instant. Commence par en ajouter un.</p>
      ) : (
        <div className="panel flush">
          {products.map((p) => (
            <div key={p.id} className="product-row">
              <ProductImage product={p} className="row-logo" />
              <div className="row-main">
                <div className="row-name">{p.name}</div>
                <div className="muted small-text">Ordre {p.order ?? 0}</div>
              </div>
              <div className="row-price">{formatEuros(p.price)}</div>
              <div className="row-tags">
                <StockBadge product={p} />
                {!p.active && <span className="tag">Masqué</span>}
              </div>
              <span className="spacer" />
              <div className="row-actions">
                <button className="btn" onClick={() => setRestocking(p)}>
                  Réappro
                </button>
                <button className="btn" onClick={() => setEditing(p)}>
                  Modifier
                </button>
                <button className="btn danger" onClick={() => remove(p)}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          nextOrder={nextOrder}
          onClose={() => setEditing(null)}
        />
      )}
      {restocking && <RestockDialog product={restocking} onClose={() => setRestocking(null)} />}
      {bulk && <BulkRestockDialog products={products} onClose={() => setBulk(false)} />}
    </section>
  )
}

// Réappro de plusieurs produits d'un coup : ajout au stock ou saisie du stock compté (inventaire)
function BulkRestockDialog({ products, onClose }) {
  const [mode, setMode] = useState('add')
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    const entries = Object.entries(values)
      .filter(([, v]) => v.trim() !== '')
      .map(([id, v]) => [id, Number(v)])
    if (entries.length === 0) return setError('Aucune quantité saisie.')
    if (entries.some(([, n]) => !Number.isInteger(n) || n < 0)) {
      return setError('Les quantités doivent être des nombres entiers positifs.')
    }

    setBusy(true)
    try {
      const batch = writeBatch(db)
      for (const [id, n] of entries) {
        batch.update(doc(db, 'products', id), { stock: mode === 'add' ? increment(n) : n })
      }
      await batch.commit()
      onClose()
    } catch (err) {
      setError(`Enregistrement impossible : ${describeError(err)}`)
      setBusy(false)
    }
  }

  return (
    <Modal label="Réappro groupé" onClose={onClose} wide>
      <form onSubmit={submit}>
        <DialogHead title="Réappro groupé" onClose={onClose} />
        <div className="dialog-body">
          <div className="segmented lg" role="radiogroup">
            <button type="button" className={mode === 'add' ? 'active' : ''} onClick={() => setMode('add')}>
              Ajouter au stock
            </button>
            <button type="button" className={mode === 'count' ? 'active' : ''} onClick={() => setMode('count')}>
              Stock compté
            </button>
          </div>
          <p className="muted small-text">
            {mode === 'add'
              ? 'Saisis la quantité ajoutée pour chaque produit réapprovisionné.'
              : 'Saisis la quantité réellement présente (inventaire). Évite de le faire pendant les ventes.'}
          </p>
          {error && <p className="alert error">{error}</p>}

          <div className="bulk-list">
            {products.map((p) => {
              const raw = values[p.id] ?? ''
              const n = Number(raw)
              const preview = raw.trim() !== '' && Number.isInteger(n) ? (mode === 'add' ? p.stock + n : n) : null
              return (
                <label key={p.id} className="bulk-row">
                  <ProductImage product={p} className="bulk-logo" />
                  <span className="bulk-name">
                    {p.name}
                    <span className="muted">
                      Stock : {p.stock}
                      {preview !== null && (
                        <>
                          {' → '}
                          <strong>{preview}</strong>
                        </>
                      )}
                    </span>
                  </span>
                  <input
                    className="input qty-input"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={raw}
                    onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
                    aria-label={`Quantité ${p.name}`}
                  />
                </label>
              )
            })}
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn md" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary md" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ProductForm({ product, nextOrder, onClose }) {
  const [form, setForm] = useState(() => ({
    name: product?.name ?? '',
    price: product ? centsToInput(product.price) : '',
    stock: String(product?.stock ?? 0),
    threshold: String(product?.threshold ?? 5),
    order: String(product?.order ?? nextOrder),
    active: product?.active ?? true,
    image: product?.image ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const bind = (key) => ({
    value: form[key],
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  async function pickImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const image = await resizeImage(file)
      setForm((f) => ({ ...f, image }))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function submit(e) {
    e.preventDefault()
    const price = parseEuros(form.price)
    const stock = Number(form.stock)
    const threshold = Number(form.threshold)
    const order = Number(form.order)

    if (!form.name.trim()) return setError('Le nom est obligatoire.')
    if (price === null) return setError('Prix invalide.')
    if (![stock, threshold, order].every(Number.isInteger)) {
      return setError('Stock, seuil et ordre doivent être des nombres entiers.')
    }

    const data = { name: form.name.trim(), price, stock, threshold, order, active: form.active, image: form.image }
    // Ne pas écraser le stock s'il n'a pas été modifié (des ventes peuvent arriver pendant l'édition)
    if (product && stock === product.stock) delete data.stock

    setBusy(true)
    try {
      if (product) await updateDoc(doc(db, 'products', product.id), data)
      else await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() })
      onClose()
    } catch (err) {
      setError(`Enregistrement impossible : ${describeError(err)}`)
      setBusy(false)
    }
  }

  const title = product ? 'Modifier le produit' : 'Nouveau produit'

  return (
    <Modal label={title} onClose={onClose}>
      <form onSubmit={submit}>
        <DialogHead title={title} onClose={onClose} />
        <div className="dialog-body">
          {error && <p className="alert error">{error}</p>}

          <div className="image-field">
            {form.image ? (
              <img className="product-image image-preview" src={form.image} alt="" />
            ) : (
              <div className="image-preview empty-preview">Aucun logo</div>
            )}
            <div className="image-buttons">
              <label className="btn">
                Choisir une image
                <input type="file" accept="image/*" onChange={pickImage} hidden />
              </label>
              {form.image && (
                <button type="button" className="btn text" onClick={() => setForm((f) => ({ ...f, image: '' }))}>
                  Retirer
                </button>
              )}
            </div>
          </div>

          <label className="field">
            <span>Nom</span>
            <input className="input" {...bind('name')} maxLength={60} required autoFocus />
          </label>
          <div className="form-grid-3">
            <label className="field">
              <span>Prix (€)</span>
              <input className="input" {...bind('price')} inputMode="decimal" placeholder="2,50" required />
            </label>
            <label className="field">
              <span>{product ? 'Stock (inventaire)' : 'Stock initial'}</span>
              <input className="input" {...bind('stock')} type="number" step="1" required />
            </label>
            <label className="field">
              <span>Seuil d'alerte</span>
              <input className="input" {...bind('threshold')} type="number" min="0" step="1" required />
            </label>
          </div>
          <label className="field field-narrow">
            <span>Ordre d'affichage</span>
            <input className="input" {...bind('order')} type="number" step="1" required />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Visible pour les bénévoles
          </label>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn md" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary md" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RestockDialog({ product, onClose }) {
  const [quantity, setQuantity] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    const n = Number(quantity)
    if (!Number.isInteger(n) || n <= 0) return setError('Indique un nombre entier positif.')
    setBusy(true)
    try {
      await updateDoc(doc(db, 'products', product.id), { stock: increment(n) })
      onClose()
    } catch (err) {
      setError(`Réapprovisionnement impossible : ${describeError(err)}`)
      setBusy(false)
    }
  }

  return (
    <Modal label="Réapprovisionner" onClose={onClose}>
      <form onSubmit={submit}>
        <DialogHead title="Réapprovisionner" onClose={onClose} />
        <div className="dialog-body">
          <div className="restock-head">
            <ProductImage product={product} className="row-logo" />
            <div>
              <div className="row-name">{product.name}</div>
              <div className="muted">Stock actuel : {product.stock}</div>
            </div>
          </div>
          {error && <p className="alert error">{error}</p>}
          <label className="field">
            <span>Quantité ajoutée</span>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
              required
            />
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn md" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary md" disabled={busy}>
            Ajouter au stock
          </button>
        </div>
      </form>
    </Modal>
  )
}
