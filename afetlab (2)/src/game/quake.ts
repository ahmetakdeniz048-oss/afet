import * as THREE from 'three'
import { Builder, solid, texMat } from './builder'
import { H_ROOM } from './world'
import { addChair, addLocker, addOfficeDesk, addPlant, addWallSign, addWorkTable } from './props'
import { canvasTex, font, posterTex, signTex } from './textures'

export type PlayerInfo = { x: number; z: number; y: number; crouching: boolean; holding: boolean }

export type QuakeCallbacks = {
  damage(amount: number, reason: string): void
  toast(msg: string, kind?: 'ok' | 'warn' | 'bad'): void
  sfx: { creak(): void; glass(): void; thud(v: number): void; spark(): void; rumble(level: number): void }
  speak(msg: string): void
  finished(r: { safeSeconds: number; exposedSeconds: number; hits: number; fullyProtected: boolean }): void
}

export const QUAKE = { P_END: 3.5, S_END: 10.5, DURATION: 14, TIP: 6.5 }

type Loose = {
  mesh: THREE.Object3D; home: THREE.Vector3; homeRot: THREE.Euler; at: number
  vel: THREE.Vector3; spin: THREE.Vector3; state: 'rest' | 'fall' | 'done'; floorY: number; size: number; bounced: number
}

const TABLE = { x: -26, z: -9.2, w: 2.4, d: 1.2 }
const SHELF = { x: -29.6, w: 2.4, d: 0.4, h: 2.3, front: -13.45 }

export class QuakeRoom {
  t = 0
  running = false
  phase: 'idle' | 'P' | 'S' | 'decay' = 'idle'
  intensity = 0
  displacement = 0
  safeSeconds = 0
  exposedSeconds = 0
  hits = 0
  readonly table = TABLE
  private cb!: QuakeCallbacks
  private loose: Loose[] = []
  private shelf = new THREE.Group()
  private shelfCollider: ReturnType<Builder['col']['add']> | null = null
  private shelfFell = false
  private panes: THREE.Mesh[] = []
  private paneOrig = new Map<THREE.Mesh, THREE.Material>()
  private crackedMat!: THREE.MeshPhysicalMaterial
  private shards: { m: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3; on: boolean }[] = []
  private plaster: { m: THREE.Mesh; v: THREE.Vector3; at: number; state: 'idle' | 'fall' | 'done'; target: boolean }[] = []
  private cracks: THREE.Mesh[] = []
  private dust!: THREE.Points
  private dustMat!: THREE.PointsMaterial
  private dropPanel: THREE.Mesh | null = null
  private dropState: 'hang' | 'fall' | 'done' = 'hang'
  private dropVel = 0
  private pendants: THREE.Group[] = []
  private nextCreak = 0
  private tipHandled = false
  private dropHandled = false
  private blackout = false
  private flickerT = 0

  constructor(private b: Builder) {}

  isUnderTable(p: PlayerInfo): boolean {
    return Math.abs(p.x - TABLE.x) < TABLE.w / 2 - 0.1 && Math.abs(p.z - TABLE.z) < TABLE.d / 2 - 0.1
  }

  /** Güvenli bölgenin merkezi (yönlendirme oku için). */
  get tablePos(): THREE.Vector3 { return new THREE.Vector3(TABLE.x, 0, TABLE.z) }

  build(): void {
    const b = this.b
    const wall = texMat('plaster', { color: 0xe9eef2, rough: 1 })
    const floor = texMat('wood', { color: 0xcdb08a, rough: 1, env: 0.6 })
    const ceil = texMat('ceiling', { rough: 1 })
    const x0 = -34, x1 = -18, z0 = -14, z1 = -4
    b.floor(x0, z0, x1, z1, 0, floor, 0.2, false)
    b.ceiling(x0, z0, x1, z1, H_ROOM, ceil)
    b.wallX(z0, x0, x1, 0, H_ROOM, wall, [-31.5, -22.5].map(at => ({ at, w: 2.2, h: 1.5, sill: 0.95, kind: 'window' as const })))
    b.wallZ(x0, z0, z1, 0, H_ROOM, wall)

    // pencere camlarını topla
    b.root.children.forEach(o => {
      const m = o as THREE.Mesh
      if (m.userData?.window && m.position.z < -13 && m.position.x < -18) { this.panes.push(m); this.paneOrig.set(m, m.material as THREE.Material) }
    })
    this.crackedMat = new THREE.MeshPhysicalMaterial({
      map: canvasTex(512, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2
        const c = [w * 0.45, h * 0.5]
        for (let i = 0; i < 16; i++) {
          let x = c[0], y = c[1]; const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2; g.beginPath(); g.moveTo(x, y)
          for (let k = 0; k < 7; k++) { const l = 30 + Math.random() * 40; x += Math.cos(a + (Math.random() - 0.5) * 0.5) * l; y += Math.sin(a + (Math.random() - 0.5) * 0.5) * l; g.lineTo(x, y) }
          g.stroke()
        }
        for (let r = 30; r < 200; r += 36) { g.beginPath(); g.arc(c[0], c[1], r, 0, Math.PI * 2); g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1 }
      }), color: 0xcfe6f7, transparent: true, opacity: 0.6, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false,
    })

    // aydınlatma
    for (const x of [-31, -26, -21]) for (const z of [-11.5, -6.5]) {
      if (x === -21 && z === -6.5) { this.dropPanel = b.fixture('quake', x, H_ROOM - 0.02, z, 1.4, 0.5); this.dropPanel.userData.home = this.dropPanel.position.clone() }
      else b.fixture('quake', x, H_ROOM - 0.02, z, 1.4, 0.5)
    }
    for (const [x, z] of [[-30, -9], [-22, -9], [-26, -6]] as const) b.pointLight('quake', x, 2.9, z, 7, 12)

    // sarkıt lambalar
    for (const [x, z] of [[-30, -9.5], [-22.5, -11]] as const) {
      const g = new THREE.Group(); g.position.set(x, H_ROOM, z); b.root.add(g)
      b.box(0, -0.45, 0, 0.012, 0.9, 0.012, solid(0x111827), { parent: g })
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 24, 1, true), solid(0xf59e0b, { rough: 0.4, metal: 0.3 })); shade.position.y = -0.95; (shade.material as THREE.Material).side = THREE.DoubleSide; g.add(shade)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe3a8, emissiveIntensity: 2.5 })); bulb.position.y = -1.0; g.add(bulb)
      this.pendants.push(g)
    }

    // sağlam masa + güvenli alan işareti
    addWorkTable(b, TABLE.x, TABLE.z, TABLE.w, TABLE.d, 1.05)
    const zoneMark = canvasTex(512, 320, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = 'rgba(250,204,21,0.9)'
      g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h)
      g.fillStyle = 'rgba(15,23,42,0.9)'
      for (let i = 0; i < w; i += 28) { g.fillRect(i, 0, 14, 14); g.fillRect(i, h - 14, 14, 14) }
      for (let i = 0; i < h; i += 28) { g.fillRect(0, i, 14, 14); g.fillRect(w - 14, i, 14, 14) }
      g.fillStyle = 'rgba(250,204,21,0.8)'; g.font = font(30); g.textAlign = 'center'; g.fillText('GÜVENLİ ALAN', w / 2, h - 34)
    })
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.0), new THREE.MeshBasicMaterial({ map: zoneMark, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }))
    mark.rotation.x = -Math.PI / 2; mark.position.set(TABLE.x, 0.014, TABLE.z); mark.renderOrder = 3; b.root.add(mark)
    const hanging = signTex('SAĞLAM MASA', '#0369a1', '#fff', 'Çök – Kapan – Tutun', 560, 220)
    const hs = addWallSign(b, TABLE.x, 2.45, TABLE.z - 0.0, 1.5, 0.59, 0, hanging, 0.4)
    hs.position.set(TABLE.x, 2.5, TABLE.z); hs.material = new THREE.MeshStandardMaterial({ map: hanging, emissive: 0xffffff, emissiveMap: hanging, emissiveIntensity: 0.4, side: THREE.DoubleSide })
    for (const sx of [-0.7, 0.7]) b.box(TABLE.x + sx, (H_ROOM + 2.5) / 2 - 0.03, TABLE.z, 0.008, H_ROOM - 2.5, 0.008, solid(0x111827))

    // kırılgan öğrenci masaları
    const desks: [number, number, number][] = [[-32.4, -5.2, 0], [-30.4, -5.2, 0], [-20.0, -5.2, 0], [-22.0, -5.2, 0], [-19.7, -9.5, Math.PI / 2]]
    desks.forEach(([x, z, r]) => {
      const g = addOfficeDesk(b, x, z, r, true); b.shaker(g, 0.5)
      addChair(b, x + (r ? -0.9 : 0), z + (r ? 0 : 0.9), r ? Math.PI / 2 : Math.PI)
      // masa üstü kupa / kâğıt
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 16), solid(0xf8fafc, { rough: 0.3 })); mug.castShadow = true
      const off = r ? new THREE.Vector3(0, 0, 0.5) : new THREE.Vector3(0.55, 0, 0.1)
      mug.position.set(x + (r ? -off.z * -0 : off.x), 0.8, z + (r ? off.z : off.z)); b.root.add(mug)
      this.addLoose(mug, 4.0 + b.rand() * 1.8, 0.045, 0.09)
    })

    // kitaplık (devrilecek)
    this.buildShelf()
    // dolap (sabit, sallanır)
    addLocker(b, -33.5, -8.2, Math.PI / 2, 3, 0x6b7280)
    // beyaz tahta
    b.box(-33.82, 1.7, -11.3, 0.04, 1.2, 2.4, solid(0xf8fafc, { rough: 0.2, env: 0.7 }))
    b.box(-33.8, 1.7, -11.3, 0.02, 1.26, 2.46, solid(0x9ca3af, { rough: 0.4, metal: 0.6 }))
    addPlant(b, -33.1, -12.9, 1.0)

    // saat, çerçeveler (düşecek)
    this.addWallClock(-23.5, 2.7, -13.84)
    this.addFrame(-26.2, 2.0, -13.85, 0.6, 0.45, '#0e7490', 4.6)
    this.addFrame(-18.3, 2.1, -6.0, 0.7, 0.5, '#b45309', 5.1, Math.PI / 2)

    // afiş
    const p = posterTex('DEPREM TATBİKATI', ['P dalgası: hafif, hızlı ön sarsıntı.', 'S dalgası: şiddetli sarsıntı – asıl tehlike.', 'ÇÖK: Yere çömel (C).', 'KAPAN: Sağlam masanın altına gir.', 'TUTUN: T tuşuyla masaya tutun.'], '#0369a1')
    addWallSign(b, -18.17, 2.0, -5.5, 1.1, 1.47, -Math.PI / 2, p)

    // çatlak decal'leri, toz, kırık cam parçaları, sıva parçaları
    const crackTex = canvasTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(30,30,30,0.9)'; g.lineWidth = 3
      let x = w * 0.5, y = 10
      g.beginPath(); g.moveTo(x, y)
      for (let i = 0; i < 18; i++) { x += (Math.random() - 0.5) * 60; y += 20 + Math.random() * 18; g.lineTo(x, y); if (Math.random() < 0.3) { g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 100, y + 40); g.moveTo(x, y) } }
      g.stroke()
    })
    for (const [x, y, z, ry, w, h] of [[-27.7, 2.0, -13.84, 0, 0.9, 1.6], [-33.84, 1.9, -6.5, Math.PI / 2, 0.8, 1.5], [-18.18, 2.0, -12.4, -Math.PI / 2, 0.8, 1.5]] as const) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
      c.position.set(x, y, z); c.rotation.y = ry; c.renderOrder = 2; b.root.add(c); this.cracks.push(c)
    }
    this.buildDust()
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + b.rand() * 0.04), new THREE.MeshPhysicalMaterial({ color: 0xcfe6f7, transparent: true, opacity: 0.6, roughness: 0.05 }))
      m.visible = false; b.root.add(m)
      this.shards.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), on: false })
    }
    for (let i = 0; i < 16; i++) {
      const s = 0.07 + b.rand() * 0.1
      const m = new THREE.Mesh(new THREE.BoxGeometry(s * 1.6, s * 0.5, s), solid(0xd6d3cd, { rough: 1 })); m.castShadow = true; m.visible = false; b.root.add(m)
      this.plaster.push({ m, v: new THREE.Vector3(), at: 5.0 + b.rand() * 5.2, state: 'idle', target: i % 3 === 0 })
    }
    b.updaters.push(() => { /* sarsıntı update() ile yönetilir */ })
  }

  // ------------------------------------------------------------ yapı yardımcıları
  private buildShelf(): void {
    const b = this.b
    const g = this.shelf
    g.position.set(SHELF.x, 0, SHELF.front); b.root.add(g)
    const wood = texMat('wood', { color: 0x9a7448, rough: 1 })
    const cy = SHELF.h / 2, cz = -SHELF.d / 2
    b.box(-SHELF.w / 2 + 0.02, cy, cz, 0.04, SHELF.h, SHELF.d, wood, { parent: g, cast: true })
    b.box(SHELF.w / 2 - 0.02, cy, cz, 0.04, SHELF.h, SHELF.d, wood, { parent: g, cast: true })
    b.box(0, cy, cz - SHELF.d / 2 + 0.01, SHELF.w, SHELF.h, 0.02, wood, { parent: g })
    const levels = [0.08, 0.55, 1.0, 1.45, 1.9, SHELF.h - 0.02]
    levels.forEach(y => b.box(0, y, cz, SHELF.w - 0.06, 0.04, SHELF.d, wood, { parent: g, cast: true }))
    const cols = [0x1d4ed8, 0xb91c1c, 0x15803d, 0xca8a04, 0x6d28d9, 0x0f766e, 0x9a3412, 0x374151, 0xe5e7eb]
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mats = cols.map(c => solid(c, { rough: 0.8 }))
    for (let l = 0; l < 5; l++) {
      let x = -SHELF.w / 2 + 0.08
      while (x < SHELF.w / 2 - 0.12) {
        const w = 0.03 + b.rand() * 0.035, h = 0.26 + b.rand() * 0.14
        if (x + w > SHELF.w / 2 - 0.06) break
        const m = new THREE.Mesh(geo, mats[Math.floor(b.rand() * mats.length)])
        m.scale.set(w, h, SHELF.d - 0.1); m.position.set(x + w / 2, levels[l] + 0.02 + h / 2, cz + 0.02); m.castShadow = true
        m.rotation.z = b.rand() < 0.05 ? 0.2 : 0
        g.add(m); x += w + 0.004
      }
    }
    this.shelfCollider = b.col.add(SHELF.x, cy, SHELF.front - SHELF.d / 2, SHELF.w, SHELF.h, SHELF.d)
    b.blob(SHELF.x, 0, SHELF.front - 0.1, SHELF.w + 0.4, 1.0, 0.5)
    // üst eşyalar (düşecek)
    const topY = SHELF.h + 0.02
    const boxMats = [0x0e7490, 0xa16207, 0x7c3aed]
    for (let i = 0; i < 4; i++) {
      const bx = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.22), solid(boxMats[i % 3], { rough: 0.9 })); bx.castShadow = true
      bx.position.set(SHELF.x - 0.8 + i * 0.5, topY + 0.09, SHELF.front - 0.2); b.root.add(bx)
      this.addLoose(bx, 4.0 + i * 0.35, 0.15, topY + 0.09)
    }
    addWallSign(b, SHELF.x, 2.6, -13.84, 1.3, 0.3, 0, signTex('KİTAPLIK – SABİTLENMEMİŞ!', '#7f1d1d', '#fff', undefined, 640, 150))
  }

  private addWallClock(x: number, y: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.x = Math.PI / 2
    const face = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#f8fafc'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#0f172a'; c.font = font(26); c.textAlign = 'center'; c.textBaseline = 'middle'
      for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; c.fillText(String(i), w / 2 + Math.cos(a) * 92, h / 2 + Math.sin(a) * 92) }
      c.strokeStyle = '#0f172a'; c.lineWidth = 8; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + 40, h / 2 - 30); c.stroke(); c.lineWidth = 5; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 - 10, h / 2 - 80); c.stroke()
    })
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32), solid(0x111827, { rough: 0.4 }))
    const fm = new THREE.Mesh(new THREE.CircleGeometry(0.185, 32), new THREE.MeshStandardMaterial({ map: face, roughness: 0.5 })); fm.rotation.x = -Math.PI / 2; fm.position.y = 0.0255
    g.add(rim, fm); rim.castShadow = true
    this.b.root.add(g)
    this.addLoose(g, 4.6, 0.2, 0.05)
    g.userData.clock = true
  }

  private addFrame(x: number, y: number, z: number, w: number, h: number, color: string, at: number, ry = 0): void {
    const tex = canvasTex(256, 192, (g, ww, hh) => { const gr = g.createLinearGradient(0, 0, ww, hh); gr.addColorStop(0, color); gr.addColorStop(1, '#fde68a'); g.fillStyle = gr; g.fillRect(0, 0, ww, hh); g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(ww * 0.7, hh * 0.35, 28, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(0, hh); g.lineTo(ww * 0.35, hh * 0.45); g.lineTo(ww * 0.7, hh); g.fill() })
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.03), solid(0x3b2a1a, { rough: 0.6 })))
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 })); pic.position.z = 0.016; g.add(pic)
    this.b.root.add(g)
    this.addLoose(g, at, 0.3, 0.03)
  }

  private addLoose(mesh: THREE.Object3D, at: number, size: number, floorOffset: number): void {
    this.loose.push({ mesh, home: mesh.position.clone(), homeRot: mesh.rotation.clone(), at, vel: new THREE.Vector3(), spin: new THREE.Vector3(), state: 'rest', floorY: floorOffset > 0.5 ? 0.04 : floorOffset * 0.5, size, bounced: 0 })
  }

  private buildDust(): void {
    const n = 380
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { pos[i * 3] = -34 + Math.random() * 16; pos[i * 3 + 1] = Math.random() * 3.3; pos[i * 3 + 2] = -14 + Math.random() * 10 }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const tex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(210,205,195,0.9)'); gr.addColorStop(1, 'rgba(210,205,195,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h) })
    this.dustMat = new THREE.PointsMaterial({ map: tex, size: 0.22, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true })
    this.dust = new THREE.Points(geo, this.dustMat); this.dust.frustumCulled = false
    this.b.root.add(this.dust)
  }

  // ------------------------------------------------------------ akış
  reset(): void {
    this.t = 0; this.running = false; this.phase = 'idle'; this.intensity = 0; this.displacement = 0
    this.safeSeconds = 0; this.exposedSeconds = 0; this.hits = 0
    this.shelf.rotation.x = 0; this.shelfFell = false; this.tipHandled = false; this.dropHandled = false
    if (this.shelfCollider) this.shelfCollider.enabled = true
    for (const l of this.loose) { l.mesh.position.copy(l.home); l.mesh.rotation.copy(l.homeRot); l.state = 'rest'; l.mesh.visible = true; l.bounced = 0 }
    this.panes.forEach(p => { p.material = this.paneOrig.get(p)!; p.visible = true })
    this.shards.forEach(s => { s.on = false; s.m.visible = false })
    this.plaster.forEach(p => { p.state = 'idle'; p.m.visible = false })
    this.cracks.forEach(c => ((c.material as THREE.MeshBasicMaterial).opacity = 0))
    this.dustMat.opacity = 0
    if (this.dropPanel) { this.dropPanel.position.copy(this.dropPanel.userData.home as THREE.Vector3); this.dropPanel.rotation.set(0, 0, 0); this.dropState = 'hang' }
    this.b.setPower('quake', 1); this.blackout = false
    this.b.shakers.forEach(s => { s.obj.position.copy(s.base); s.obj.rotation.copy(s.baseRot) })
    this.pendants.forEach(p => p.rotation.set(0, 0, 0))
  }

  start(cb: QuakeCallbacks): void {
    this.reset(); this.cb = cb; this.running = true; this.phase = 'P'; this.nextCreak = 0.4
    cb.speak('Deprem başladı! Çök, kapan, tutun!')
  }

  /** Kamera sarsıntısı için normalleştirilmiş şiddet (0..1). */
  get shake(): number { return this.intensity }

  update(dt: number, p: PlayerInfo): void {
    // her zaman: sarkıt lambalar, küçük titreşim kayıtları
    const T = this.t
    if (!this.running) { this.animateFalling(dt, p); return }
    this.t += dt
    const t = this.t
    // faz ve şiddet
    if (t < QUAKE.P_END) { this.phase = 'P'; this.intensity = 0.14 + 0.12 * (t / QUAKE.P_END) }
    else if (t < QUAKE.S_END) { this.phase = 'S'; const k = Math.min(1, (t - QUAKE.P_END) / 0.8); this.intensity = 0.25 + 0.75 * k }
    else if (t < QUAKE.DURATION) { this.phase = 'decay'; this.intensity = Math.max(0, 1 - (t - QUAKE.S_END) / (QUAKE.DURATION - QUAKE.S_END)) * 0.5 }
    else { this.finish(); return }
    this.displacement = Math.sin(t * 38) * (this.phase === 'P' ? 0.25 : 0.1) * (t < QUAKE.P_END ? 1 : 0.4) + Math.sin(t * 9 + Math.sin(t * 3)) * (this.phase === 'S' ? 0.95 : this.phase === 'decay' ? this.intensity : 0.05)
    this.cb.sfx.rumble(this.intensity)

    // korunma değerlendirmesi
    const under = this.isUnderTable(p)
    const safe = under && p.crouching && p.holding
    if (this.phase === 'S') { if (safe) this.safeSeconds += dt; else this.exposedSeconds += dt }
    const protectedFromDebris = under && p.crouching

    // gıcırtılar
    if (t > this.nextCreak) { this.cb.sfx.creak(); this.nextCreak = t + 0.7 + Math.random() * 1.1 }

    // ışık titremesi ve elektrik kesintisi
    if (t > 1.5 && t < 8) { this.flickerT -= dt; if (this.flickerT < 0) { this.flickerT = 0.05 + Math.random() * 0.14; this.b.setPower('quake', Math.random() < 0.3 ? 0.15 : 0.85 + Math.random() * 0.15) } }
    if (t >= 8 && !this.blackout) { this.blackout = true; this.b.setPower('quake', 0.0); this.cb.toast('Elektrikler kesildi!', 'warn'); this.cb.sfx.spark() }
    if (t >= QUAKE.DURATION - 1 && this.blackout) { this.blackout = false; this.b.setPower('quake', 0.6) }

    // cam
    if (t >= 5.0) this.panes.forEach(pn => { if (pn.material === this.paneOrig.get(pn)) { pn.material = this.crackedMat; this.cb.sfx.glass() } })
    if (t >= 7.0) this.panes.forEach(pn => { if (pn.visible) { pn.visible = false; this.cb.sfx.glass(); this.spawnShards(pn.position) } })
    // çatlaklar
    this.cracks.forEach((c, i) => { (c.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, Math.max(0, (t - (3.8 + i * 0.7)) / 1.4)) })
    // toz
    const dustTarget = this.phase === 'P' ? 0.1 : this.phase === 'S' ? Math.min(0.55, 0.15 + (t - 5) * 0.12) : Math.max(0, 0.45 - (t - QUAKE.S_END) * 0.06)
    this.dustMat.opacity += (Math.max(0, dustTarget) - this.dustMat.opacity) * Math.min(1, dt * 2)

    // kitaplık devrilmesi
    if (t >= QUAKE.TIP) {
      const k = Math.min(1, (t - QUAKE.TIP) / 1.3)
      this.shelf.rotation.x = 1.36 * k * k
      if (this.shelfCollider) this.shelfCollider.enabled = false
      if (k >= 1 && !this.tipHandled) {
        this.tipHandled = true; this.shelfFell = true
        this.cb.sfx.thud(0.9); this.cb.toast('Kitaplık devrildi!', 'warn')
        const inZone = Math.abs(p.x - SHELF.x) < SHELF.w / 2 + 0.4 && p.z < SHELF.front + 2.3 && p.z > SHELF.front - 0.6
        if (inZone && !protectedFromDebris) { this.hits++; this.cb.damage(30, 'Devrilen kitaplığın altında kaldınız!') }
        this.dustMat.opacity = Math.min(0.8, this.dustMat.opacity + 0.3)
      }
    }
    // tavan armatürü düşmesi
    if (this.dropPanel) {
      if (t >= 7.4 && this.dropState === 'hang') { this.dropState = 'fall'; this.dropVel = 0; this.cb.sfx.creak() }
      if (this.dropState === 'hang' && t > 4) this.dropPanel.rotation.z = Math.sin(t * 6) * 0.02 * this.intensity
      if (this.dropState === 'fall') {
        this.dropVel += 9.8 * dt; this.dropPanel.position.y -= this.dropVel * dt; this.dropPanel.rotation.z += dt * 0.8
        if (this.dropPanel.position.y <= 0.08) {
          this.dropPanel.position.y = 0.08; this.dropState = 'done'; this.cb.sfx.thud(0.7); this.cb.sfx.spark()
          if (!this.dropHandled) {
            this.dropHandled = true
            const px = this.dropPanel.position.x, pz = this.dropPanel.position.z
            if (Math.hypot(p.x - px, p.z - pz) < 1.2 && !protectedFromDebris) { this.hits++; this.cb.damage(18, 'Tavan armatürü başınıza düştü!') }
          }
        }
      }
    }
    // düşen eşyalar
    for (const l of this.loose) if (l.state === 'rest' && t >= l.at) {
      l.state = 'fall'
      l.vel.set((Math.random() - 0.5) * 1.8, 0.4 + Math.random() * 0.8, (Math.random() - 0.1) * 1.6)
      l.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6)
    }
    // sıva parçaları
    for (const pl of this.plaster) if (pl.state === 'idle' && t >= pl.at && t < QUAKE.S_END + 1) {
      pl.state = 'fall'; pl.m.visible = true
      const tx = pl.target ? p.x + (Math.random() - 0.5) * 0.7 : -33 + Math.random() * 14
      const tz = pl.target ? p.z + (Math.random() - 0.5) * 0.7 : -13 + Math.random() * 8
      pl.m.position.set(Math.max(-33.5, Math.min(-18.5, tx)), H_ROOM - 0.1, Math.max(-13.5, Math.min(-4.5, tz))); pl.v.set(0, 0, 0)
    }
    this.animateFalling(dt, p)
    void T
  }

  private animateFalling(dt: number, p: PlayerInfo): void {
    const t = this.t
    const underOrCrouch = this.isUnderTable(p) && p.crouching
    // sarsıntı kayıtları
    const amp = this.running ? this.intensity : 0
    for (const s of this.b.shakers) {
      if (!this.running && amp === 0) continue
      s.obj.position.x = s.base.x + Math.sin(t * 31 + s.ph) * 0.012 * amp * s.amp
      s.obj.position.z = s.base.z + Math.cos(t * 27 + s.ph) * 0.012 * amp * s.amp
      s.obj.rotation.z = s.baseRot.z + Math.sin(t * 23 + s.ph) * 0.006 * amp * s.amp
    }
    this.pendants.forEach((g, i) => { g.rotation.z = Math.sin(t * 3.1 + i) * 0.16 * amp; g.rotation.x = Math.cos(t * 2.6 + i) * 0.12 * amp })
    // toz yavaş dalgalanma
    if (this.dust && this.dustMat.opacity > 0.01) {
      const a = this.dust.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 0.06; if (y < 0) y = 3.3; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * 0.7 + i) * dt * 0.05) }
      a.needsUpdate = true
    }
    // serbest nesneler
    for (const l of this.loose) {
      if (l.state !== 'fall') continue
      l.vel.y -= 9.8 * dt
      l.mesh.position.addScaledVector(l.vel, dt)
      l.mesh.rotation.x += l.spin.x * dt; l.mesh.rotation.y += l.spin.y * dt; l.mesh.rotation.z += l.spin.z * dt
      const fy = l.size > 0.12 ? Math.max(l.floorY, 0.03) : 0.04
      if (l.mesh.position.y <= fy) {
        l.mesh.position.y = fy; l.bounced++
        if (l.bounced === 1) {
          this.cb?.sfx.thud(Math.min(0.5, 0.15 + l.size))
          if (l.size >= 0.12 && Math.hypot(l.mesh.position.x - p.x, l.mesh.position.z - p.z) < 0.55 && !underOrCrouch) { this.hits++; this.cb.damage(8, 'Üzerinize bir eşya düştü!') }
        }
        l.vel.y *= -0.25; l.vel.x *= 0.6; l.vel.z *= 0.6; l.spin.multiplyScalar(0.5)
        if (Math.abs(l.vel.y) < 0.4) { l.state = 'done'; l.mesh.rotation.x = Math.round(l.mesh.rotation.x / (Math.PI / 2)) * (Math.PI / 2) * (l.mesh.userData.clock ? 1 : 0.4) }
      }
    }
    for (const pl of this.plaster) {
      if (pl.state !== 'fall') continue
      pl.v.y -= 9.8 * dt; pl.m.position.addScaledVector(pl.v, dt); pl.m.rotation.x += dt * 3
      if (pl.m.position.y <= 0.05) {
        pl.m.position.y = 0.05; pl.state = 'done'; this.cb?.sfx.thud(0.18)
        if (Math.hypot(pl.m.position.x - p.x, pl.m.position.z - p.z) < 0.65 && !underOrCrouch) { this.hits++; this.cb.damage(6, 'Düşen sıva parçası!') }
      }
    }
    for (const s of this.shards) if (s.on) {
      s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += s.w.x * dt; s.m.rotation.z += s.w.z * dt
      if (s.m.position.y <= 0.03) { s.m.position.y = 0.03; s.on = false }
    }
  }

  private spawnShards(c: THREE.Vector3): void {
    let n = 0
    for (const s of this.shards) {
      s.on = true; s.m.visible = true
      s.m.position.set(c.x + (Math.random() - 0.5) * 2.0, c.y + (Math.random() - 0.5) * 1.1, c.z + 0.1)
      s.v.set((Math.random() - 0.5) * 1.5, Math.random() * 0.8, 0.8 + Math.random() * 1.8)
      s.w.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12)
      if (++n > 40) break
    }
  }

  private finish(): void {
    this.running = false; this.phase = 'idle'; this.intensity = 0
    this.cb.sfx.rumble(0)
    this.b.setPower('quake', 1)
    const fully = this.exposedSeconds < 0.6
    this.cb.finished({ safeSeconds: this.safeSeconds, exposedSeconds: this.exposedSeconds, hits: this.hits, fullyProtected: fully })
  }

  stop(): void { if (this.running) { this.running = false; this.phase = 'idle'; this.intensity = 0; this.cb?.sfx.rumble(0); this.reset() } }
  get shelfDown(): boolean { return this.shelfFell }
}
