import * as THREE from 'three'
import { Builder, solid } from './builder'
import { canvasTex, font, signTex } from './textures'
import { TimelineStore, TimelineWall } from './timeline'

export type ExhibitRecord = { id: string; name: string; type: string; createdAt: number; blob?: Blob }

type StoredRecord = Required<ExhibitRecord>
const DB_NAME = 'afet-egitim-sergi'
const STORE = 'media'
const MAX_FILE = 100 * 1024 * 1024

/** Yerel fotoğraf/video kütüphanesi ve sergi salonundaki ekran. Dosyalar IndexedDB'de cihazda kalır. */
export class ExhibitMedia {
  private screen!: THREE.Mesh
  private screenMaterial!: THREE.MeshBasicMaterial
  private defaultTexture!: THREE.Texture
  private dbPromise: Promise<IDBDatabase> | null = null
  private memory = new Map<string, StoredRecord>()
  private currentTexture: THREE.Texture | null = null
  private currentVideo: HTMLVideoElement | null = null
  private currentUrl: string | null = null
  private ready = false
  readonly timeline = new TimelineStore()
  private timelineWall: TimelineWall

  constructor(private readonly b: Builder) { this.timelineWall = new TimelineWall(b) }

  build(): void {
    const b = this.b
    const g = new THREE.Group(); g.position.set(9.1, 0, 3.7); b.root.add(g)
    const frame = solid(0x1f2937, { rough: 0.36, metal: 0.58 })
    const trim = solid(0x64748b, { rough: 0.32, metal: 0.72 })
    const title = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.42), new THREE.MeshStandardMaterial({ map: signTex('AFET SERGİSİ', '#0f3d48', '#fff', 'Fotoğraf ve video arşivi', 680, 180), roughness: 0.58 }))
    title.position.set(0, 3.38, 0.09); title.material.side = THREE.DoubleSide; g.add(title)

    b.box(0, 2.18, 0, 3.72, 2.28, 0.16, frame, { parent: g, cast: true })
    b.box(0, 2.18, 0.095, 3.5, 2.06, 0.045, solid(0x0b1018, { rough: 0.25, metal: 0.2 }), { parent: g })
    const fallback = canvasTex(1024, 576, (c, w, h) => {
      const grad = c.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#0f3040'); grad.addColorStop(1, '#1b6154'); c.fillStyle = grad; c.fillRect(0, 0, w, h)
      c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 2
      for (let x = 0; x < w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke() }
      for (let y = 0; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() }
      c.fillStyle = '#eafff8'; c.textAlign = 'center'; c.font = font(58); c.fillText('AFET EĞİTİM MERKEZİ', w / 2, h * 0.45)
      c.fillStyle = '#a7f3d0'; c.font = font(30); c.fillText('Fotoğraf veya videonuzu sergi ekranında gösterin', w / 2, h * 0.62)
      c.fillStyle = '#fff'; c.font = font(24); c.fillText('[E] SERGİ MEDYASINI YÖNET', w / 2, h * 0.82)
    })
    this.defaultTexture = fallback
    this.screenMaterial = new THREE.MeshBasicMaterial({ map: fallback, toneMapped: false, side: THREE.DoubleSide })
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(3.34, 1.88), this.screenMaterial)
    this.screen.position.set(0, 2.18, 0.126); g.add(this.screen)
    b.box(-1.15, 0.65, 0, 0.16, 1.3, 0.28, trim, { parent: g, cast: true })
    b.box(1.15, 0.65, 0, 0.16, 1.3, 0.28, trim, { parent: g, cast: true })
    b.box(0, 0.1, 0, 2.8, 0.2, 0.6, frame, { parent: g, cast: true })
    b.box(0, 0.23, 0.22, 2.45, 0.06, 0.025, solid(0x22c55e, { emissive: 0x16a34a, ei: 0.45 }), { parent: g })
    b.proxy(g, 4.2, 3.7, 1.0, 1.8)
    b.interactive(g, { kind: 'exhibit_media', name: 'Sergi fotoğraf ve video ekranı' })
    addExhibitFloorMark(b)
    this.timelineWall.build()
  }

  async init(): Promise<void> {
    try { await this.openDb(); this.ready = true } catch { this.ready = false }
    this.timelineWall.refresh(this.timeline.load())
  }

  refreshTimeline(entries: import('./timeline').TimelinePoint[]): void { this.timelineWall.refresh(entries) }

  async list(): Promise<ExhibitRecord[]> {
    if (!this.ready) return [...this.memory.values()].map(({ blob: _blob, ...meta }) => meta).sort((a, b) => b.createdAt - a.createdAt)
    const db = await this.openDb()
    const records = await new Promise<StoredRecord[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result as StoredRecord[])
      req.onerror = () => reject(req.error)
    })
    return records.map(({ blob: _blob, ...meta }) => meta).sort((a, b) => b.createdAt - a.createdAt)
  }

  async add(file: File): Promise<ExhibitRecord> {
    if (!file.type.startsWith('image/') && !['video/mp4', 'video/webm', 'video/ogg'].includes(file.type)) throw new Error('Yalnızca fotoğraf veya MP4/WebM video ekleyebilirsiniz.')
    if (file.size > MAX_FILE) throw new Error('Dosya 100 MB sınırını aşıyor. Daha küçük bir fotoğraf/video seçin.')
    const item: StoredRecord = { id: crypto.randomUUID(), name: file.name || 'Adsız medya', type: file.type, createdAt: Date.now(), blob: file }
    if (this.ready) {
      const db = await this.openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(item)
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
      })
    } else this.memory.set(item.id, item)
    const { blob: _blob, ...meta } = item
    return meta
  }

  async remove(id: string): Promise<void> {
    if (this.ready) {
      const db = await this.openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id)
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error)
      })
    } else this.memory.delete(id)
    if (this.currentId === id) this.clearCurrent()
  }

  private currentId: string | null = null
  async display(id: string): Promise<void> {
    const item = await this.get(id)
    if (!item) throw new Error('Bu medya artık bulunamıyor.')
    this.clearCurrent()
    const url = URL.createObjectURL(item.blob)
    this.currentUrl = url; this.currentId = id
    if (item.type.startsWith('image/')) {
      const image = new Image(); image.decoding = 'async'; image.src = url
      await image.decode()
      const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true
      this.currentTexture = texture; this.screenMaterial.map = texture; this.screenMaterial.needsUpdate = true
      return
    }
    const video = document.createElement('video')
    video.src = url; video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true; video.preload = 'auto'
    video.addEventListener('error', () => { /* unsupported codecs are surfaced by the manager's play() promise */ }, { once: true })
    this.currentVideo = video
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 2) { resolve(); return }
      video.addEventListener('loadeddata', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('Tarayıcı bu video biçimini oynatamıyor. MP4 veya WebM deneyin.')), { once: true })
      video.load()
    })
    await video.play()
    const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false
    this.currentTexture = texture; this.screenMaterial.map = texture; this.screenMaterial.needsUpdate = true
  }

  dispose(): void { this.clearCurrent(); this.defaultTexture.dispose(); this.timelineWall.dispose() }

  private async get(id: string): Promise<StoredRecord | undefined> {
    if (!this.ready) return this.memory.get(id)
    const db = await this.openDb()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result as StoredRecord | undefined)
      req.onerror = () => reject(req.error)
    })
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB kullanılamıyor.')); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('Medya deposu açılamadı.'))
      req.onblocked = () => reject(new Error('Medya deposu başka bir sekmede güncelleniyor.'))
    })
    return this.dbPromise
  }

  private clearCurrent(): void {
    if (this.currentVideo) { this.currentVideo.pause(); this.currentVideo.removeAttribute('src'); this.currentVideo.load(); this.currentVideo = null }
    if (this.currentTexture) { this.currentTexture.dispose(); this.currentTexture = null }
    if (this.currentUrl) { URL.revokeObjectURL(this.currentUrl); this.currentUrl = null }
    this.currentId = null
    if (this.screenMaterial && this.defaultTexture) { this.screenMaterial.map = this.defaultTexture; this.screenMaterial.needsUpdate = true }
  }
}

function addExhibitFloorMark(b: Builder): void {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1.9, 48), new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.85, transparent: true, opacity: 0.08, side: THREE.DoubleSide }))
  m.rotation.x = -Math.PI / 2; m.position.set(9.1, 0.017, 4.5); b.root.add(m)
  b.fixture('hall', 9.1, 4.7, 3.7, 1.15, 0.32)
}
