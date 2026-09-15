import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import { describeError } from '../../lib/format'
import { Spinner } from '../../components/Spinner'
import Crest from '../../components/Crest'

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export default function Access() {
  const [access, setAccess] = useState({ loading: true, key: null })
  const [devices, setDevices] = useState([])
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'private', 'access'),
        (snap) => setAccess({ loading: false, key: snap.exists() ? snap.data().key : null }),
        (err) => {
          setAccess({ loading: false, key: null })
          setError(describeError(err))
        },
      ),
    [],
  )

  useEffect(
    () =>
      onSnapshot(collection(db, 'devices'), (snap) =>
        setDevices(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
            .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)),
        ),
      ),
    [],
  )

  const joinUrl = access.key ? `${window.location.origin}${window.location.pathname}#/b/${access.key}` : ''
  const now = Date.now()
  const isActive = (d) => d.key === access.key && d.expiresAt?.toMillis() > now
  const expired = devices.filter((d) => !isActive(d))

  async function regenerate() {
    if (
      access.key &&
      !window.confirm('Générer un nouveau QR code ?\nTous les bénévoles connectés devront scanner le nouveau.')
    ) {
      return
    }
    try {
      await setDoc(doc(db, 'private', 'access'), { key: randomKey(), updatedAt: serverTimestamp() })
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function revoke(device) {
    if (!window.confirm(`Retirer l'accès de ${device.firstName} ${device.lastName} ?`)) return
    await deleteDoc(doc(db, 'devices', device.id))
  }

  async function purgeExpired() {
    const batch = writeBatch(db)
    expired.slice(0, 500).forEach((d) => batch.delete(doc(db, 'devices', d.id)))
    await batch.commit()
  }

  if (access.loading) return <Spinner />

  return (
    <section>
      <div className="stack no-print">
        {error && <p className="alert error">{error}</p>}

        <div className="access">
          <div className="panel qr-card">
            {access.key ? (
              <>
                <h2>Buvette · Espace bénévoles</h2>
                <div className="qr-frame">
                  <QRCodeSVG value={joinUrl} size={212} marginSize={0} level="M" />
                </div>
                <p className="muted">Scanne ce code avec l'appareil photo au début de chaque journée.</p>
                <div className="qr-actions">
                  <button className="btn" onClick={() => window.print()}>
                    Imprimer
                  </button>
                  <button className="btn" onClick={copy}>
                    {copied ? 'Lien copié' : 'Copier le lien'}
                  </button>
                  <button className="btn secondary" onClick={regenerate}>
                    Nouveau QR code
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Aucun QR code</h2>
                <p className="muted">Génère un QR code pour permettre aux bénévoles de se connecter.</p>
                <button className="btn primary lg" onClick={regenerate}>
                  Générer le QR code
                </button>
              </>
            )}
          </div>

          <div className="panel flush">
            <div className="panel-head">
              <h2>Téléphones connectés</h2>
              {expired.length > 0 && (
                <button className="btn" onClick={purgeExpired}>
                  Nettoyer les expirés ({expired.length})
                </button>
              )}
            </div>
            {devices.length === 0 ? (
              <p className="empty">Aucun bénévole connecté.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Connecté le</th>
                      <th>Statut</th>
                      <th className="num">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.id}>
                        <td className="strong">
                          {d.firstName} {d.lastName}
                        </td>
                        <td className="muted">
                          {d.createdAt?.toDate().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td>
                          {isActive(d) ? <span className="tag tag-ok">Actif</span> : <span className="tag">Expiré</span>}
                        </td>
                        <td className="num">
                          <button className="btn danger sm" onClick={() => revoke(d)}>
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {access.key && <Poster url={joinUrl} />}
    </section>
  )
}

// Affiche A4 à coller à la buvette, visible uniquement à l'impression
function Poster({ url }) {
  return (
    <div className="poster print-only">
      <Crest size={130} />
      <div className="poster-title">Buvette</div>
      <div className="poster-band">Espace bénévoles</div>
      <div className="poster-qr">
        <QRCodeSVG value={url} size={330} marginSize={0} level="M" />
      </div>
      <p className="poster-lead">Scanne ce code avec l'appareil photo de ton téléphone au début de chaque journée.</p>
      <p className="poster-sub">
        Indique ton prénom et ton nom, puis enregistre chaque vente. L'accès se termine à 4 h du matin.
      </p>
      <span className="spacer" />
      <div className="poster-foot">Montaigu-Vendée Boufféré Volley-Ball · 1969</div>
    </div>
  )
}
