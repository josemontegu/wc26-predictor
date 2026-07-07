// Flag emoji lookup for nations, used to give the app a real football feel.
// Falls back gracefully for unknown names and placeholders.

import { getLang } from './i18n'

const FLAGS: Record<string, string> = {
  Argentina: '🇦🇷', Nigeria: '🇳🇬', France: '🇫🇷', Senegal: '🇸🇳',
  Brazil: '🇧🇷', 'South Korea': '🇰🇷', Spain: '🇪🇸', Morocco: '🇲🇦',
  Germany: '🇩🇪', Japan: '🇯🇵', Portugal: '🇵🇹', Croatia: '🇭🇷',
  Netherlands: '🇳🇱', Mexico: '🇲🇽', England: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  Ecuador: '🇪🇨', Belgium: '🇧🇪', USA: '🇺🇸', 'United States': '🇺🇸',
  Italy: '🇮🇹', Canada: '🇨🇦', Uruguay: '🇺🇾', Colombia: '🇨🇴',
  Switzerland: '🇨🇭', Denmark: '🇩🇰', Poland: '🇵🇱', Australia: '🇦🇺',
  Qatar: '🇶🇦', 'Saudi Arabia': '🇸🇦', Iran: '🇮🇷', Ghana: '🇬🇭',
  Cameroon: '🇨🇲', 'Ivory Coast': '🇨🇮', Tunisia: '🇹🇳', Egypt: '🇪🇬',
  Algeria: '🇩🇿', Peru: '🇵🇪', Chile: '🇨🇱', 'Costa Rica': '🇨🇷',
  Panama: '🇵🇦', Jamaica: '🇯🇲', Norway: '🇳🇴', Sweden: '🇸🇪',
  Austria: '🇦🇹', Serbia: '🇷🇸', Turkey: '🇹🇷', Greece: '🇬🇷',
  Ukraine: '🇺🇦', 'New Zealand': '🇳🇿', Wales: '🏴\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
  Scotland: '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  Paraguay: '🇵🇾', Venezuela: '🇻🇪', 'South Africa': '🇿🇦', Mali: '🇲🇱',
  'DR Congo': '🇨🇩', Uzbekistan: '🇺🇿', Jordan: '🇯🇴', Iraq: '🇮🇶',
  'Cape Verde': '🇨🇻', Curacao: '🇨🇼', Haiti: '🇭🇹', Honduras: '🇭🇳',
  'Bosnia & Herzegovina': '🇧🇦', 'Bosnia and Herzegovina': '🇧🇦',
  'Bosnia-Herzegovina': '🇧🇦', Bosnia: '🇧🇦',
}

// A bracket slot ("2A", "3A/B/C/D/F", "Winner M74") rather than a real nation.
export function isTBD(name: string | null | undefined): boolean {
  if (!name) return true
  const s = name.trim()
  return s === '' || s === 'TBD' || /[0-9]/.test(s) || s.includes('/')
}

export function teamFlag(name: string | null | undefined): string {
  if (isTBD(name)) return '🏳️'
  return FLAGS[name as string] ?? '⚽'
}

// Spanish names for nations. Only entries that differ from English are listed;
// everything else falls back to the stored (English) name.
const TEAM_ES: Record<string, string> = {
  France: 'Francia',
  Brazil: 'Brasil',
  'South Korea': 'Corea del Sur',
  Spain: 'España',
  Morocco: 'Marruecos',
  Germany: 'Alemania',
  Japan: 'Japón',
  Croatia: 'Croacia',
  Netherlands: 'Países Bajos',
  Mexico: 'México',
  England: 'Inglaterra',
  Belgium: 'Bélgica',
  USA: 'Estados Unidos',
  'United States': 'Estados Unidos',
  Italy: 'Italia',
  Canada: 'Canadá',
  Switzerland: 'Suiza',
  Denmark: 'Dinamarca',
  Poland: 'Polonia',
  Qatar: 'Catar',
  'Saudi Arabia': 'Arabia Saudí',
  Iran: 'Irán',
  Cameroon: 'Camerún',
  'Ivory Coast': 'Costa de Marfil',
  Tunisia: 'Túnez',
  Egypt: 'Egipto',
  Algeria: 'Argelia',
  Peru: 'Perú',
  Panama: 'Panamá',
  Norway: 'Noruega',
  Sweden: 'Suecia',
  Turkey: 'Turquía',
  Greece: 'Grecia',
  Ukraine: 'Ucrania',
  'New Zealand': 'Nueva Zelanda',
  Wales: 'Gales',
  Scotland: 'Escocia',
  'South Africa': 'Sudáfrica',
  Mali: 'Malí',
  'DR Congo': 'RD del Congo',
  Uzbekistan: 'Uzbekistán',
  Jordan: 'Jordania',
  Iraq: 'Irak',
  'Cape Verde': 'Cabo Verde',
  Curacao: 'Curazao',
  Haiti: 'Haití',
  'Bosnia & Herzegovina': 'Bosnia y Herzegovina',
  'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
  'Bosnia-Herzegovina': 'Bosnia y Herzegovina',
}

/** A nation's display name, localised to the current language. Bracket
 * placeholders (e.g. "2A", "Winner M74") and unknown names pass through. */
export function teamName(name: string | null | undefined): string {
  const s = (name ?? '').toString()
  if (!s || isTBD(s) || getLang() !== 'es') return s
  return TEAM_ES[s] ?? s
}

// Kit / flag-derived primary colour per nation, used as card and header accents.
const COLORS: Record<string, string> = {
  Argentina: '#6cabdd', Nigeria: '#0b8a3d', France: '#1f3a8a', Senegal: '#1f9d55',
  Brazil: '#0a9e4a', 'South Korea': '#10489c', Spain: '#c8102e', Morocco: '#b81d24',
  Germany: '#222730', Japan: '#0b3aa0', Portugal: '#7a1f2b', Croatia: '#c8102e',
  Netherlands: '#ef6c12', Mexico: '#0a7a4a', England: '#cf142b', Ecuador: '#0b4ea2',
  Belgium: '#c8102e', USA: '#0a3161', 'United States': '#0a3161', Italy: '#1565c0',
  Canada: '#d52b1e', Uruguay: '#0b3c8c', Colombia: '#d8a400', Switzerland: '#c8102e',
  Denmark: '#c60c30', Poland: '#c8102e', Australia: '#0b8a3d', Qatar: '#7a1f47',
  'Saudi Arabia': '#0b6a3a', Iran: '#0b8a3d', Ghana: '#0b8a3d', Cameroon: '#0b8a3d',
  'Ivory Coast': '#ef6c12', Tunisia: '#c8102e', Egypt: '#c8102e', Algeria: '#0b8a3d',
  Peru: '#c8102e', Chile: '#1f4ea1', 'Costa Rica': '#1f4ea1', Panama: '#c8102e',
  Jamaica: '#0b8a3d', Norway: '#1f4ea1', Sweden: '#1f6fb0', Austria: '#c8102e',
  Serbia: '#c8102e', Turkey: '#c8102e', Greece: '#0b4ea2', Ukraine: '#1f6fb0',
  'New Zealand': '#222730', Wales: '#c8102e', Scotland: '#10489c', Paraguay: '#c8102e',
  'Bosnia & Herzegovina': '#1a4c9e', 'Bosnia and Herzegovina': '#1a4c9e',
  'Bosnia-Herzegovina': '#1a4c9e', Bosnia: '#1a4c9e',
}

// Secondary kit / flag colour per nation, to show each team in its two main
// colours (e.g. Argentina light-blue + white, Switzerland red + white).
const COLORS2: Record<string, string> = {
  Argentina: '#ffffff', Nigeria: '#ffffff', France: '#ef4135', Senegal: '#fdef42',
  Brazil: '#ffdf00', 'South Korea': '#cd2e3a', Spain: '#ffc400', Morocco: '#006233',
  Germany: '#dd0000', Japan: '#bc002d', Portugal: '#0a6b2e', Croatia: '#ffffff',
  Netherlands: '#ffffff', Mexico: '#ce1126', England: '#ffffff', Ecuador: '#ffdd00',
  Belgium: '#f3c300', USA: '#b31942', 'United States': '#b31942', Italy: '#ffffff',
  Canada: '#ffffff', Uruguay: '#ffffff', Colombia: '#003893', Switzerland: '#ffffff',
  Denmark: '#ffffff', Poland: '#ffffff', Australia: '#ffcd00', Qatar: '#ffffff',
  'Saudi Arabia': '#ffffff', Iran: '#ffffff', Ghana: '#fcd116', Cameroon: '#fcd116',
  'Ivory Coast': '#009e60', Tunisia: '#ffffff', Egypt: '#ffffff', Algeria: '#ffffff',
  Peru: '#ffffff', Chile: '#d52b1e', 'Costa Rica': '#d52b1e', Panama: '#0038a8',
  Jamaica: '#fed100', Norway: '#ba0c2f', Sweden: '#fecb00', Austria: '#ffffff',
  Serbia: '#ffffff', Turkey: '#ffffff', Greece: '#ffffff', Ukraine: '#ffd500',
  'New Zealand': '#ffffff', Wales: '#ffffff', Scotland: '#ffffff', Paraguay: '#0038a8',
  'Bosnia & Herzegovina': '#ffcd00', 'Bosnia and Herzegovina': '#ffcd00',
  'Bosnia-Herzegovina': '#ffcd00', Bosnia: '#ffcd00',
}

export function teamColor(name: string | null | undefined): string {
  if (!name || name === 'TBD') return '#7b88a6'
  return COLORS[name] ?? '#3a59a8'
}

/** A team's two main colours [primary, secondary]. Falls back to the primary
 * twice (a flat band) when no secondary is known. */
export function teamColors(name: string | null | undefined): [string, string] {
  const primary = teamColor(name)
  if (!name || name === 'TBD') return [primary, '#9aa4bd']
  return [primary, COLORS2[name] ?? primary]
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  )
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Deterministic, distinct gradient per player (for avatars).
// FNV-1a hash so even near-identical seeds (u2/u3…) get well-spread hues.
export function avatarGradient(seed: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const hue = Math.abs(h) % 360
  return `linear-gradient(135deg, hsl(${hue} 62% 52%), hsl(${(hue + 42) % 360} 64% 42%))`
}
