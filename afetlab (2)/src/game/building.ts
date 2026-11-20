import * as THREE from 'three'
import { Builder, solid, texMat } from './builder'
import { addBench, addChair, addExitSign, addExtinguisher, addOfficeDesk, addPlant, addWallSign } from './props'
import { canvasTex, font, signTex } from './textures'

export const FH = 3.6
export const BLD = { x0: 24, x1: 40, z0: -6, z1: 6 }
export const HOLE = { x0: 34.4, x1: 37.6, z0: -5.6, z1: -0.4 }
export const ASSEMBLY = { x: 33, z: 13.5, r: 5 }
export const SPAWN3 = { x: 28.2, y: 7.2, z: 2.4 }
export const LOBBY_TERMINAL = { x: 26.4, z: -3.2 }

export function planTex(): THREE.CanvasTexture {
  return canvasTex(1024, 720, (g, w, h) => {
    g.fillStyle = '#f8fafc'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#047857'; g.fillRect(0, 0, w, 84)
    g.fillStyle = '#fff'; g.font = font(44); g.textAlign = 'left'; g.fillText('TAHLİYE PLANI – 3. KAT', 30, 58)
    const X = (x: number) => 112 + (x - 24) * 50, Z = (z: number) => 150 + (z + 6) * 40
    g.fillStyle = '#e2e8f0'; g.fillRect(X(24), Z(-6), 16 * 50, 12 * 40)
    g.strokeStyle = '#0f172a'; g.lineWidth = 6; g.strokeRect(X(24), Z(-6), 16 * 50, 12 * 40)
    g.fillStyle = '#a7f3d0'; g.fillRect(X(34.2), Z(-6), 3.6 * 50, 6.9 * 40); g.strokeRect(X(34.2), Z(-6), 3.6 * 50, 6.9 * 40)
    g.fillStyle = '#047857'; g.font = font(26); g.textAlign = 'center'; g.fillText('MERDİVEN', X(36), Z(-3)); g.fillText('KOVASI', X(36), Z(-3) + 30)
    g.fillStyle = '#94a3b8'; g.fillRect(X(30), Z(-6), 3 * 50, 14); g.fillStyle = '#334155'; g.font = font(20); g.fillText('ASANSÖR – KULLANMA', X(31.5), Z(-6) + 40)
    g.fillStyle = '#cbd5e1'; for (const [dx, dz] of [[26, -3], [29, -3], [26, 1], [29, 1]]) g.fillRect(X(dx) - 40, Z(dz) - 18, 80, 36)
    // rota
    g.strokeStyle = '#16a34a'; g.lineWidth = 9; g.setLineDash([18, 12]); g.beginPath(); g.moveTo(X(28.2), Z(2.4)); g.lineTo(X(36), Z(2.4)); g.lineTo(X(36), Z(0.2)); g.stroke(); g.setLineDash([])
    g.fillStyle = '#16a34a'; g.beginPath(); g.moveTo(X(36) - 16, Z(0.2) + 8); g.lineTo(X(36) + 16, Z(0.2) + 8); g.lineTo(X(36), Z(0.2) - 20); g.fill()
    g.fillStyle = '#ef4444'; g.beginPath(); g.arc(X(28.2), Z(2.4), 13, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#7f1d1d'; g.font = font(24); g.textAlign = 'center'; g.fillText('BURADASINIZ', X(28.2), Z(2.4) + 40)
    g.fillStyle = '#0f172a'; g.font = font(28); g.textAlign = 'left'
    g.fillText('1. Merdiven kovasına gidin (yeşil işaretler).', 40, 640)
    g.fillText('2. 2. katta elektrik panosunu kapatın, dumanda eğilin.', 40, 676)
    g.fillStyle = '#b91c1c'; g.fillText('ASANSÖR KULLANMAYIN!', 700, 676)
  })
}

export class Building {
  drillActive = false
  powerOff = false
  planViewed = false
  panelObj: THREE.Object3D | null = null
  planObj: THREE.Object3D | null = null
  terminalObj: THREE.Object3D | null = null
  exitDoorObj: THREE.Object3D | null = null
  elevators: THREE.Object3D[] = []
  exitOpen = false
  smokeLevel = 1
  private smoke: { s: THREE.Sprite; base: THREE.Vector3; ph: number }[] = []
  private smokeMat!: THREE.SpriteMaterial
  private sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = []
  private sparkT = 0
  private panelLight!: THREE.PointLight
  private strobe: THREE.PointLight[] = []
  private exitLeaf!: THREE.Group
  private exitCollider: ReturnType<Builder['col']['add']> | null = null
  private exitAnim = 0
  private emerg: THREE.MeshStandardMaterial[] = []
  private t = 0

  constructor(private b: Builder) {}

  build(): void {
    const b = this.b
    const brick = texMat('brick', { color: 0xe0cbb8, rough: 1 })
    const plaster = texMat('plaster', { color: 0xf2f1ec, rough: 1 })
    const conc = texMat('concrete', { color: 0xbfc3c9, rough: 1 })
    const ceil = texMat('ceiling', { rough: 1 })
    const carpet = texMat('carpet', { color: 0x8a97a8, rough: 1 })
    const tile = texMat('tile', { color: 0xe0e3e8, rough: 1, env: 0.8 })
    const { x0, x1, z0, z1 } = BLD

    // ---------------- döşemeler ----------------
    b.floor(x0, z0, x1, z1, 0, tile, 0.2, false)
    const slab = (y: number, finish: THREE.Material, hole: boolean) => {
      const pieces: [number, number, number, number][] = hole
        ? [[x0, z0, HOLE.x0, z1], [HOLE.x1, z0, x1, z1], [HOLE.x0, HOLE.z1, HOLE.x1, z1], [HOLE.x0, z0, HOLE.x1, HOLE.z0]]
        : [[x0, z0, x1, z1]]
      for (const [a, c, d, e] of pieces) {
        b.box((a + d) / 2, y - 0.03, (c + e) / 2, d - a, 0.06, e - c, finish, { cast: true })
        b.box((a + d) / 2, y - 0.18, (c + e) / 2, d - a, 0.24, e - c, ceil, { cast: true })
        b.col.addRange(a, y - 0.3, c, d, y, e)
      }
    }
    slab(FH, carpet, true); slab(2 * FH, carpet, true); slab(3 * FH, conc, false)

    // ---------------- dış duvarlar ----------------
    const win = (at: number, w = 2.4) => ({ at, w, h: 1.4, sill: 0.9, kind: 'window' as const })
    for (let f = 0; f < 3; f++) {
      const y = f * FH, h = FH
      // batı
      b.wallZ(x0, z0, z1, y, h, brick, f === 0 ? [{ at: 0, w: 2.6, h: 2.6, kind: 'door' }] : [win(-3), win(3)])
      // doğu
      b.wallZ(x1, z0, z1, y, h, brick, [win(3.2)])
      // kuzey
      b.wallX(z0, x0, x1, y, h, brick, [win(26.5), { at: 36, w: 1.4, h: 1.2, sill: 1.2, kind: 'window' as const }])
      // güney
      b.wallX(z1, x0, x1, y, h, brick, f === 0 ? [{ at: 28, w: 2.0, h: 2.3, kind: 'door' }, win(33.5), win(37.5)] : [win(26.5), win(31.5), win(36.5)])
      // merdiven kovası
      b.wallZ(34.2, z0, 0.9, y, h, plaster, [], 0.2)
      b.wallZ(37.8, z0, 0.9, y, h, plaster, [], 0.2)
      b.wallX(0.9, 34.2, 37.8, y, h, plaster, [{ at: 36, w: 1.4, h: 2.2, kind: 'door' }], 0.2)
      // teknik servis bloğu (ulaşılamaz)
      b.box(38.9, y + h / 2, -2.55, 2.2, h, 6.9, plaster, { solid: true })
      addExitSign(b, 36, y + 2.55, 1.1, 0, 'none')
    }
    // çatı
    b.box((x0 + x1) / 2, 3 * FH + 0.25, 0, 16.6, 0.5, 12.6, conc, { solid: true, cast: true })

    // ---------------- ışıklandırma ----------------
    for (let f = 0; f < 3; f++) {
      const zn = `b${f}`
      const y = (f + 1) * FH - 0.04
      for (const x of [27, 31]) for (const z of [-3, 2.5]) b.fixture(zn, x, y - 0.18, z, 1.2, 0.4)
      b.fixture(zn, 36, y - 0.18, 3.4, 1.2, 0.4)
      b.pointLight(zn, 28, f * FH + 3.0, -1.5, 12, 12); b.pointLight(zn, 33, f * FH + 3.0, 3.0, 11, 12)
      if (f === 0) b.pointLight(zn, 26, 3.0, 3.0, 8, 9)
      // stroboskop (kırmızı)
      const s = new THREE.PointLight(0xff2a1a, 0, 14, 1.6); s.position.set(30, f * FH + 3.2, 0); b.root.add(s); this.strobe.push(s)
    }
    // merdiven kovası ışıkları
    for (let f = 0; f < 3; f++) {
      b.pointLight('stair', 36, f * FH + 2.6, -2.8, 6, 7, 0xeaf3ff)
      b.fixture('stair', 36, (f + 1) * FH - 0.22, -3, 0.9, 0.3)
    }

    this.buildStairs(conc, plaster)
    this.buildGroundFloor(tile)
    this.buildOffices(carpet)
    this.buildPanelAndSmoke()
    this.buildYard()
  }

  // ---------------- merdiven ----------------
  private buildStairs(conc: THREE.Material, plaster: THREE.Material): void {
    const b = this.b
    const treadM = texMat('concrete', { color: 0xa4a8ae, rough: 1 })
    const nose = solid(0xfacc15, { rough: 0.5 })
    const rail = solid(0x374151, { rough: 0.35, metal: 0.8 })
    for (let s = 0; s < 2; s++) {
      const base = s * FH
      // 1. kol: lane1 (kuzeye)
      for (let i = 1; i <= 10; i++) {
        const top = base + 0.18 * i
        const zc = -0.4 - 0.28 * (i - 0.5)
        b.box(35.15, (base + top) / 2, zc, 1.5, top - base, 0.28, treadM, { cast: true })
        b.col.addRange(34.4, base, zc - 0.14, 35.9, top, zc + 0.14)
        b.box(35.15, top - 0.005, zc + 0.12, 1.5, 0.012, 0.045, nose)
      }
      // sahanlık
      b.box(36, base + 0.9, -4.4, 3.2, 1.8, 2.4, conc, { cast: true })
      b.col.addRange(HOLE.x0, base, -5.6, HOLE.x1, base + 1.8, -3.2)
      // 2. kol: lane2 (güneye)
      for (let j = 1; j <= 10; j++) {
        const top = base + 1.8 + 0.18 * j
        const zc = -3.2 + 0.28 * (j - 0.5)
        b.box(36.85, (base + top) / 2, zc, 1.5, top - base, 0.28, treadM, { cast: true })
        b.col.addRange(36.1, base, zc - 0.14, 37.6, top, zc + 0.14)
        b.box(36.85, top - 0.005, zc + 0.12, 1.5, 0.012, 0.045, nose)
      }
      // korkuluk (orta)
      b.box(36, base + 0.95, -1.8, 0.05, 0.05, 2.8, rail)
      for (const zz of [-3.1, -2.2, -1.3, -0.5]) b.box(36, base + 0.45 + (zz < -2 ? 0.9 : 1.2) * 0, zz, 0.03, 0.9, 0.03, rail)
    }
    // kat numaraları
    for (let f = 0; f < 3; f++) {
      const tex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#047857'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = font(150); g.textAlign = 'center'; g.fillText(String(f + 1), w / 2, 170); g.font = font(36); g.fillText('KAT', w / 2, 220) })
      addWallSign(b, 36, f * FH + 2.0, 0.78, 0.5, 0.5, Math.PI, tex, 0.4)
    }
    void plaster
  }

  // ---------------- zemin kat ----------------
  private buildGroundFloor(tile: THREE.Material): void {
    const b = this.b
    void tile
    // karşılama bankosu
    b.box(30, 0.55, -2.6, 3.0, 1.1, 0.8, solid(0x0f766e, { rough: 0.4, metal: 0.2 }), { solid: true, cast: true })
    b.box(30, 1.12, -2.6, 3.1, 0.06, 0.95, texMat('wood', { color: 0xe6d0ae, rough: 0.9 }), { cast: true })
    b.blob(30, 0, -2.6, 3.8, 1.6, 0.45)
    addPlant(b, 25.2, -5.0, 1.1); addPlant(b, 25.2, 5.0, 1.1); addPlant(b, 38.9, 5.1, 1.0)
    addBench(b, 31, 4.9, Math.PI, 2.2); addBench(b, 34.5, 4.9, Math.PI, 2.2)
    addExtinguisher(b, 24.4, 3.8, Math.PI / 2)

    // asansörler (tüm katlarda)
    for (let f = 0; f < 3; f++) {
      const y = f * FH
      const el = new THREE.Group(); el.position.set(31.5, y, -5.84); b.root.add(el)
      const steel = solid(0xaab2bd, { rough: 0.25, metal: 0.9 })
      b.box(0, 1.15, 0.0, 3.1, 2.4, 0.06, solid(0x1f2937, { rough: 0.4, metal: 0.5 }), { parent: el })
      for (const dx of [-0.8, 0.8]) {
        b.box(dx - 0.26, 1.1, 0.04, 0.5, 2.1, 0.03, steel, { parent: el })
        b.box(dx + 0.26, 1.1, 0.04, 0.5, 2.1, 0.03, steel, { parent: el })
      }
      b.box(1.7, 1.1, 0.04, 0.12, 0.2, 0.03, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfacc15, emissiveIntensity: 0.9 }), { parent: el })
      b.proxy(el, 3.0, 2.2, 0.5, 1.1).position.z = 0.2
      const lbl = signTex('ASANSÖR', '#7f1d1d', '#fff', 'Yangında kullanma!', 480, 180)
      addWallSign(b, 31.5, y + 2.9, -5.8, 1.2, 0.45, 0, lbl, 0.2)
      b.interactive(el, { kind: 'elevator', name: 'Asansör' })
      this.elevators.push(el)
    }

    // tatbikat terminali
    const term = new THREE.Group(); term.position.set(LOBBY_TERMINAL.x, 0, LOBBY_TERMINAL.z); b.root.add(term)
    b.box(0, 0.55, 0, 0.6, 1.1, 0.5, solid(0x1f2937, { rough: 0.4, metal: 0.4 }), { parent: term, cast: true })
    const scr = canvasTex(256, 192, (g, w, h) => { g.fillStyle = '#052e16'; g.fillRect(0, 0, w, h); g.fillStyle = '#4ade80'; g.font = font(26); g.textAlign = 'center'; g.fillText('TAHLİYE', w / 2, 62); g.fillText('TATBİKATI', w / 2, 96); g.fillStyle = '#fff'; g.font = font(22); g.fillText('[E] Başlat', w / 2, 150) })
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshStandardMaterial({ map: scr, emissive: 0xffffff, emissiveMap: scr, emissiveIntensity: 1 }))
    face.position.set(0, 1.0, 0.255); term.add(face)
    b.col.add(LOBBY_TERMINAL.x, 0.55, LOBBY_TERMINAL.z, 0.6, 1.1, 0.5)
    b.proxy(term, 0.9, 1.3, 0.8, 0.65)
    b.interactive(term, { kind: 'drill_start', name: 'Tahliye Tatbikatını Başlat' })
    this.terminalObj = term
    term.rotation.y = 0
    b.blob(LOBBY_TERMINAL.x, 0, LOBBY_TERMINAL.z, 1.2, 1.0, 0.5)

    // çıkış kapısı (güney duvarı, x=28)
    const leaf = new THREE.Group(); leaf.position.set(27.0, 0, 6); b.root.add(leaf)
    b.box(0.5, 1.1, 0, 1.0, 2.2, 0.06, solid(0x1d4ed8, { rough: 0.35, metal: 0.4 }), { parent: leaf })
    b.box(0.5, 1.1, -0.04, 0.6, 1.6, 0.02, new THREE.MeshPhysicalMaterial({ color: 0xbcd8ee, transparent: true, opacity: 0.35, roughness: 0.05 }), { parent: leaf })
    b.box(0.85, 1.0, -0.06, 0.8, 0.06, 0.05, solid(0xd1d5db, { rough: 0.2, metal: 0.9 }), { parent: leaf }) // panik barı
    this.exitLeaf = leaf
    const leaf2 = new THREE.Group(); leaf2.position.set(29.0, 0, 6); b.root.add(leaf2); leaf2.userData.mirror = true
    b.box(-0.5, 1.1, 0, 1.0, 2.2, 0.06, solid(0x1d4ed8, { rough: 0.35, metal: 0.4 }), { parent: leaf2 })
    b.box(-0.5, 1.1, -0.04, 0.6, 1.6, 0.02, new THREE.MeshPhysicalMaterial({ color: 0xbcd8ee, transparent: true, opacity: 0.35, roughness: 0.05 }), { parent: leaf2 })
    b.box(-0.85, 1.0, -0.06, 0.8, 0.06, 0.05, solid(0xd1d5db, { rough: 0.2, metal: 0.9 }), { parent: leaf2 })
    this.exitLeaf.userData.other = leaf2
    this.exitCollider = b.col.add(28, 1.1, 6, 2.0, 2.2, 0.1)
    const hit = new THREE.Group(); hit.position.set(28, 0, 5.7); b.root.add(hit)
    b.proxy(hit, 2.0, 2.3, 0.6, 1.15)
    b.interactive(hit, { kind: 'exit_door', name: 'Acil Çıkış Kapısı' })
    this.exitDoorObj = hit
    addExitSign(b, 28, 2.6, 5.84, Math.PI, 'none')
    addWallSign(b, 28, 3.05, 5.83, 1.6, 0.4, Math.PI, signTex('ACİL ÇIKIŞ / TOPLANMA ALANI', '#047857', '#fff', undefined, 800, 200), 0.5)
  }

  // ---------------- ofis katları ----------------
  private buildOffices(carpet: THREE.Material): void {
    const b = this.b
    void carpet
    for (const f of [1, 2]) {
      const y = f * FH
      b.withBase(y, () => {
        if (f === 2) {
          for (const [x, z] of [[26.5, -3.2], [29, -3.2], [26.5, 0.8], [29, 0.8], [31, 4.2]] as const) { addOfficeDesk(b, x, z, 0, true); addChair(b, x, z + 0.9, Math.PI) }
        } else {
          // toplantı odası
          b.box(28, 0.74, -0.5, 3.4, 0.06, 1.3, texMat('wood', { color: 0xc9a77c, rough: 0.9 }), { cast: true })
          for (const sx of [-1.4, 1.4]) b.box(28 + sx, 0.37, -0.5, 0.1, 0.74, 1.1, solid(0x374151, { metal: 0.6, rough: 0.5 }), { cast: true })
          b.col.add(28, 0.37, -0.5, 3.4, 0.76, 1.3)
          for (let i = 0; i < 4; i++) { addChair(b, 27 + i * 0.9, -1.6, 0); addChair(b, 27 + i * 0.9, 0.6, Math.PI) }
        }
        addPlant(b, 25.2, 5.0)
        addExtinguisher(b, 34.5, 5.5, Math.PI)
        addExitSign(b, 33.8, 2.7, 3.0, -Math.PI / 2, 'right')
      })
    }
    // kat planı panosu (3. kat, kova duvarı dışı)
    const plan = new THREE.Group(); plan.position.set(34.02, 2 * FH, -2.6); plan.rotation.y = -Math.PI / 2; b.root.add(plan)
    b.box(0, 1.65, 0, 1.58, 1.14, 0.04, solid(0x1f2937, { rough: 0.4, metal: 0.4 }), { parent: plan })
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.06), new THREE.MeshStandardMaterial({ map: planTex(), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.15 }))
    ;(pm.material as THREE.MeshStandardMaterial).emissiveMap = (pm.material as THREE.MeshStandardMaterial).map
    pm.position.set(0, 1.65, 0.025); plan.add(pm)
    b.proxy(plan, 1.7, 1.3, 0.5, 1.65)
    b.interactive(plan, { kind: 'plan', name: 'Tahliye Planı' })
    this.planObj = plan
  }

  // ---------------- pano, duman, kıvılcım ----------------
  private buildPanelAndSmoke(): void {
    const b = this.b
    const y = FH // 2. kat
    const panel = new THREE.Group(); panel.position.set(37.1, y, 0.78); panel.rotation.y = Math.PI; b.root.add(panel)
    // pano gövdesi (kuzeye bakar; rotation PI -> yüz -z)
    b.box(0, 1.5, 0, 0.8, 1.0, 0.18, solid(0x6b7280, { rough: 0.4, metal: 0.6 }), { parent: panel, cast: true })
    b.box(0, 1.5, -0.1, 0.72, 0.92, 0.02, solid(0x9ca3af, { rough: 0.35, metal: 0.7 }), { parent: panel })
    const lbl = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#facc15'; g.fillRect(0, 0, w, h); g.fillStyle = '#111827'; g.font = font(34); g.textAlign = 'center'; g.fillText('⚡ ANA PANO', w / 2, 52); g.font = font(22); g.fillText('YÜKSEK GERİLİM', w / 2, 92) })
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: lbl, roughness: 0.5, emissive: 0xffffff, emissiveMap: lbl, emissiveIntensity: 0.3 })); l.position.set(0, 1.7, -0.115); l.rotation.y = Math.PI; panel.add(l)
    const lever = solid(0xdc2626, { rough: 0.3, metal: 0.3 })
    b.box(0, 1.3, -0.12, 0.1, 0.24, 0.05, lever, { parent: panel })
    b.proxy(panel, 1.0, 1.3, 0.8, 1.5).position.z = -0.35
    b.interactive(panel, { kind: 'panel', name: 'Elektrik Ana Şalteri' })
    this.panelObj = panel
    this.panelLight = new THREE.PointLight(0xffa24a, 3, 6, 1.5); this.panelLight.position.set(37.1, y + 1.5, 0.3); b.root.add(this.panelLight)

    // duman
    const tex = canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
      gr.addColorStop(0, 'rgba(70,70,74,0.8)'); gr.addColorStop(0.55, 'rgba(60,60,64,0.4)'); gr.addColorStop(1, 'rgba(60,60,64,0)')
      g.fillStyle = gr; g.fillRect(0, 0, w, h)
    })
    this.smokeMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false, color: 0x8b8b90 })
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(this.smokeMat)
      const base = new THREE.Vector3(34.6 + b.rand() * 2.9, FH + 0.6 + b.rand() * (FH + 0.4), -5.3 + b.rand() * 6.0)
      s.position.copy(base); s.scale.setScalar(1.3 + b.rand() * 1.4)
      s.visible = false; b.root.add(s); this.smoke.push({ s, base, ph: b.rand() * 6.28 })
    }
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffc46b }))
      m.visible = false; b.root.add(m); this.sparks.push({ m, v: new THREE.Vector3(), life: 0 })
    }
  }

  // ---------------- avlu / toplanma alanı ----------------
  private buildYard(): void {
    const b = this.b
    // toplanma alanı işareti
    const ring = canvasTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.setLineDash([42, 24]); g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 20, 0, Math.PI * 2); g.stroke()
      g.setLineDash([]); g.fillStyle = 'rgba(22,163,74,0.5)'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 40, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#fff'; g.font = font(70); g.textAlign = 'center'; g.fillText('TOPLANMA', w / 2, h / 2 - 8); g.fillText('ALANI', w / 2, h / 2 + 70)
    })
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(ASSEMBLY.r * 2, ASSEMBLY.r * 2), new THREE.MeshStandardMaterial({ map: ring, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }))
    disc.rotation.x = -Math.PI / 2; disc.position.set(ASSEMBLY.x, 0.012, ASSEMBLY.z); disc.renderOrder = 3; b.root.add(disc)
    // tabela
    const post = solid(0x374151, { rough: 0.4, metal: 0.7 })
    b.box(ASSEMBLY.x - 1.4, 1.5, ASSEMBLY.z + ASSEMBLY.r - 0.3, 0.1, 3.0, 0.1, post, { solid: true, cast: true })
    b.box(ASSEMBLY.x + 1.4, 1.5, ASSEMBLY.z + ASSEMBLY.r - 0.3, 0.1, 3.0, 0.1, post, { solid: true, cast: true })
    const st = signTex('TOPLANMA ALANI', '#15803d', '#fff', 'Binadan uzak, güvenli açık alan', 800, 400)
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5), new THREE.MeshStandardMaterial({ map: st, roughness: 0.5 })); sm.position.set(ASSEMBLY.x, 2.4, ASSEMBLY.z + ASSEMBLY.r - 0.36); sm.rotation.y = Math.PI; sm.castShadow = true; b.root.add(sm)
    const sm2 = sm.clone(); sm2.rotation.y = 0; sm2.position.z += 0.1; b.root.add(sm2)
    // çit
    const fenceTex = canvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(190,195,200,0.9)'; g.lineWidth = 3
      for (let i = -h; i < w + h; i += 24) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke() }
    })
    fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping
    const fence = (cx: number, cz: number, len: number, rotY: number) => {
      const t = fenceTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2, 1)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }))
      m.position.set(cx, 1.1, cz); m.rotation.y = rotY; b.root.add(m)
      const n = Math.floor(len / 3)
      for (let i = 0; i <= n; i++) { const p = -len / 2 + (len * i) / n; b.cyl(cx + Math.cos(rotY) * p, 1.15, cz - Math.sin(rotY) * p, 0.04, 0.04, 2.3, solid(0x6b7280, { rough: 0.4, metal: 0.8 }), { seg: 8, cast: true }) }
      if (rotY === 0) b.col.add(cx, 1.1, cz, len, 2.2, 0.15); else b.col.add(cx, 1.1, cz, 0.15, 2.2, len)
    }
    fence(33, 22.5, 26, 0); fence(20.5, 14.5, 16, Math.PI / 2); fence(45.5, 14.5, 16, Math.PI / 2)
    // ağaçlar
    const trunk = solid(0x5b4636, { rough: 1 }), crown = [solid(0x2f6f3a, { rough: 0.9 }), solid(0x3d8344, { rough: 0.9 })]
    const tree = (x: number, z: number, s: number) => {
      b.cyl(x, 1.4 * s, z, 0.18 * s, 0.28 * s, 2.8 * s, trunk, { cast: true, seg: 10 })
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry((1.1 + b.rand() * 0.5) * s, 1), crown[i % 2]); c.position.set(x + (b.rand() - 0.5) * 1.3 * s, (3.2 + b.rand() * 1.2) * s, z + (b.rand() - 0.5) * 1.3 * s); c.castShadow = true; b.root.add(c)
      }
      b.col.add(x, 1.4, z, 0.5, 2.8, 0.5)
    }
    ;[[24, 26], [30, 27], [38, 26.5], [44, 27], [18, 24], [48, 20], [48, 6], [-8, 20], [-20, 21], [10, 22]].forEach(([x, z], i) => tree(x, z, 0.9 + (i % 3) * 0.15))
    // direkler / yol çizgileri
    for (let i = 0; i < 9; i++) b.box(-35 + i * 6.5, 0.0, 22.4, 3, 0.012, 0.15, solid(0xf8fafc, { rough: 0.7 }))
  }

  // ---------------- akış ----------------
  startDrill(): void {
    this.drillActive = true; this.powerOff = false; this.smokeLevel = 1; this.exitOpen = false; this.planViewed = false
    this.smoke.forEach(s => (s.s.visible = true))
    if (this.exitCollider) this.exitCollider.enabled = true
    this.exitAnim = 0
    this.exitLeaf.rotation.y = 0; ;(this.exitLeaf.userData.other as THREE.Group).rotation.y = 0
    if (!this.b.interactives.includes(this.panelObj!)) this.b.interactives.push(this.panelObj!)
    this.b.setPower('b0', 0.55); this.b.setPower('b1', 0.45); this.b.setPower('b2', 0.5); this.b.setPower('stair', 0.5)
  }
  resetDrill(): void {
    this.drillActive = false; this.powerOff = false; this.smokeLevel = 0
    this.smoke.forEach(s => (s.s.visible = false)); this.strobe.forEach(s => (s.intensity = 0)); this.panelLight.intensity = 0
    this.b.setPower('b0', 1); this.b.setPower('b1', 1); this.b.setPower('b2', 1); this.b.setPower('stair', 1)
    this.emerg.forEach(m => (m.emissiveIntensity = 0.9))
    if (this.exitCollider) this.exitCollider.enabled = true
    this.exitOpen = false; this.exitAnim = 0
    this.exitLeaf.rotation.y = 0; ;(this.exitLeaf.userData.other as THREE.Group).rotation.y = 0
  }
  cutPower(): void { this.powerOff = true }
  openExit(): void { this.exitOpen = true; if (this.exitCollider) this.exitCollider.enabled = false }

  /** Oyuncu duman bölgesinde mi? (2. kat merdiven kovası hacmi) */
  inSmoke(x: number, y: number, z: number): boolean {
    return this.drillActive && this.smokeLevel > 0.2 && x > 34.2 && x < 37.8 && z > -6 && z < 0.9 && y > FH - 0.3 && y < 2 * FH + 0.5
  }
  inAssembly(x: number, z: number): boolean { return Math.hypot(x - ASSEMBLY.x, z - ASSEMBLY.z) < ASSEMBLY.r - 0.6 }

  update(dt: number): void {
    this.t += dt
    const t = this.t
    if (this.powerOff) this.smokeLevel = Math.max(0, this.smokeLevel - dt / 6)
    this.smokeMat.opacity = 0.5 * this.smokeLevel
    for (const s of this.smoke) {
      if (!s.s.visible) continue
      s.s.position.set(s.base.x + Math.sin(t * 0.3 + s.ph) * 0.35, s.base.y + Math.sin(t * 0.4 + s.ph * 1.7) * 0.25, s.base.z + Math.cos(t * 0.25 + s.ph) * 0.35)
      if (this.smokeLevel <= 0.01) s.s.visible = false
    }
    // alarm stroboskobu
    const flash = this.drillActive ? (Math.sin(t * 8) > 0.4 ? 1 : 0) : 0
    this.strobe.forEach(s => (s.intensity = flash * 14))
    // pano kıvılcımı
    const sparking = this.drillActive && !this.powerOff
    this.panelLight.intensity = sparking ? (Math.random() < 0.5 ? 6 + Math.random() * 6 : 0.5) : 0
    this.sparkT -= dt
    if (sparking && this.sparkT < 0) {
      this.sparkT = 0.09 + Math.random() * 0.2
      const sp = this.sparks.find(s => s.life <= 0)
      if (sp) { sp.life = 0.6; sp.m.visible = true; sp.m.position.set(37.1 + (Math.random() - 0.5) * 0.4, FH + 1.6, 0.55); sp.v.set((Math.random() - 0.5) * 1.2, Math.random() * 1.2, -0.4 - Math.random() * 1.0) }
    }
    for (const sp of this.sparks) if (sp.life > 0) {
      sp.life -= dt; sp.v.y -= 9.8 * dt; sp.m.position.addScaledVector(sp.v, dt)
      if (sp.life <= 0 || sp.m.position.y < FH + 0.03) { sp.life = 0; sp.m.visible = false }
    }
    // çıkış kapısı animasyonu
    if (this.exitOpen && this.exitAnim < 1) {
      this.exitAnim = Math.min(1, this.exitAnim + dt * 1.6)
      const a = this.exitAnim * 1.7
      this.exitLeaf.rotation.y = a; ;(this.exitLeaf.userData.other as THREE.Group).rotation.y = -a
    }
  }
}
