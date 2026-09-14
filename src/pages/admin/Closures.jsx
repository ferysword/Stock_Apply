import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { businessDay, formatDay } from '../../lib/day'
import { closeDay, finalizePastDays } from '../../lib/closures'
import { useSales } from '../../lib/useSales'
import { describeError, formatEuros } from '../../lib/format'
import { Spinner } from '../../components/Spinner'

const time = (ts) => ts?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) ?? '—'

export default function Closures() {
  const today = businessDay()
  const [closures, setClosures] = useState({ loading: true, list: [] })
  const [syncing, setSyncing] = useState(false)
  const [busyDay, setBusyDay] = useState(null)
  const [error, setError] = useState('')
  const synced = useRef(false)
  const current = useSales(today, today)

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'closures'),
        (snap) =>
          setClosures({
            loading: false,
            list: snap.docs
              .map((d) => d.data({ serverTimestamps: 'estimate' }))
              .sort((a, b) => b.day.localeCompare(a.day)),
          }),
        (err) => {
          setClosures({ loading: false, list: [] })
          setError(describeError(err))
        },
      ),
    [],
  )

  // Clôture automatique des journées terminées à l'ouverture de la page
  useEffect(() => {
    if (closures.loading || synced.current) return
    synced.current = true
    setSyncing(true)
    finalizePastDays(closures.list)
      .catch((err) => setError(`Clôture automatique impossible : ${describeError(err)}`))
      .finally(() => setSyncing(false))
  }, [closures])

  async function run(day) {
    setBusyDay(day)
    setError('')
    try {
      await closeDay(day)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusyDay(null)
    }
  }

  const live = current.sales.reduce(
    (acc, s) => ({ ...acc, total: acc.total + s.total, [s.payment]: acc[s.payment] + s.total, count: acc.count + 1 }),
    { total: 0, card: 0, cash: 0, count: 0 },
  )

  return (
    <section>
      <div className="page-head">
        <h1>Clôtures</h1>
        {syncing && <span className="muted">Clôture des journées terminées…</span>}
      </div>
      {error && <p className="alert error">{error}</p>}

      <div className="panel current-day">
        <div className="page-head">
          <div>
            <h2>Journée en cours</h2>
            <p className="muted">{formatDay(today)} · se termine demain à 4h</p>
          </div>
          <button className="btn primary" onClick={() => run(today)} disabled={busyDay === today}>
            {busyDay === today ? 'Clôture…' : 'Clôturer maintenant'}
          </button>
        </div>
        <div className="mini-stats">
          <div>
            <span className="stat-label">Total</span>
            <strong>{formatEuros(live.total)}</strong>
          </div>
          <div>
            <span className="stat-label">Carte</span>
            <strong>{formatEuros(live.card)}</strong>
          </div>
          <div>
            <span className="stat-label">Espèces</span>
            <strong>{formatEuros(live.cash)}</strong>
          </div>
          <div>
            <span className="stat-label">Ventes</span>
            <strong>{live.count}</strong>
          </div>
        </div>
      </div>

      {closures.loading ? (
        <Spinner />
      ) : closures.list.length === 0 ? (
        <p className="empty">Aucune clôture pour l'instant.</p>
      ) : (
        <div className="closure-list">
          {closures.list.map((c) => (
            <details key={c.day} className="closure" open={c.day === closures.list[0].day}>
              <summary>
                <div className="closure-title">
                  <strong>{formatDay(c.day)}</strong>
                  {!c.final && <span className="tag tag-warn">Provisoire</span>}
                  <span className="muted">
                    {c.volunteers.filter((v) => v.arrivedAt).length} présent(s) · {c.count} vente(s)
                  </span>
                </div>
                <div className="closure-totals">
                  <span className="tag tag-card">Carte {formatEuros(c.card)}</span>
                  <span className="tag tag-cash">Espèces {formatEuros(c.cash)}</span>
                  <strong>{formatEuros(c.total)}</strong>
                </div>
              </summary>

              <div className="closure-body">
                <h3>Bénévoles</h3>
                {c.volunteers.length === 0 ? (
                  <p className="muted">Aucun bénévole enregistré.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Nom</th>
                          <th>Arrivée</th>
                          <th className="num">Ventes</th>
                          <th className="num">Articles</th>
                          <th className="num">Carte</th>
                          <th className="num">Espèces</th>
                          <th>Détail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.volunteers.map((v) => (
                          <tr key={v.name}>
                            <td>{v.name}</td>
                            <td>{time(v.arrivedAt)}</td>
                            <td className="num">{v.count}</td>
                            <td className="num">{v.units}</td>
                            <td className="num">{formatEuros(v.card)}</td>
                            <td className="num">{formatEuros(v.cash)}</td>
                            <td className="wrap">{v.items.map((i) => `${i.qty} × ${i.name}`).join(', ') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3>Produits vendus</h3>
                {c.products.length === 0 ? (
                  <p className="muted">Aucune vente.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Produit</th>
                          <th className="num">Qté</th>
                          <th className="num">Carte</th>
                          <th className="num">Espèces</th>
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.products.map((p) => (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td className="num">{p.qty}</td>
                            <td className="num">{formatEuros(p.card)}</td>
                            <td className="num">{formatEuros(p.cash)}</td>
                            <td className="num">{formatEuros(p.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="closure-foot">
                  <span className="muted">
                    Calculée le {c.closedAt?.toDate().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <button className="btn small" onClick={() => run(c.day)} disabled={busyDay === c.day}>
                    {busyDay === c.day ? 'Calcul…' : 'Recalculer'}
                  </button>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  )
}
