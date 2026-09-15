export default function StockBadge({ product, compact = false }) {
  const { stock = 0, threshold = 0 } = product

  // Version tuile (écran de vente) : rien à signaler si le stock est normal
  if (compact) {
    if (stock <= 0) return <span className="tile-badge tile-badge-out">Épuisé</span>
    if (stock <= threshold) return <span className="tile-badge tile-badge-low">Reste {stock}</span>
    return null
  }

  if (stock <= 0) return <span className="tag tag-danger">{stock < 0 ? `Épuisé (${stock})` : 'Épuisé'}</span>
  if (stock <= threshold) return <span className="tag tag-warn">Stock bas : {stock}</span>
  return <span className="tag tag-ok">Stock : {stock}</span>
}
