const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

// Les montants sont stockés en centimes (entiers) pour éviter les erreurs d'arrondi
export const formatEuros = (cents) => euros.format((cents || 0) / 100)

export function parseEuros(value) {
  const n = Number(String(value).replace(',', '.').trim())
  return String(value).trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

export const centsToInput = (cents) => (cents / 100).toFixed(2).replace('.', ',')

export const PAYMENT_LABELS = { card: 'Carte', cash: 'Espèces' }

export const toInputDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function fromInputDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function describeError(err) {
  if (err?.code === 'permission-denied') return 'accès refusé'
  if (err?.code === 'unavailable') return 'réseau indisponible'
  return err?.message || 'erreur inconnue'
}
