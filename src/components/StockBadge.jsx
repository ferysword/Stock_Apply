export default function StockBadge({ product, compact = false }) {
  const { stock = 0, threshold = 0 } = product
  if (stock <= 0) return <span className="tag tag-danger">{compact ? 'Épuisé' : `Épuisé (${stock})`}</span>
  if (stock <= threshold) return <span className="tag tag-warn">{compact ? `Reste ${stock}` : `Stock bas : ${stock}`}</span>
  if (compact) return null
  return <span className="tag">Stock : {stock}</span>
}
