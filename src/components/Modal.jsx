import { useEffect } from 'react'

export default function Modal({ label, onClose, sheet = false, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={`backdrop${sheet ? ' backdrop-sheet' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={sheet ? 'sheet' : 'dialog'} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}
