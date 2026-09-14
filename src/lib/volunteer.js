const IDENTITY_KEY = 'buvette.volunteer'

// Pré-remplit le formulaire du QR code avec le dernier nom saisi sur ce téléphone
export function getVolunteerIdentity() {
  try {
    const saved = JSON.parse(localStorage.getItem(IDENTITY_KEY) || '{}')
    return { firstName: saved.firstName || '', lastName: saved.lastName || '' }
  } catch {
    return { firstName: '', lastName: '' }
  }
}

export function setVolunteerIdentity(identity) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  } catch {
    // stockage indisponible (navigation privée) : le nom sera redemandé
  }
}
