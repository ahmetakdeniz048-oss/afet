import * as THREE from 'three'
import { Builder, solid } from './builder'

export const TIMELINE_LIMIT = 8
const STORAGE_KEY = 'afet.timeline.v1'
const MAX_JSON_CHARS = 1_900_000
const MAX_PHOTO_BYTES = 160 * 1024
const MAX_PHOTO_DATA_CHARS = 225_000

export type TimelinePoint = { id: string; date: string; title: string; description: string; photo?: string }

const STARTER: TimelinePoint[] = [
  { id: '1939-erzincan', date: '1939', title: 'Erzincan Depremi', description: 'Doğu Anadolu’da ağır yıkıma yol açan deprem, afetlere hazırlık ve güvenli yapılaşmanın önemini gösterdi.' },
  { id: '1999-marmara', date: '1999', title: 'Marmara Depremi', description: 'Kocaeli ve çevresindeki büyük kayıplar, yapı güvenliği ve toplum temelli hazırlık çalışmalarını gündeme taşıdı.' },
  { id: '2011-van', date: '2011', title: 'Van Depremleri', description: 'Van ve Erciş’teki depremlerin ardından arama-kurtarma, barınma ve kış koşullarında yardım öne çıktı.' },
  { id: '2020-izmir', date: '2020', title: 'İzmir Depremi', description: 'Ege Denizi’ndeki deprem ve kıyıda hissedilen tsunami etkisi, çoklu tehlikelere hazırlığı hatırlattı.' },
  { id: '2023-kahramanmaraş', date: '2023', title: 'Kahramanmaraş Depremleri', description: '6 Şubat depremleri geniş bir bölgeyi etkiledi; koordinasyon, güvenli yapı ve aile planı kritik önem kazandı.' },
  { id: 'Bugün', date: 'Bugün', title: 'Hazırlık ve Dayanışma', description: 'Aile planını güncelleyin; buluşma yeri belirleyin, acil çantanızı kontrol edin ve resmi duyuruları izleyin.' },
]

const clone = (items: TimelinePoint[]) => items.map(item => ({ ...item }))
const bounded = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `time-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function starterTimeline(): TimelinePoint[] { return clone(STARTER) }

export function normalizeTimeline(value: unknown): TimelinePoint[] {
  const raw = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { entries?: unknown }).entries) ? (value as { entries: unknown[] }).entries : null
  if (!raw || raw.length === 0 || raw.length > TIMELINE_LIMIT) throw new Error(`Zaman tünelinde 1–${TIMELINE_LIMIT} arası pano bulunmalıdır.`)
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`${index + 1}. zaman noktası geçerli değil.`)
    const o = item as Record<string, unknown>
    const photo = typeof o.photo === 'string' && o.photo.startsWith('data:image/jpeg;base64,') ? o.photo : undefined
    if (typeof o.photo === 'string' && o.photo && (!photo || photo.length > MAX_PHOTO_DATA_CHARS)) throw new Error(`${index + 1}. panonun fotoğrafı JPEG olmalı ve sıkıştırılmış boyutu sınırı aşmamalı.`)
    return {
      id: bounded(o.id, 80) || `time-${index}-${makeId()}`,
      date: bounded(o.date, 40),
      title: bounded(o.title, 100),
      description: bounded(o.description, 500),
      ...(photo ? { photo } : {}),
    }
  })
}

export class TimelineStore {
  load(): TimelinePoint[] {
    try {
      const value = localStorage.getItem(STORAGE_KEY)
      if (value) return normalizeTimeline(JSON.parse(value))
      const starter = starterTimeline(); this.save(starter); return starter
    } catch {
      const starter = starterTimeline()
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries: starter })) } catch { /* keep the usable in-memory defaults */ }
      return starter
    }
  }

  save(entries: TimelinePoint[]): void {
    const normalized = normalizeTimeline(entries)
    const payload = JSON.stringify({ version: 1, entries: normalized })
    if (payload.length > MAX_JSON_CHARS) throw new Error('Zaman tüneli bu tarayıcının yerel depolama sınırını aşıyor. Daha küçük fotoğraflar kullanın.')
    try { localStorage.setItem(STORAGE_KEY, payload) }
    catch { throw new Error('Zaman tüneli bu cihazın yerel depolama alanına kaydedilemedi. Depolama alanında yer açıp yeniden deneyin.') }
  }

  export(entries: TimelinePoint[]): string {
    return JSON.stringify({ version: 1, entries: normalizeTimeline(entries) }, null, 2)
  }

  import(json: string): TimelinePoint[] {
    if (json.length > MAX_JSON_CHARS) throw new Error('JSON dosyası yerel depolama sınırını aşıyor.')
    let value: unknown
    try { value = JSON.parse(json) } catch { throw new Error('Dosya geçerli bir JSON değil.') }
    if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) throw new Error('Bu dosyanın zaman tüneli sürümü desteklenmiyor.')
    return normalizeTimeline(value)
  }
}

export async function compressTimelinePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Zaman panolarına yalnızca fotoğraf yükleyebilirsiniz.')
  if (file.size > 12 * 1024 * 1024) throw new Error('Fotoğraf 12 MB sınırını aşıyor. Daha küçük bir dosya seçin.')
  let bitmap: ImageBitmap | null = null
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('Bu fotoğraf açılamadı. JPEG, PNG veya WebP deneyin.') }
  try {
    const maxEdge = 1000
    let scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Fotoğraf sıkıştırma alanı açılamadı.')
    for (let attempt = 0; attempt < 12; attempt++) {
      canvas.width = Math.max(240, Math.round(bitmap.width * scale))
      canvas.height = Math.max(160, Math.round(bitmap.height * scale))
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const quality = Math.max(0.48, 0.78 - Math.max(0, attempt - 3) * 0.06)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= MAX_PHOTO_BYTES) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Fotoğraf verisi okunamadı.')); reader.readAsDataURL(blob)
        })
        if (dataUrl.length <= MAX_PHOTO_DATA_CHARS) return dataUrl
      }
      scale *= 0.84
    }
    throw new Error('Fotoğraf yeterince küçültülemedi. Daha küçük bir görüntü deneyin.')
  } finally { bitmap.close() }
}

type Board = { root: THREE.Group; texture: THREE.CanvasTexture; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; token: number }

/** Duvara sıfır monte edilen, çarpışma oluşturmayan kronolojik sergi pano sırası. */
export class TimelineWall {
  private boards: Board[] = []
  constructor(private readonly b: Builder) {}

  build(): void {
    const width = 4.08, height = 2.30
    const centers = Array.from({ length: TIMELINE_LIMIT }, (_, i) => -15.4 + i * 4.4)
    const frame = solid(0x253344, { rough: 0.52, metal: 0.25 })
    const edge = solid(0x0e7490, { rough: 0.55, emissive: 0x0e7490, ei: 0.12 })
    centers.forEach((x, index) => {
      const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 432
      const ctx = canvas.getContext('2d')!
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
      const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
      const root = new THREE.Group(); root.position.set(x, 2.30, -13.72); this.b.root.add(root)
      this.b.box(0, 0, 0, width, height, 0.12, frame, { parent: root, cast: true })
      this.b.box(0, -height / 2 + 0.035, 0.067, width - 0.12, 0.05, 0.02, edge, { parent: root })
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.12, height - 0.12), material)
      screen.position.z = 0.066; root.add(screen)
      const proxy = this.b.proxy(root, width, height, 0.1, 0); proxy.position.z = 0.075
      this.b.interactive(root, { kind: 'timeline_point', name: `Tarihsel zaman tüneli panosu ${index + 1}`, pointIndex: index })
      root.visible = false
      this.boards.push({ root, texture, canvas, ctx, token: 0 })
    })

    // Dört düşük güçlü, gölgesiz spot ışık: duvara yönelir, ziyaretçi koridoruna taşmaz.
    for (const x of [-12, -4, 4, 12]) {
      const housing = this.b.box(x, 4.72, -11.4, 0.42, 0.1, 0.32, frame, { cast: false })
      housing.rotation.x = -0.12
      const target = new THREE.Object3D(); target.position.set(x, 2.35, -13.62); this.b.root.add(target)
      const spot = new THREE.SpotLight(0xffe6bb, 8, 7, Math.PI / 5, 0.72, 2)
      spot.position.set(x, 4.65, -11.4); spot.target = target; spot.castShadow = false; this.b.root.add(spot)
    }
  }

  refresh(entries: TimelinePoint[]): void {
    this.boards.forEach((board, index) => {
      const entry = entries[index]
      const token = ++board.token
      board.root.visible = !!entry
      if (!entry) return
      board.root.userData.name = `${entry.date || 'Tarihi belirtilmedi'} — ${entry.title || 'Başlıksız pano'}`
      board.root.userData.pointIndex = index
      paintBoard(board, entry, index)
      if (entry.photo) {
        const image = new Image()
        image.onload = () => {
          if (board.token !== token) return
          const box = { x: 492, y: 140, w: 242, h: 242 }
          const scale = Math.min(box.w / image.width, box.h / image.height)
          const w = image.width * scale, h = image.height * scale
          board.ctx.fillStyle = '#f8fafc'; board.ctx.fillRect(box.x, box.y, box.w, box.h)
          board.ctx.drawImage(image, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h)
          board.ctx.strokeStyle = '#38bdf8'; board.ctx.lineWidth = 5; board.ctx.strokeRect(box.x, box.y, box.w, box.h)
          board.texture.needsUpdate = true
        }
        image.src = entry.photo
      }
      board.texture.needsUpdate = true
    })
  }

  dispose(): void { this.boards.forEach(board => board.texture.dispose()); this.boards.length = 0 }
}

function paintBoard(board: Board, entry: TimelinePoint, index: number): void {
  const { ctx: g, canvas } = board
  const w = canvas.width, h = canvas.height
  const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#102137'); grad.addColorStop(1, '#153d43')
  g.fillStyle = grad; g.fillRect(0, 0, w, h)
  g.fillStyle = '#0e7490'; g.fillRect(0, 0, 14, h)
  g.fillStyle = '#a7f3d0'; g.font = '700 24px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(`ZAMAN TÜNELİ  /  ${String(index + 1).padStart(2, '0')}`, 34, 46)
  g.fillStyle = '#fbbf24'; g.font = '800 38px system-ui, sans-serif'; g.fillText(entry.date || 'DÖNEM EKLEYİN', 34, 104)
  g.fillStyle = '#f8fafc'; g.font = '700 31px system-ui, sans-serif'; wrapCanvasText(g, entry.title || 'Başlık ekleyin', 34, 158, 420, 37, 2)
  g.fillStyle = '#cbd5e1'; g.font = '400 21px system-ui, sans-serif'; wrapCanvasText(g, entry.description || 'Kısa açıklamanızı Düzenleyici bölümünden yazın.', 34, 245, 420, 29, 4)
  g.fillStyle = '#172033'; g.fillRect(486, 134, 254, 254)
  g.strokeStyle = 'rgba(125,211,252,.8)'; g.lineWidth = 3; g.strokeRect(492, 140, 242, 242)
  if (!entry.photo) {
    g.fillStyle = '#94a3b8'; g.font = '700 20px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('FOTOĞRAF', 613, 246); g.fillText('ALANI BOŞ', 613, 276)
    g.fillStyle = '#64748b'; g.font = '400 15px system-ui, sans-serif'; g.fillText('Düzenleyiciden görsel ekleyin', 613, 314)
  }
}

function wrapCanvasText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
  const words = text.split(/\s+/).filter(Boolean)
  let line = '', lineCount = 0
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && g.measureText(next).width > maxWidth) {
      g.fillText(line, x, y + lineCount * lineHeight); line = word; lineCount++
      if (lineCount >= maxLines) break
    } else line = next
  }
  if (line && lineCount < maxLines) g.fillText(line, x, y + lineCount * lineHeight)
}
