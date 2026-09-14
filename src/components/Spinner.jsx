export function Spinner() {
  return <div className="spinner" role="status" aria-label="Chargement" />
}

export function FullPageSpinner() {
  return (
    <main className="center-page">
      <Spinner />
    </main>
  )
}
