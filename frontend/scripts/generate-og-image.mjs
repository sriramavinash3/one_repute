import { Resvg } from '@resvg/resvg-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public')
const outFile = join(outDir, 'og-image.png')

const LOGO_PATH =
  'M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z'

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#312e81"/>
      <stop offset="0.55" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#6366f1"/>
    </linearGradient>
    <radialGradient id="glow-tl" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow-br" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#a5b4fc" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#a5b4fc" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>

  <circle cx="140" cy="90" r="340" fill="url(#glow-tl)"/>
  <circle cx="1090" cy="590" r="380" fill="url(#glow-br)"/>

  <rect x="600" y="0" width="600" height="1" fill="#ffffff" fill-opacity="0.04"/>
  <rect x="0" y="315" width="1200" height="1" fill="#ffffff" fill-opacity="0.04"/>
  <rect x="600" y="0" width="1" height="630" fill="#ffffff" fill-opacity="0.04"/>

  <g transform="translate(542,96) scale(2.4)">
    <path fill="#ffffff" d="${LOGO_PATH}"/>
  </g>

  <text x="600" y="345" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="76" font-weight="800" fill="#ffffff">One Repute</text>

  <text x="600" y="408" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="34" font-weight="500" fill="#c7d2fe">AI-Powered Google Review Management</text>

  <g>
    <rect x="462" y="452" width="276" height="58" rx="29" fill="#ffffff" fill-opacity="0.12"/>
    <text x="600" y="491" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="27" font-weight="600" fill="#e0e7ff">onerepute.com</text>
  </g>
</svg>`

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  background: '#312e81'
})

const png = resvg.render().asPng()

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, png)
console.log(`Generated ${outFile} (${(png.length / 1024).toFixed(1)} KB)`)
