// Dependency-free confetti burst using the Web Animations API.
// Respects prefers-reduced-motion.

const COLORS = ['#f5b301', '#07a06a', '#2b4ea8', '#e0464a', '#0bbd7e', '#ffffff']

export function fireConfetti(count = 90): void {
  if (typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden'
  document.body.appendChild(container)

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div')
    const size = 6 + Math.floor(seededRandom(i) * 8)
    const left = seededRandom(i * 7.3) * 100
    const color = COLORS[i % COLORS.length]
    const rounded = i % 3 === 0
    piece.style.cssText = `position:absolute;top:-20px;left:${left}vw;width:${size}px;height:${
      size * (rounded ? 1 : 1.6)
    }px;background:${color};border-radius:${rounded ? '50%' : '2px'};opacity:0.95`
    container.appendChild(piece)

    const driftX = (seededRandom(i * 2.1) - 0.5) * 220
    const duration = 1600 + seededRandom(i * 3.7) * 1600
    const rotate = (seededRandom(i * 5.9) - 0.5) * 1080

    piece.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${driftX}px, 105vh) rotate(${rotate}deg)`,
          opacity: 0.9,
        },
      ],
      { duration, easing: 'cubic-bezier(.2,.6,.4,1)', delay: seededRandom(i) * 250 },
    )
  }

  window.setTimeout(() => container.remove(), 3600)
}

// Tiny deterministic pseudo-random so we don't need Math.random at module load.
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 99.13 + 4.21) * 43758.5453
  return x - Math.floor(x)
}
