// Jeton aléatoire url-safe (clé du QR code bénévoles, liens d'invitation)
export function randomToken(size = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
