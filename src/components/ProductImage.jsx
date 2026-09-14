export default function ProductImage({ product, className = '' }) {
  if (product.image) {
    return <img className={`product-image ${className}`} src={product.image} alt={product.name} />
  }
  const initials = product.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
  return (
    <div className={`product-image placeholder ${className}`} role="img" aria-label={product.name}>
      {initials || '?'}
    </div>
  )
}
