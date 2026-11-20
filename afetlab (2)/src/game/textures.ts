import * as THREE from 'three'

/**
 * Prosedürel PBR doku kümeleri (renk + normal + pürüzlülük). Tamamı tuval üzerinde üretilir,
 * dış dosya gerekmez. Dokular dünya ölçeğinde döşenir (bkz. world/builder.ts, `scaleUV`).
 */

export type TexKind =
  | 'concrete' | 'tile' | 'plaster' | 'ceiling' | 'wood' | 'metal' | 'asphalt' | 'grass'
  | 'hazard' | 'carpet' | 'brick' | 'rubber' | 'darkwall'

export type TexSet = { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture; metersPerTile: number }

// --- gürültü ---
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 100000) / 100000
}
function vnoise(x: number, y: number, s: number, period: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const w = (a: number, b: number) => hash(((a % period) + period) % period, ((b % period) + period) % period, s)
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
/** Döşenebilir fbm (0..1). `size` piksel boyutu, `freq` taban frekans (tam sayı). */
function fbm(px: number, py: number, size: number, freq: number, oct: number, seed: number): number {
  let amp = 0.5, sum = 0, f = freq, norm = 0
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise((px / size) * f, (py / size) * f, seed + o * 17, f)
    norm += amp; amp *= 0.5; f *= 2
  }
  return sum / norm
}

type Px = { r: number; g: number; b: number; h: number; rough: number }
type Gen = (x: number, y: number, size: number, out: Px) => void

const clamp = (v: number, a = 0, b = 255) => Math.max(a, Math.min(b, v))

const GENS: Record<TexKind, { gen: Gen; meters: number; normalStrength: number }> = {
  concrete: {
    meters: 2.4, normalStrength: 2.2,
    gen(x, y, s, o) {
      const n = fbm(x, y, s, 4, 5, 1), m = fbm(x, y, s, 16, 3, 9)
      const stain = fbm(x, y, s, 2, 3, 33)
      const v = 128 + (n - 0.5) * 60 + (m - 0.5) * 22 - stain * stain * 38
      o.r = v; o.g = v + 1; o.b = v + 3
      // ince çatlak/ derz çizgileri 1.2 m'de bir
      const gx = Math.abs(((x / s) * 2) % 1 - 0.5), gy = Math.abs(((y / s) * 2) % 1 - 0.5)
      const seam = Math.min(gx, gy) > 0.495 ? 1 : 0
      o.r -= seam * 40; o.g -= seam * 40; o.b -= seam * 40
      o.h = n * 0.6 + m * 0.4 - seam * 0.7
      o.rough = clamp(0.55 + (1 - n) * 0.35 + seam * 0.3, 0, 1) * 255
    },
  },
  tile: {
    meters: 1.2, normalStrength: 1.2,
    gen(x, y, s, o) {
      const tx = Math.floor((x / s) * 2), ty = Math.floor((y / s) * 2)
      const lx = ((x / s) * 2) % 1, ly = ((y / s) * 2) % 1
      const edge = Math.min(lx, 1 - lx, ly, 1 - ly)
      const grout = edge < 0.012 ? 1 : edge < 0.02 ? 0.4 : 0
      const tone = hash(tx, ty, 5)
      const n = fbm(x, y, s, 8, 3, 21)
      const base = 176 + tone * 16 + (n - 0.5) * 14
      const v = base * (1 - grout * 0.55)
      o.r = v; o.g = v + 1; o.b = v + 3
      o.h = grout > 0 ? 0 : 0.8 + n * 0.1
      o.rough = grout > 0 ? 235 : clamp(75 + (1 - n) * 70 + tone * 20)
    },
  },
  plaster: {
    meters: 2.0, normalStrength: 0.8,
    gen(x, y, s, o) {
      const n = fbm(x, y, s, 12, 4, 3), b = fbm(x, y, s, 3, 3, 7)
      const v = 218 + (n - 0.5) * 12 + (b - 0.5) * 8
      o.r = v; o.g = v - 2; o.b = v - 8
      o.h = n
      o.rough = 215
    },
  },
  darkwall: {
    meters: 2.0, normalStrength: 0.8,
    gen(x, y, s, o) {
      const n = fbm(x, y, s, 12, 4, 13), b = fbm(x, y, s, 3, 3, 17)
      const v = 62 + (n - 0.5) * 12 + (b - 0.5) * 10
      o.r = v * 0.85; o.g = v * 0.95; o.b = v * 1.15
      o.h = n
      o.rough = 205
    },
  },
  ceiling: {
    meters: 1.2, normalStrength: 1.4,
    gen(x, y, s, o) {
      const lx = ((x / s) * 2) % 1, ly = ((y / s) * 2) % 1
      const edge = Math.min(lx, 1 - lx, ly, 1 - ly)
      const n = fbm(x, y, s, 24, 3, 4)
      const dots = hash(Math.floor(x / 5), Math.floor(y / 5), 2) > 0.55 && ((x % 5) < 2 && (y % 5) < 2) ? 1 : 0
      let v = 236 + (n - 0.5) * 12 - dots * 38
      let h = 0.7 + n * 0.1 - dots * 0.5
      if (edge < 0.018) { v = 90; h = 0 } else if (edge < 0.04) { v *= 0.9; h = 0.4 }
      o.r = v; o.g = v; o.b = v - 3
      o.h = h; o.rough = 225
    },
  },
  wood: {
    meters: 1.0, normalStrength: 1.6,
    gen(x, y, s, o) {
      // uzun ahşap damarı: y ekseninde gerilmiş gürültü
      const n = fbm(x * 0.12, y, s, 3, 5, 41)
      const ring = Math.sin((x / s) * 18 + fbm(x, y, s, 4, 3, 5) * 9) * 0.5 + 0.5
      const t = n * 0.6 + ring * 0.4
      o.r = 120 + t * 60; o.g = 78 + t * 38; o.b = 44 + t * 22
      const plank = Math.abs(((y / s) * 3) % 1 - 0.5) > 0.488 ? 1 : 0
      o.r *= 1 - plank * 0.55; o.g *= 1 - plank * 0.55; o.b *= 1 - plank * 0.55
      o.h = t * 0.5 - plank * 0.7
      o.rough = clamp(120 + (1 - t) * 60)
    },
  },
  metal: {
    meters: 1.0, normalStrength: 0.6,
    gen(x, y, s, o) {
      const n = fbm(x * 0.05, y, s, 8, 4, 51), m = fbm(x, y, s, 6, 3, 61)
      const v = 150 + (n - 0.5) * 50 + (m - 0.5) * 18
      o.r = v; o.g = v + 2; o.b = v + 6
      o.h = n * 0.4
      o.rough = clamp(95 + (1 - n) * 70)
    },
  },
  asphalt: {
    meters: 3.0, normalStrength: 2.4,
    gen(x, y, s, o) {
      const n = fbm(x, y, s, 32, 4, 71), m = fbm(x, y, s, 4, 3, 72)
      const grain = hash(x, y, 3)
      const v = 52 + (n - 0.5) * 30 + (grain - 0.5) * 34 + (m - 0.5) * 18
      o.r = v; o.g = v; o.b = v + 2
      o.h = n * 0.5 + grain * 0.5
      o.rough = clamp(190 + grain * 50)
    },
  },
  grass: {
    meters: 2.5, normalStrength: 1.6,
    gen(x, y, s, o) {
      const n = fbm(x, y, s, 24, 4, 81), m = fbm(x, y, s, 4, 3, 82)
      const g = hash(x, y, 7)
      o.r = 56 + n * 30 + g * 16; o.g = 98 + n * 48 + g * 20 + m * 14; o.b = 40 + n * 16
      o.h = n * 0.7 + g * 0.3
      o.rough = 230
    },
  },
  hazard: {
    meters: 0.8, normalStrength: 1.0,
    gen(x, y, s, o) {
      const d = (((x + y) / s) * 8) % 1
      const stripe = d < 0.5 ? 1 : 0
      const n = fbm(x, y, s, 24, 3, 91)
      const wear = n > 0.62 ? (n - 0.62) * 3.5 : 0
      const base = stripe ? [236, 190, 24] : [26, 26, 28]
      o.r = base[0] * (1 - wear * 0.4) + wear * 40; o.g = base[1] * (1 - wear * 0.4) + wear * 36; o.b = base[2] * (1 - wear * 0.4) + wear * 30
      o.h = n * 0.5; o.rough = clamp(150 + wear * 100)
    },
  },
  carpet: {
    meters: 1.2, normalStrength: 1.8,
    gen(x, y, s, o) {
      const g = hash(x, y, 11), n = fbm(x, y, s, 16, 3, 101)
      const v = 70 + g * 26 + (n - 0.5) * 16
      o.r = v * 0.9; o.g = v * 0.98; o.b = v * 1.12
      o.h = g * 0.7 + n * 0.3; o.rough = 240
    },
  },
  brick: {
    meters: 1.6, normalStrength: 2.4,
    gen(x, y, s, o) {
      const rows = 8, cols = 4
      const ry = Math.floor((y / s) * rows)
      const off = ry % 2 ? 0.5 : 0
      const u = ((x / s) * cols + off) % 1, v = ((y / s) * rows) % 1
      const bx = Math.floor((x / s) * cols + off)
      const mortar = u < 0.06 || v < 0.1
      const t = hash(bx, ry, 13), n = fbm(x, y, s, 24, 3, 111)
      if (mortar) { const m = 150 + n * 30; o.r = m; o.g = m - 2; o.b = m - 6; o.h = 0; o.rough = 245 }
      else { o.r = 130 + t * 40 + n * 20; o.g = 60 + t * 20 + n * 10; o.b = 48 + t * 14; o.h = 0.6 + n * 0.3; o.rough = 200 }
    },
  },
  rubber: {
    meters: 1.0, normalStrength: 1.4,
    gen(x, y, s, o) {
      const n = fbm(x, y, s, 32, 3, 121)
      const coin = Math.sin((x / s) * 40) * Math.sin((y / s) * 40) > 0.6 ? 1 : 0
      const v = 30 + n * 14 + coin * 10
      o.r = v; o.g = v; o.b = v + 1
      o.h = 0.5 + coin * 0.4 + n * 0.1; o.rough = 220
    },
  },
}

function build(kind: TexKind, size: number): TexSet {
  const { gen, meters, normalStrength } = GENS[kind]
  const col = document.createElement('canvas'); col.width = col.height = size
  const nor = document.createElement('canvas'); nor.width = nor.height = size
  const rgh = document.createElement('canvas'); rgh.width = rgh.height = size
  const cctx = col.getContext('2d')!, nctx = nor.getContext('2d')!, rctx = rgh.getContext('2d')!
  const cimg = cctx.createImageData(size, size), nimg = nctx.createImageData(size, size), rimg = rctx.createImageData(size, size)
  const height = new Float32Array(size * size)
  const p: Px = { r: 0, g: 0, b: 0, h: 0, rough: 200 }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      gen(x, y, size, p)
      const i = (y * size + x) * 4
      cimg.data[i] = clamp(p.r); cimg.data[i + 1] = clamp(p.g); cimg.data[i + 2] = clamp(p.b); cimg.data[i + 3] = 255
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = clamp(p.rough); rimg.data[i + 3] = 255
      height[y * size + x] = p.h
    }
  }
  // yükseklikten normal haritası (Sobel, döşenebilir)
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))
      let nx = -dx * normalStrength, ny = -dy * normalStrength, nz = 1
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l
      const i = (y * size + x) * 4
      nimg.data[i] = (nx * 0.5 + 0.5) * 255; nimg.data[i + 1] = (ny * 0.5 + 0.5) * 255; nimg.data[i + 2] = (nz * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255
    }
  }
  cctx.putImageData(cimg, 0, 0); nctx.putImageData(nimg, 0, 0); rctx.putImageData(rimg, 0, 0)
  const mk = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.anisotropy = 8
    t.generateMipmaps = true
    return t
  }
  return { map: mk(col, true), normalMap: mk(nor, false), roughnessMap: mk(rgh, false), metersPerTile: meters }
}

const cache = new Map<TexKind, TexSet>()

export function getTex(kind: TexKind, size = 512): TexSet {
  let t = cache.get(kind)
  if (!t) { t = build(kind, size); cache.set(kind, t) }
  return t
}

export const ALL_KINDS: TexKind[] = ['concrete', 'tile', 'plaster', 'darkwall', 'ceiling', 'wood', 'metal', 'asphalt', 'grass', 'hazard', 'carpet', 'brick', 'rubber']

/** Yükleme çubuğu ilerlemesi için tüm dokuları parça parça üretir. */
export async function prebuildTextures(size: number, onProgress: (f: number) => void): Promise<void> {
  for (let i = 0; i < ALL_KINDS.length; i++) {
    getTex(ALL_KINDS[i], size)
    onProgress((i + 1) / ALL_KINDS.length)
    await new Promise(r => setTimeout(r, 0))
  }
}

// ---------- tuval etiketleri / posterler ----------

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d')!, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  return t
}

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif'
export const font = (px: number, weight = 700) => `${weight} ${px}px ${FONT}`

export function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  const words = text.split(' ')
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh } else line = test
  }
  if (line) { g.fillText(line, x, y); y += lh }
  return y
}

/** Duvar posteri: başlık + madde listesi. */
export function posterTex(title: string, lines: string[], accent = '#0ea5e9', icon?: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  return canvasTex(768, 1024, (g, w, h) => {
    g.fillStyle = '#f8fafc'; g.fillRect(0, 0, w, h)
    g.fillStyle = accent; g.fillRect(0, 0, w, 150)
    g.fillStyle = '#fff'; g.font = font(54); g.textAlign = 'left'; g.textBaseline = 'alphabetic'
    wrapText(g, title, 40, 80, w - 80, 56)
    g.fillStyle = 'rgba(15,23,42,0.08)'; g.fillRect(0, 150, w, 8)
    if (icon) icon(g, w, h)
    g.fillStyle = '#0f172a'; g.font = font(34, 600)
    let y = 560
    for (const l of lines) { y = wrapText(g, '•  ' + l, 44, y, w - 88, 44) + 10 }
    g.fillStyle = accent; g.fillRect(0, h - 40, w, 40)
    g.fillStyle = '#fff'; g.font = font(22); g.fillText('SANAL AFET EĞİTİM MERKEZİ', 40, h - 14)
  })
}

export function signTex(text: string, bg: string, fg = '#fff', sub?: string, w = 512, h = 256): THREE.CanvasTexture {
  return canvasTex(w, h, (g, ww, hh) => {
    g.fillStyle = bg; g.fillRect(0, 0, ww, hh)
    g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, ww - 20, hh - 20)
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = font(sub ? 62 : 74); g.fillText(text, ww / 2, sub ? hh * 0.4 : hh / 2)
    if (sub) { g.font = font(34, 600); g.fillStyle = '#fef08a'; g.fillText(sub, ww / 2, hh * 0.76) }
  })
}
