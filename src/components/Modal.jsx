import { useEffect } from 'react'

export default function Modal({ label, onClose, sheet = false, wide = false, children }) {
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
      <div
        className={sheet ? 'sheet' : `dialog${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {sheet && <div className="sheet-handle" />}
        {children}
      </div>
    </div>
  )
}

export function DialogHead({ title, onClose }) {
  return (
    <div className="dialog-head">
      <h2>{title}</h2>
      <button type="button" className="close-btn" onClick={onClose} aria-label="Fermer">
        ×
      </button>
    </div>
  )
}
