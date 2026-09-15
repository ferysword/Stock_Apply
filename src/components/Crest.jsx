import logo from '../assets/logo-mvb.png'

// Blason du club (fanion jaune MVB)
export default function Crest({ size, decorative = false }) {
  return <img className="crest" src={logo} width={size} alt={decorative ? '' : 'Blason MVB'} />
}
