import { useEffect, useState } from 'react'
import { Timestamp, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import { useSession } from '../../lib/session'
import { describeError } from '../../lib/format'
import { randomToken } from '../../lib/random'
import { Spinner } from '../../components/Spinner'

const INVITE_HOURS = 48

const dateTime = (ts) => ts?.toDate().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) ?? '—'
const inviteUrl = (token) => `${window.location.origin}${window.location.pathname}#/invitation/${token}`
const byNewest = (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)

export default function Team() {
  const { user } = useSession()
  const [managers, setManagers] = useState({ loading: true, list: [] })
  const [invites, setInvites] = useState([])
  const [copied, setCopied] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canShare = typeof navigator.share === 'function'

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'managers'),
        (snap) =>
          setManagers({
            loading: false,
            list: snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).sort(byNewest),
          }),
        (err) => {
          setManagers({ loading: false, list: [] })
          setError(describeError(err))
        },
      ),
    [],
  )

  useEffect(
    () =>
      onSnapshot(collection(db, 'invites'), (snap) =>
        setInvites(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).sort(byNewest)),
      ),
    [],
  )

  const now = Date.now()
  const isPending = (invite) => !invite.usedBy && invite.expiresAt?.toMillis() > now
  const pending = invites.filter(isPending)
  const stale = invites.filter((invite) => !isPending(invite))

  async function createInvite() {
    setBusy(true)
    setError('')
    try {
      await setDoc(doc(db, 'invites', randomToken(24)), {
        role: 'manager',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + INVITE_HOURS * 3600_000),
      })
    } catch (err) {
      setError(`Création du lien impossible : ${describeError(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function copy(invite) {
    await navigator.clipboard.writeText(inviteUrl(invite.id))
    setCopied(invite.id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function share(invite) {
    try {
      await navigator.share({
        title: 'Buvette MVB',
        text: 'Voici ton lien pour gérer les stocks de la buvette du MVB :',
        url: inviteUrl(invite.id),
      })
    } catch (err) {
      if (err.name !== 'AbortError') copy(invite)
    }
  }

  async function cancelInvite(invite) {
    if (!window.confirm("Annuler cette invitation ?\nLe lien ne fonctionnera plus.")) return
    await deleteDoc(doc(db, 'invites', invite.id))
  }

  async function purgeStale() {
    const batch = writeBatch(db)
    stale.slice(0, 500).forEach((invite) => batch.delete(doc(db, 'invites', invite.id)))
    await batch.commit()
  }

  async function removeManager(manager) {
    if (!window.confirm(`Retirer l'accès de ${manager.name} ?\nIl ne pourra plus gérer les produits ni vendre.`)) return
    try {
      await deleteDoc(doc(db, 'managers', manager.id))
    } catch (err) {
      setError(`Retrait impossible : ${describeError(err)}`)
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Équipe</h1>
        <span className="spacer" />
        <button className="btn primary md" onClick={createInvite} disabled={busy}>
          {busy ? 'Création…' : 'Inviter un gestionnaire'}
        </button>
      </div>
      <p className="muted intro">
        Un gestionnaire peut réapprovisionner, ajouter et modifier les produits, et vendre. Il ne voit pas les ventes,
        les clôtures ni le QR code bénévoles. Chaque lien est valable {INVITE_HOURS} h et ne fonctionne qu'une fois :
        envoie-le par SMS, WhatsApp ou e-mail, la personne y crée son compte.
      </p>
      {error && <p className="alert error">{error}</p>}

      <div className="panel flush">
        <div className="panel-head">
          <h2>Invitations en attente</h2>
          {stale.length > 0 && (
            <button className="btn" onClick={purgeStale}>
              Nettoyer les anciennes ({stale.length})
            </button>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="empty">Aucune invitation en attente.</p>
        ) : (
          pending.map((invite) => (
            <div key={invite.id} className="invite-row">
              <div className="invite-info">
                <input
                  className="input invite-link"
                  value={inviteUrl(invite.id)}
                  onFocus={(e) => e.target.select()}
                  readOnly
                  aria-label="Lien d'invitation"
                />
                <span className="muted small-text">
                  Créé le {dateTime(invite.createdAt)} · expire le {dateTime(invite.expiresAt)}
                </span>
              </div>
              <div className="row-actions">
                {canShare && (
                  <button className="btn secondary" onClick={() => share(invite)}>
                    Partager
                  </button>
                )}
                <button className="btn" onClick={() => copy(invite)}>
                  {copied === invite.id ? 'Lien copié' : 'Copier le lien'}
                </button>
                <button className="btn danger" onClick={() => cancelInvite(invite)}>
                  Annuler
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="panel flush">
        <div className="panel-head">
          <h2>Gestionnaires</h2>
        </div>
        {managers.loading ? (
          <Spinner />
        ) : managers.list.length === 0 ? (
          <p className="empty">Aucun gestionnaire pour l'instant.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>E-mail</th>
                  <th>Depuis le</th>
                  <th className="num">Action</th>
                </tr>
              </thead>
              <tbody>
                {managers.list.map((m) => (
                  <tr key={m.id}>
                    <td className="strong">{m.name}</td>
                    <td className="muted">{m.email}</td>
                    <td className="muted">{dateTime(m.createdAt)}</td>
                    <td className="num">
                      <button className="btn danger sm" onClick={() => removeManager(m)}>
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
    </section>
  )
}
