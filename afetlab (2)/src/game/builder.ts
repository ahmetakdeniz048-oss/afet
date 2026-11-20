import * as THREE from 'three'
import { Colliders } from '../engine/collision'
import { getTex, type TexKind } from './textures'

export type Opening = { at: number; w: number; h: number; sill?: number; kind?: 'door' | 'window' | 'gap' }
export type Interact = { kind: string; name: string; [k: string]: unknown }
export type Zone = { lights: THREE.PointLight[]; base: number[]; mat: THREE.MeshStandardMaterial; level: number }

const matCache = new Map<string, THREE.MeshStandardMaterial>()

/** Doku kümeli malzeme. Paylaşımlıdır; aynı parametreler aynı örneği döndürür. */
export function texMat(kind: TexKind, o: { color?: number; rough?: number; metal?: number; normal?: number; env?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${kind}|${o.color ?? 0xffffff}|${o.rough ?? 1}|${o.metal ?? 0}|${o.normal ?? 1}|${o.env ?? 0.5}`
  let m = matCache.get(key)
  if (!m) {
    const t = getTex(kind)
    m = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
      color: o.color ?? 0xffffff, roughness: o.rough ?? 1, metalness: o.metal ?? 0,
      normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1), envMapIntensity: o.env ?? 0.5,
    })
    m.userData.mpt = t.metersPerTile
    matCache.set(key, m)
  }
  return m
}

export function solid(color: number, o: { rough?: number; metal?: number; emissive?: number; ei?: number; env?: number; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const key = `s|${color}|${o.rough ?? 0.6}|${o.metal ?? 0}|${o.emissive ?? 0}|${o.ei ?? 0}|${o.env ?? 0.5}|${o.opacity ?? 1}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0,
      emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 0, envMapIntensity: o.env ?? 0.5,
      transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
    })
    if (m.transparent) m.depthWrite = false
    matCache.set(key, m)
  }
  return m
}

/** Kutu geometrisinin UV'lerini dünya ölçeğine (metre / karo) göre ayarlar. */
function scaleUV(g: THREE.BoxGeometry, w: number, h: number, d: number, mpt: number, ox = 0, oy = 0): void {
  const uv = g.attributes.uv as THREE.BufferAttribute
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i
      uv.setXY(idx, uv.getX(idx) * dims[f][0] / mpt + ox, uv.getY(idx) * dims[f][1] / mpt + oy)
    }
  }
  uv.needsUpdate = true
}

export class Builder {
  root: THREE.Group = new THREE.Group()
  private rootMain: THREE.Group
  readonly col = new Colliders()
  readonly interactives: THREE.Object3D[] = []
  readonly zones = new Map<string, Zone>()
  readonly shakers: { obj: THREE.Object3D; base: THREE.Vector3; baseRot: THREE.Euler; amp: number; ph: number }[] = []
  readonly models = new Map<string, THREE.Object3D>()
  readonly updaters: ((dt: number, t: number) => void)[] = []
  private rng = 1337
  constructor(readonly scene: THREE.Scene) { scene.add(this.root); this.rootMain = this.root }

  /** `fn` içinde eklenen her şeyi (görsel + çarpıştırıcı) y kadar yukarı kaydırır (kat inşası). */
  withBase(y: number, fn: () => void): void {
    const g = new THREE.Group(); g.position.y = y
    this.rootMain.add(g)
    const prev = this.root, n0 = this.col.boxes.length
    this.root = g
    try { fn() } finally { this.root = prev }
    for (let i = n0; i < this.col.boxes.length; i++) { this.col.boxes[i].minY += y; this.col.boxes[i].maxY += y }
  }

  rand(): number { this.rng = (this.rng * 1664525 + 1013904223) >>> 0; return this.rng / 4294967296 }

  add<T extends THREE.Object3D>(o: T, parent: THREE.Object3D = this.root): T { parent.add(o); return o }

  /** Görsel kutu (+ isteğe bağlı çarpıştırıcı). Merkez koordinatlar. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, o: { solid?: boolean; cast?: boolean; recv?: boolean; parent?: THREE.Object3D; uvOff?: [number, number] } = {}): THREE.Mesh {
    const g = new THREE.BoxGeometry(w, h, d)
    const mpt = (mat as THREE.MeshStandardMaterial).userData?.mpt as number | undefined
    if (mpt) scaleUV(g, w, h, d, mpt, o.uvOff?.[0] ?? 0, o.uvOff?.[1] ?? 0)
    const m = new THREE.Mesh(g, mat)
    m.position.set(x, y, z)
    m.castShadow = o.cast ?? false; m.receiveShadow = o.recv ?? true
    this.add(m, o.parent ?? this.root)
    if (o.solid) this.col.add(x, y, z, w, h, d)
    return m
  }

  cyl(x: number, y: number, z: number, rTop: number, rBot: number, h: number, mat: THREE.Material, o: { seg?: number; solid?: boolean; parent?: THREE.Object3D; cast?: boolean } = {}): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 20), mat)
    m.position.set(x, y, z); m.castShadow = o.cast ?? false; m.receiveShadow = true
    this.add(m, o.parent ?? this.root)
    if (o.solid) this.col.add(x, y, z, Math.max(rTop, rBot) * 2, h, Math.max(rTop, rBot) * 2)
    return m
  }

  /** Zemin plakası görseli (üstü y'de). */
  floor(x0: number, z0: number, x1: number, z1: number, y: number, mat: THREE.Material, thick = 0.2, solid = true): THREE.Mesh {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    return this.box(cx, y - thick / 2, cz, Math.abs(x1 - x0), thick, Math.abs(z1 - z0), mat, { solid, recv: true })
  }

  ceiling(x0: number, z0: number, x1: number, z1: number, y: number, mat: THREE.Material, thick = 0.25): THREE.Mesh {
    return this.box((x0 + x1) / 2, y + thick / 2, (z0 + z1) / 2, Math.abs(x1 - x0), thick, Math.abs(z1 - z0), mat, { solid: true, cast: true })
  }

  /** z ekseni boyunca uzanan duvar (sabit x). Açıklıklar z koordinatındadır. */
  wallZ(x: number, z0: number, z1: number, y0: number, h: number, mat: THREE.Material, openings: Opening[] = [], thick = 0.3, skirt = true): void {
    this.wall('z', x, z0, z1, y0, h, mat, openings, thick, skirt)
  }
  wallX(z: number, x0: number, x1: number, y0: number, h: number, mat: THREE.Material, openings: Opening[] = [], thick = 0.3, skirt = true): void {
    this.wall('x', z, x0, x1, y0, h, mat, openings, thick, skirt)
  }

  private wall(axis: 'x' | 'z', fixed: number, a0: number, a1: number, y0: number, h: number, mat: THREE.Material, openings: Opening[], thick: number, skirt: boolean): void {
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1)
    const ops = [...openings].sort((p, q) => p.at - q.at)
    const piece = (s0: number, s1: number, by0: number, by1: number, withSkirt: boolean) => {
      if (s1 - s0 < 0.01 || by1 - by0 < 0.01) return
      const len = s1 - s0, hh = by1 - by0, c = (s0 + s1) / 2, cy = y0 + (by0 + by1) / 2
      if (axis === 'z') this.box(fixed, cy, c, thick, hh, len, mat, { solid: true, cast: true, uvOff: [s0 * 0.37, 0] })
      else this.box(c, cy, fixed, len, hh, thick, mat, { solid: true, cast: true, uvOff: [s0 * 0.37, 0] })
      if (withSkirt && skirt) {
        const sm = solid(0x2b3441, { rough: 0.5 })
        if (axis === 'z') this.box(fixed, y0 + 0.07, c, thick + 0.04, 0.14, len, sm)
        else this.box(c, y0 + 0.07, fixed, len, 0.14, thick + 0.04, sm)
      }
    }
    let cursor = lo
    for (const op of ops) {
      const s0 = op.at - op.w / 2, s1 = op.at + op.w / 2
      piece(cursor, s0, 0, h, true)
      const sill = op.sill ?? 0
      piece(s0, s1, op.h + sill, h, false) // lento
      if (sill > 0) piece(s0, s1, 0, sill, true)
      if (op.kind === 'door') this.doorFrame(axis, fixed, op, y0, thick)
      if (op.kind === 'window') this.windowFrame(axis, fixed, op, y0, thick)
      cursor = s1
    }
    piece(cursor, hi, 0, h, true)
  }

  private doorFrame(axis: 'x' | 'z', fixed: number, op: Opening, y0: number, thick: number): void {
    const m = solid(0x1f2937, { rough: 0.45, metal: 0.4 })
    const t = 0.07
    const s0 = op.at - op.w / 2, s1 = op.at + op.w / 2
    const put = (c: number, cy: number, len: number, hh: number) => {
      if (axis === 'z') this.box(fixed, y0 + cy, c, thick + 0.06, hh, len, m)
      else this.box(c, y0 + cy, fixed, len, hh, thick + 0.06, m)
    }
    put(s0 + t / 2, op.h / 2, t, op.h); put(s1 - t / 2, op.h / 2, t, op.h); put(op.at, op.h - t / 2, op.w, t)
  }

  private windowFrame(axis: 'x' | 'z', fixed: number, op: Opening, y0: number, thick: number): void {
    const frame = solid(0xe5e7eb, { rough: 0.4, metal: 0.5 })
    // Opaque architectural glazing prevents a direct-light leak through the simplified window cutouts.
    const glass = new THREE.MeshStandardMaterial({ color: 0x8da4b8, roughness: 0.22, metalness: 0.04, emissive: 0x263d52, emissiveIntensity: 0.06, envMapIntensity: 0.3, side: THREE.DoubleSide })
    const sill = op.sill ?? 0.9, t = 0.06
    const s0 = op.at - op.w / 2, s1 = op.at + op.w / 2
    const cy = y0 + sill + op.h / 2
    const put = (c: number, y: number, len: number, hh: number) => {
      if (axis === 'z') this.box(fixed, y, c, thick + 0.04, hh, len, frame)
      else this.box(c, y, fixed, len, hh, thick + 0.04, frame)
    }
    put(s0 + t / 2, cy, t, op.h); put(s1 - t / 2, cy, t, op.h)
    put(op.at, y0 + sill + t / 2, op.w, t); put(op.at, y0 + sill + op.h - t / 2, op.w, t)
    put(op.at, cy, 0.04, op.h)
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(op.w - t * 2, op.h - t * 2), glass)
    pane.userData.window = true
    pane.castShadow = true; pane.receiveShadow = true
    if (axis === 'z') { pane.position.set(fixed, cy, op.at); pane.rotation.y = Math.PI / 2 } else pane.position.set(op.at, cy, fixed)
    this.add(pane)
    // cam arkası görünmez bariyer
    if (axis === 'z') this.col.add(fixed, cy, op.at, 0.1, op.h, op.w); else this.col.add(op.at, cy, fixed, op.w, op.h, 0.1)
  }

  // ---------- ışık / bölge ----------
  zone(name: string, level = 1): Zone {
    let z = this.zones.get(name)
    if (!z) {
      z = { lights: [], base: [], level, mat: new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xfff3dc, emissiveIntensity: 0.65, roughness: 0.4 }) }
      this.zones.set(name, z)
    }
    return z
  }

  pointLight(zoneName: string, x: number, y: number, z: number, intensity: number, dist: number, color = 0xfff1dc): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, dist, 1.6)
    l.position.set(x, y, z)
    this.root.add(l)
    const zn = this.zone(zoneName)
    zn.lights.push(l); zn.base.push(intensity)
    return l
  }

  /** Tavan armatürü (emisif panel). */
  fixture(zoneName: string, x: number, y: number, z: number, w = 1.2, d = 0.6): THREE.Mesh {
    const z0 = this.zone(zoneName)
    const rim = solid(0x9ca3af, { rough: 0.5, metal: 0.4 })
    this.box(x, y + 0.02, z, w + 0.1, 0.04, d + 0.1, rim)
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), z0.mat)
    m.position.set(x, y - 0.0, z)
    this.root.add(m)
    return m
  }

  setPower(zoneName: string, f: number): void {
    const z = this.zones.get(zoneName); if (!z) return
    z.level = f
    z.lights.forEach((l, i) => { l.intensity = z.base[i] * f })
    z.mat.emissiveIntensity = 0.65 * f
  }

  // ---------- etkileşim / sarsıntı ----------
  interactive(o: THREE.Object3D, data: Interact): THREE.Object3D {
    o.userData = { ...o.userData, ...data, __interactive: true }
    this.interactives.push(o)
    return o
  }
  removeInteractive(o: THREE.Object3D): void {
    const i = this.interactives.indexOf(o); if (i >= 0) this.interactives.splice(i, 1)
  }

  /** Sarsıntıda titreyecek nesne kaydı. */
  shaker(o: THREE.Object3D, amp = 1): void {
    this.shakers.push({ obj: o, base: o.position.clone(), baseRot: o.rotation.clone(), amp, ph: this.rand() * 6.28 })
  }

  /** Küçük yumuşak temas gölgesi (AO taklidi). */
  blob(x: number, y: number, z: number, w: number, d: number, strength = 0.5, rotY = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), blobMat(strength))
    m.rotation.x = -Math.PI / 2; m.rotation.z = rotY; m.position.set(x, y + 0.012, z); m.renderOrder = 2
    this.root.add(m)
    return m
  }

  /** Geçici görünmez isabet kutusu (etkileşim için). */
  proxy(parent: THREE.Object3D, w: number, h: number, d: number, y = h / 2): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat)
    m.position.y = y
    parent.add(m)
    return m
  }
}

const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
const blobs = new Map<number, THREE.MeshBasicMaterial>()
let blobTexture: THREE.CanvasTexture | null = null
function blobMat(strength: number): THREE.MeshBasicMaterial {
  const k = Math.round(strength * 100)
  let m = blobs.get(k)
  if (!m) {
    if (!blobTexture) {
      const c = document.createElement('canvas'); c.width = c.height = 64
      const g = c.getContext('2d')!
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32)
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
      blobTexture = new THREE.CanvasTexture(c)
    }
    m = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    blobs.set(k, m)
  }
  return m
}
