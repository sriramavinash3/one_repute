import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public')
const outFile = join(outDir, 'og-image.png')
const LOGO_PATH = join(__dirname, '..', 'src', 'assets', 'logo.png')

const WIDTH = 1200
const HEIGHT = 630
const PAD = 60

function decodePng(path) {
  const b = readFileSync(path)
  let pos = 8
  const idat = []
  let w = 0
  let h = 0
  let interlace = 0
  while (pos < b.length) {
    const len = b.readUInt32BE(pos)
    const type = b.toString('ascii', pos + 4, pos + 8)
    if (type === 'IHDR') {
      w = b.readUInt32BE(pos + 8)
      h = b.readUInt32BE(pos + 12)
      interlace = b[pos + 20]
    }
    if (type === 'IDAT') idat.push(b.slice(pos + 8, pos + 8 + len))
    pos += 12 + len
  }
  if (interlace !== 0) throw new Error(`${path}: interlaced PNG not supported`)

  const inflated = inflateSync(Buffer.concat(idat))
  const stride = w * 4
  const out = Buffer.alloc(h * stride)

  function paeth(a, b, c) {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }

  for (let y = 0; y < h; y++) {
    const ft = inflated[y * (stride + 1)]
    const row = inflated.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = out.slice(y * stride, (y + 1) * stride)
    for (let x = 0; x < w; x++) {
      const i = x * 4
      for (let c = 0; c < 4; c++) {
        const a = x > 0 ? cur[i + c - 4] : 0
        const b2 = y > 0 ? out[(y - 1) * stride + i + c] : 0
        const cc = x > 0 && y > 0 ? out[(y - 1) * stride + i + c - 4] : 0
        let v = row[i + c]
        if (ft === 1) v = (v + a) & 255
        else if (ft === 2) v = (v + b2) & 255
        else if (ft === 3) v = (v + Math.floor((a + b2) / 2)) & 255
        else if (ft === 4) v = (v + paeth(a, b2, cc)) & 255
        cur[i + c] = v
      }
    }
  }
  return { w, h, data: out }
}

function cropContent(img) {
  const { w, h, data } = img
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w * 4 + x * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const cropped = Buffer.alloc(cw * ch * 4)
  for (let y = 0; y < ch; y++) {
    data.copy(cropped, y * cw * 4, (minY + y) * w * 4 + minX * 4, (minY + y) * w * 4 + (minX + cw) * 4)
  }
  return { w: cw, h: ch, data: cropped }
}

function composeOnWhite(src, outW, outH, dst) {
  const sx = src.w / outW
  const sy = src.h / outH
  for (let oy = 0; oy < outH; oy++) {
    const y0 = oy * sy
    const y1 = (oy + 1) * sy
    const iy0 = Math.floor(y0)
    const iy1 = Math.min(Math.ceil(y1), src.h)
    for (let ox = 0; ox < outW; ox++) {
      const x0 = ox * sx
      const x1 = (ox + 1) * sx
      const ix0 = Math.floor(x0)
      const ix1 = Math.min(Math.ceil(x1), src.w)
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let iy = iy0; iy < iy1; iy++) {
        const wy = Math.min(iy + 1, y1) - Math.max(iy, y0)
        if (wy <= 0) continue
        for (let ix = ix0; ix < ix1; ix++) {
          const wx = Math.min(ix + 1, x1) - Math.max(ix, x0)
          if (wx <= 0) continue
          const w = wx * wy
          const si = iy * src.w * 4 + ix * 4
          const al = src.data[si + 3] / 255
          r += src.data[si] * al * w
          g += src.data[si + 1] * al * w
          b += src.data[si + 2] * al * w
          a += al * w
        }
      }
      const di = (oy * outW + ox) * 3
      const inv = 1 - Math.min(1, a)
      dst[di] = Math.round(r + 255 * inv)
      dst[di + 1] = Math.round(g + 255 * inv)
      dst[di + 2] = Math.round(b + 255 * inv)
    }
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(w, h, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const stride = w * 3
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const logo = cropContent(decodePng(LOGO_PATH))
const scale = Math.min((WIDTH - PAD * 2) / logo.w, (HEIGHT - PAD * 2) / logo.h)
const outW = Math.round(logo.w * scale)
const outH = Math.round(logo.h * scale)
const offsetX = Math.round((WIDTH - outW) / 2)
const offsetY = Math.round((HEIGHT - outH) / 2)

const canvas = Buffer.alloc(WIDTH * HEIGHT * 3, 255)
const temp = Buffer.alloc(outW * outH * 3)
composeOnWhite(logo, outW, outH, temp)
for (let y = 0; y < outH; y++) {
  temp.copy(canvas, ((offsetY + y) * WIDTH + offsetX) * 3, y * outW * 3, (y + 1) * outW * 3)
}

const png = encodePng(WIDTH, HEIGHT, canvas)

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, png)
console.log(
  `Generated ${outFile} (${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(1)} KB, ` +
    `logo drawn at ${outW}x${outH}px offset ${offsetX},${offsetY})`
)