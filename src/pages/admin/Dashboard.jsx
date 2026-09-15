import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { doc, increment, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import { useProducts } from '../../lib/useProducts'
import { useSales } from '../../lib/useSales'
import { addDays, businessDay } from '../../lib/day'
import { PAYMENT_LABELS, describeError, formatEuros } from '../../lib/format'
import { Spinner } from '../../components/Spinner'

const PRESETS = [
  { label: "Aujourd'hui", daysBack: 0, span: 1 },
  { label: 'Hier', daysBack: 1, span: 1 },
  { label: '7 jours', daysBack: 0, span: 7 },
]

function presetRange({ daysBack, span }) {
  const to = addDays(businessDay(), -daysBack)
  return { from: addDays(to, -(span - 1)), to }
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`

function computeStats(sales) {
  const products = new Map()
  const volunteers = new Map()
  const stats = { total: 0, card: 0, cash: 0, cardCount: 0, cashCount: 0, units: 0, count: sales.length }

  for (const s of sales) {
    stats.total += s.total
    stats.units += s.qty
    stats[s.payment] += s.total
    stats[`${s.payment}Count`] += 1

    const p = products.get(s.productId) ?? { name: s.productName, qty: 0, total: 0 }
    p.qty += s.qty
    p.total += s.total
    products.set(s.productId, p)

    const v = volunteers.get(s.volunteerName) ?? { name: s.volunteerName || 'Inconnu', count: 0, card: 0, cash: 0 }
    v.count += 1
    v[s.payment] += s.total
    volunteers.set(s.volunteerName, v)
  }

  return {
    ...stats,
    products: [...products.values()].sort((a, b) => b.total - a.total),
    volunteers: [...volunteers.values()].sort((a, b) => b.card + b.cash - (a.card + a.cash)),
  }
}

const amount = (cents) => (cents / 100).toFixed(2).replace('.', ',')

function exportCsv(sales, from, to) {
  const rows = [['Date', 'Heure', 'Produit', 'Quantité', 'Prix unitaire', 'Total', 'Paiement', 'Bénévole']]
  for (const s of [...sales].reverse()) {
    rows.push([
      s.createdAt.toLocaleDateString('fr-FR'),
      s.createdAt.toLocaleTimeString('fr-FR'),
      s.productName,
      s.qty,
      amount(s.unitPrice),
      amount(s.total),
      PAYMENT_LABELS[s.payment],
      s.volunteerName,
    ])
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `ventes_${from}_${to}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Dashboard() {
  const today = businessDay()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const { products } = useProducts()
  const { sales, loading, error } = useSales(from, to)
  const stats = useMemo(() => computeStats(sales), [sales])
  const lowStock = products.filter((p) => p.active && p.stock <= (p.threshold ?? 0))

  function applyPreset(preset) {
    const range = presetRange(preset)
    setFrom(range.from)
    setTo(range.to)
  }

  async function cancelSale(sale) {
    const ok = window.confirm(
      `Annuler la vente ${sale.qty} × ${sale.productName} (${formatEuros(sale.total)}) ?\nLe stock sera remis à jour.`,
    )
    if (!ok) return
    const batch = writeBatch(db)
    batch.delete(doc(db, 'sales', sale.id))
    if (products.some((p) => p.id === sale.productId)) {
      batch.update(doc(db, 'products', sale.productId), { stock: increment(sale.qty) })
    }
    try {
      await batch.commit()
    } catch (err) {
      window.alert(`Annulation impossible : ${describeError(err)}`)
    }
  }

  return (
    <section className="stack">
      <div className="panel filters">
        <div className="segmented" role="group" aria-label="Période">
          {PRESETS.map((preset) => {
            const range = presetRange(preset)
            const active = range.from === from && range.to === to
            return (
              <button key={preset.label} className={active ? 'active' : ''} onClick={() => applyPreset(preset)}>
                {preset.label}
              </button>
            )
          })}
        </div>
        <div className="date-range">
          <label htmlFor="period-from">Du</label>
          <input
            id="period-from"
            className="input"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
          <label htmlFor="period-to">Au</label>
          <input
            id="period-to"
            className="input"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <span className="spacer" />
        <button className="btn" onClick={() => exportCsv(sales, from, to)} disabled={sales.length === 0}>
          Exporter CSV
        </button>
        <p className="filters-note">Une journée va de 4 h à 4 h le lendemain.</p>
      </div>

      {lowStock.length > 0 && (
        <div className="alert warn">
          <span className="alert-text">Stock bas : {lowStock.map((p) => `${p.name} (${p.stock})`).join(', ')}.</span>
          <Link to="/admin/produits">Réapprovisionner</Link>
        </div>
      )}
      {error && <p className="alert error">Chargement impossible : {describeError(error)}</p>}

      <div className="stats">
        <div className="stat highlight">
          <div className="label">Total encaissé</div>
          <div className="stat-value">{formatEuros(stats.total)}</div>
          <div className="stat-sub">
            {plural(stats.count, 'vente')} · {plural(stats.units, 'article')}
          </div>
        </div>
        <div className="stat">
          <div className="label">Carte</div>
          <div className="stat-value">{formatEuros(stats.card)}</div>
          <div className="stat-sub">{plural(stats.cardCount, 'vente')}</div>
        </div>
        <div className="stat">
          <div className="label">Espèces</div>
          <div className="stat-value">{formatEuros(stats.cash)}</div>
          <div className="stat-sub">{plural(stats.cashCount, 'vente')}</div>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : sales.length === 0 ? (
        <p className="panel empty">Aucune vente sur cette période.</p>
      ) : (
        <>
          <div className="grid-2">
            <div className="panel flush">
              <h2 className="panel-title">Par produit</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th className="num">Qté</th>
                      <th className="num">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.products.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="num">{p.qty}</td>
                        <td className="num strong">{formatEuros(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel flush">
              <h2 className="panel-title">Par bénévole</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bénévole</th>
                      <th className="num">Ventes</th>
                      <th className="num">Carte</th>
                      <th className="num">Espèces</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.volunteers.map((v) => (
                      <tr key={v.name}>
                        <td>{v.name}</td>
                        <td className="num">{v.count}</td>
                        <td className="num">{formatEuros(v.card)}</td>
                        <td className="num">{formatEuros(v.cash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="panel flush">
            <h2 className="panel-title">Détail des ventes</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Produit</th>
                    <th className="num">Qté</th>
                    <th className="num">Montant</th>
                    <th className="center">Paiement</th>
                    <th>Bénévole</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id}>
                      <td className="muted">
                        {s.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}{' '}
                        {s.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>{s.productName}</td>
                      <td className="num">{s.qty}</td>
                      <td className="num strong">{formatEuros(s.total)}</td>
                      <td className="center">
                        <span className={`tag tag-${s.payment}`}>{PAYMENT_LABELS[s.payment]}</span>
                      </td>
                      <td>{s.volunteerName}</td>
                      <td className="num">
                        <button className="btn danger sm" onClick={() => cancelSale(s)}>
                          Annuler
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
