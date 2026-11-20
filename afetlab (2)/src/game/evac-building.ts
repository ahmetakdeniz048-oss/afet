import * as THREE from 'three'
import { Builder, solid, texMat } from './builder'
import { addChair, addExitSign, addExtinguisher, addOfficeDesk, addPlant, addWallSign } from './props'
import { canvasTex, font, signTex } from './textures'

export const FH = 3.6
export const BLD = { x0: 24, x1: 56, z0: -10, z1: 10 }
export const STAIR = { x0: 49.2, x1: 55.8, z0: -9.8, z1: -2.0 }
export const ASSEMBLY = { x: 64.5, z: -5.8, r: 5.2 }
export const SPAWN3 = { x: 44, y: 2 * FH, z: 0 }
export const LOBBY_TERMINAL = { x: 26.5, z: 0.8 }
const ROOM_CENTERS = [28.2, 36.5, 44.5]
const LEVELS = [0, FH, 2 * FH]

type Door = { root: THREE.Group; collider: ReturnType<Builder['col']['add']>; floor: number; exit?: boolean; opened: boolean; target: number }
type EmergencyLight = { point: THREE.PointLight; lens: THREE.Mesh; intensity: number }

const arrowShape = new THREE.Shape()
arrowShape.moveTo(-0.46, -0.15); arrowShape.lineTo(0.06, -0.15); arrowShape.lineTo(0.06, -0.32)
arrowShape.lineTo(0.48, 0); arrowShape.lineTo(0.06, 0.32); arrowShape.lineTo(0.06, 0.15)
arrowShape.lineTo(-0.46, 0.15); arrowShape.closePath()
const EMERGENCY_ARROW = new THREE.ShapeGeometry(arrowShape)

export function planTex(): THREE.CanvasTexture {
  return canvasTex(1100, 760, (g, w, h) => {
    g.fillStyle = '#f8fafc'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#064e3b'; g.fillRect(0, 0, w, 88)
    g.fillStyle = '#fff'; g.font = font(42); g.textAlign = 'left'; g.fillText('TAHLİYE PLANI – 3. KAT', 34, 60)
    const x = (v: number) => 90 + (v - BLD.x0) * 29, z = (v: number) => 158 + (v - BLD.z0) * 25
    const rect = (x0: number, z0: number, x1: number, z1: number, fill: string, stroke = '#334155') => { g.fillStyle = fill; g.fillRect(x(x0), z(z0), x(x1) - x(x0), z(z1) - z(z0)); g.strokeStyle = stroke; g.lineWidth = 4; g.strokeRect(x(x0), z(z0), x(x1) - x(x0), z(z1) - z(z0)) }
    rect(24, -10, 56, 10, '#e2e8f0')
    rect(24, -2, 56, 2, '#cbd5e1', '#64748b')
    rect(49.2, -9.8, 55.8, -2, '#d1fae5', '#047857')
    const bands: [number, number, string][] = [[-9.8, -2, '#dbeafe'], [2, 9.8, '#fef3c7']]
    for (const [z0, z1, c] of bands) {
      for (let i = 0; i < 3; i++) {
        const a = 24.2 + i * 8.2, b = a + 8.0
        rect(a, z0, b, z1, c)
        g.fillStyle = '#0f172a'; g.font = font(18); g.textAlign = 'center'; g.fillText(`ODA ${i + 1 + (z0 > 0 ? 3 : 0)}`, (x(a) + x(b)) / 2, (z(z0) + z(z1)) / 2 + 6)
      }
    }
    g.fillStyle = '#065f46'; g.font = font(19); g.textAlign = 'center'; g.fillText('UZUN TAHLİYE KORİDORU', (x(24) + x(56)) / 2, z(0) + 7)
    g.fillStyle = '#7f1d1d'; g.font = font(16); g.fillText('ASANSÖR', x(35), z(-1.25)); g.fillText('ASANSÖR', x(39), z(-1.25))
    g.fillStyle = '#047857'; g.fillText('AYRI YANGIN MERDİVENİ', x(52.5), z(-6.0))
    g.strokeStyle = '#16a34a'; g.lineWidth = 8; g.setLineDash([18, 12]); g.beginPath(); g.moveTo(x(44), z(0)); g.lineTo(x(52.5), z(0)); g.lineTo(x(52.5), z(-6.4)); g.lineTo(x(52.5), z(-2.9)); g.stroke(); g.setLineDash([])
    g.fillStyle = '#ef4444'; g.beginPath(); g.arc(x(44), z(0), 11, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#0f172a'; g.font = font(22); g.textAlign = 'left'; g.fillText('Kapıdaki panik barına basıp ayrı yangın merdivenine girin.', 36, 690); g.fillText('2. katta ana şalteri kapatın; asansörü kullanmayın.', 36, 725)
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
  smokeLevel = 0
  private smoke: { s: THREE.Sprite; base: THREE.Vector3; ph: number }[] = []
  private smokeMat!: THREE.SpriteMaterial
  private sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = []
  private sparkT = 0
  private panelLight!: THREE.PointLight
  private strobe: THREE.PointLight[] = []
  private doors: Door[] = []
  private exitDoor!: Door
  private panelLever!: THREE.Mesh
  private emergencyLights: EmergencyLight[] = []
  private emergencySigns: THREE.Mesh[] = []
  private emergencyGuides: THREE.Group[] = []
  emergencyMode = false
  private t = 0

  constructor(private b: Builder) {}

  build(): void {
    const b = this.b
    const { x0, x1, z0, z1 } = BLD
    const brick = texMat('brick', { color: 0xd4c4b2, rough: 1 })
    const plaster = texMat('plaster', { color: 0xe7e7e2, rough: 1 })
    const conc = texMat('concrete', { color: 0xbfc3c9, rough: 1 })
    const ceiling = texMat('ceiling', { color: 0xf4f5f6, rough: 1 })
    const floor = texMat('tile', { color: 0xd8dde2, rough: 0.85, env: 0.28 })
    const stairConcrete = texMat('concrete', { color: 0xaeb4bb, rough: 1 })

    // Three storeys and a separate, open-to-below stair shaft.
    b.floor(x0, z0, x1, z1, 0, floor, 0.22, true)
    for (const y of [FH, 2 * FH]) this.slab(y, conc, ceiling)
    b.box((x0 + x1) / 2, 3 * FH + 0.18, 0, x1 - x0 + 0.4, 0.36, z1 - z0 + 0.4, conc, { solid: true, cast: true })

    for (let f = 0; f < 3; f++) {
      const y = LEVELS[f], zone = `b${f}`
      const westOpen = f === 0 ? [{ at: 0, w: 2.7, h: 2.6, kind: 'door' as const }] : [{ at: 0, w: 2.2, h: 1.5, sill: 1.0, kind: 'window' as const }]
      const eastOpen = f === 0 ? [{ at: -6.1, w: 1.8, h: 2.3, kind: 'door' as const }] : [-7, 4.6].map(at => ({ at, w: 2.3, h: 1.45, sill: 1.0, kind: 'window' as const }))
      b.wallZ(x0, z0, z1, y, FH, brick, westOpen)
      b.wallZ(x1, z0, z1, y, FH, brick, eastOpen)
      b.wallX(z0, x0, x1, y, FH, brick, ROOM_CENTERS.map(at => ({ at, w: 2.1, h: 1.45, sill: 1.0, kind: 'window' as const })))
      b.wallX(z1, x0, x1, y, FH, brick, ROOM_CENTERS.map(at => ({ at, w: 2.1, h: 1.45, sill: 1.0, kind: 'window' as const })))

      // The central corridor is open along the full axis; three rooms on each side.
      const northDoors = ROOM_CENTERS.map(at => ({ at, w: 1.55, h: 2.35, kind: 'door' as const }))
      const southDoors = ROOM_CENTERS.map(at => ({ at, w: 1.55, h: 2.35, kind: 'door' as const }))
      b.wallX(-2, x0, 49.2, y, FH, plaster, northDoors, 0.2)
      b.wallX(2, x0, x1, y, FH, plaster, southDoors, 0.2)

      // Room dividers and the west/east stair-core firewall.
      for (const x of [32.4, 40.6]) {
        b.wallZ(x, -9.8, -2, y, FH, plaster, [], 0.2)
        b.wallZ(x, 2, 9.8, y, FH, plaster, [], 0.2)
      }
      b.wallZ(49.2, -10, -2, y, FH, plaster, [], 0.25)
      b.wallX(-9.8, 49.2, x1, y, FH, plaster, [], 0.25)
      // Fire stair partition at the corridor edge; the opening is a fire door.
      b.wallX(-2, 49.2, 56, y, FH, plaster, [{ at: 52.5, w: 1.65, h: 2.35, kind: 'door' }], 0.25)

      // Wayfinding and six distinct training rooms.
      const roomNames = ['İLK YARDIM', 'AİLE PLANI', 'EĞİTİM SINIFI', 'GÜVENLİK', 'TOPLANMA', 'KOORDİNASYON']
      for (let i = 0; i < 3; i++) {
        const lo = 24.3 + i * 8.1, hi = lo + 7.9, cx = (lo + hi) / 2
        for (const side of [-1, 1]) {
          const roomId = i + (side > 0 ? 3 : 0)
          const zc = side < 0 ? -6 : 6
          const label = signTex(`ODA 0${roomId + 1}`, '#14532d', '#fff', roomNames[roomId], 460, 170)
          addWallSign(b, cx, y + 2.75, side < 0 ? -1.88 : 1.88, 1.25, 0.44, side < 0 ? 0 : Math.PI, label, 0.3)
          const deskZ = zc + (side < 0 ? 0.6 : -0.6)
          addOfficeDesk(b, cx, deskZ, side < 0 ? Math.PI : 0, true)
          addChair(b, cx + (side < 0 ? 0 : -0.9), deskZ + (side < 0 ? 1.0 : -1.0), side < 0 ? Math.PI : 0)
          if (i === 0) addExtinguisher(b, lo + 0.4, side < 0 ? -2.35 : 2.35, side < 0 ? Math.PI : 0)
        }
      }

      // Elevator doors face the hallway; the shafts are clearly labelled and unusable in emergencies.
      for (const x of [33.6, 39.3]) this.buildElevator(x, y, f)
      for (let x = 26; x <= 50; x += 4) {
        b.fixture(zone, x, y + FH - 0.12, 0, 1.45, 0.38)
        b.pointLight(zone, x, y + 2.75, 0, 4.2, 5.4, 0xfff3dc)
      }
      const alarm = new THREE.PointLight(0xff2518, 0, 10, 1.6); alarm.position.set(45, y + 3.05, 0); b.root.add(alarm); this.strobe.push(alarm)
      addExitSign(b, 51.5, y + 2.72, -1.83, 0, 'right')

      // A closed panic-bar fire door on each floor, accessed from the long corridor.
      this.buildStairDoor(52.5, y, -2.12, f)
    }

    this.buildStairs(stairConcrete)
    this.buildReception(brick)
    this.buildPanelAndSmoke()
    this.buildPlan()
    this.buildExteriorExit(brick)
    this.buildYard()
    this.buildEmergencyWayfinding()
  }

  private slab(y: number, top: THREE.Material, underside: THREE.Material): void {
    const b = this.b, { x0, x1, z0, z1 } = BLD, h = 0.2
    const holes = STAIR
    const pieces: [number, number, number, number][] = [
      [x0, z0, holes.x0, z1], [holes.x1, z0, x1, z1],
      [holes.x0, z0, holes.x1, holes.z0], [holes.x0, holes.z1, holes.x1, z1],
    ]
    for (const [a, c, d, e] of pieces) {
      const w = d - a, dep = e - c, cx = (a + d) / 2, cz = (c + e) / 2
      b.box(cx, y - h / 2, cz, w, h, dep, top, { cast: true, recv: true })
      b.box(cx, y - h - 0.02, cz, w, 0.04, dep, underside, { cast: true })
      b.col.addRange(a, y - h, c, d, y, e)
    }
  }

  private buildElevator(x: number, y: number, floor: number): void {
    const b = this.b
    const group = new THREE.Group(); group.position.set(x, y, -1.76); b.root.add(group)
    const frame = solid(0x465260, { rough: 0.38, metal: 0.75 })
    const panel = solid(0x212a34, { rough: 0.3, metal: 0.65 })
    const steel = solid(0x9ca8b3, { rough: 0.27, metal: 0.88 })
    b.box(0, 1.18, 0, 1.75, 2.45, 0.18, frame, { parent: group, cast: true })
    b.box(0, 1.17, 0.105, 1.48, 2.16, 0.035, panel, { parent: group })
    for (const dx of [-0.35, 0.35]) b.box(dx, 1.16, 0.13, 0.66, 2.05, 0.028, steel, { parent: group })
    b.box(0.95, 1.34, 0.05, 0.18, 0.38, 0.08, frame, { parent: group })
    b.box(0.95, 1.42, 0.11, 0.08, 0.08, 0.02, solid(0x4ade80, { emissive: 0x22c55e, ei: 0.8 }), { parent: group })
    const sign = signTex('ASANSÖR', '#1f2937', '#fff', 'ACİL DURUMDA KULLANMA', 520, 170)
    addWallSign(b, x, y + 2.85, -1.64, 1.55, 0.42, 0, sign, 0.25)
    b.proxy(group, 2.4, 2.6, 0.8, 1.3)
    b.interactive(group, { kind: 'elevator', name: `Asansör – ${floor + 1}. kat` })
    this.elevators.push(group)
  }

  private panicDoor(x: number, y: number, z: number, width: number, height: number, axis: 'x' | 'z', color = 0x14532d): THREE.Group {
    const b = this.b, g = new THREE.Group()
    // The group origin is the hinge; the slab is offset from it instead of spinning around its centre.
    if (axis === 'x') g.position.set(x - width / 2, y, z)
    else g.position.set(x, y, z - width / 2)
    b.root.add(g)
    const leaf = solid(color, { rough: 0.45, metal: 0.22 })
    const window = solid(0x526878, { rough: 0.3, metal: 0.35 })
    const hinge = solid(0x1f2937, { rough: 0.32, metal: 0.72 })
    const center = width / 2
    if (axis === 'x') {
      b.box(center, height / 2, 0, width, height, 0.08, leaf, { parent: g, cast: true })
      b.box(center, height * 0.68, 0.047, width * 0.48, 0.48, 0.015, window, { parent: g })
      const bar = solid(0xdbe4ea, { rough: 0.3, metal: 0.82 })
      const mount = solid(0x111827, { rough: 0.35, metal: 0.75 })
      b.box(center, 1.03, 0.07, width * 0.66, 0.075, 0.06, bar, { parent: g })
      b.box(center - width * 0.33, 1.03, 0.06, 0.05, 0.17, 0.05, mount, { parent: g })
      b.box(center + width * 0.33, 1.03, 0.06, 0.05, 0.17, 0.05, mount, { parent: g })
      // Double-sided panic hardware lets evacuees leave the stair shaft on each landing.
      b.box(center, 1.03, -0.07, width * 0.66, 0.075, 0.06, bar, { parent: g })
      b.box(center - width * 0.33, 1.03, -0.06, 0.05, 0.17, 0.05, mount, { parent: g })
      b.box(center + width * 0.33, 1.03, -0.06, 0.05, 0.17, 0.05, mount, { parent: g })
    } else {
      b.box(0, height / 2, center, 0.08, height, width, leaf, { parent: g, cast: true })
      b.box(0.047, height * 0.68, center, 0.015, 0.48, width * 0.48, window, { parent: g })
      const bar = solid(0xdbe4ea, { rough: 0.3, metal: 0.82 }), mount = solid(0x111827, { rough: 0.35, metal: 0.75 })
      for (const side of [-1, 1]) {
        b.box(side * 0.07, 1.03, center, 0.06, 0.075, width * 0.66, bar, { parent: g })
        b.box(side * 0.06, 1.03, center - width * 0.33, 0.05, 0.17, 0.05, mount, { parent: g })
        b.box(side * 0.06, 1.03, center + width * 0.33, 0.05, 0.17, 0.05, mount, { parent: g })
      }
    }
    for (const hy of [0.3, height / 2, height - 0.3]) b.box(0, hy, 0, 0.1, 0.12, 0.1, hinge, { parent: g })
    return g
  }

  private buildStairDoor(x: number, y: number, z: number, floor: number): void {
    const b = this.b, root = this.panicDoor(x, y, z, 1.55, 2.35, 'x')
    const collider = b.col.add(x, y + 1.17, z, 1.55, 2.35, 0.18)
    for (const side of [-1, 1]) {
      const target = new THREE.Group(); target.position.set(x, y, z + side * 0.28); b.root.add(target)
      b.proxy(target, 1.9, 2.45, 0.42, 1.22)
      b.interactive(target, { kind: 'stair_door', name: 'Panik barlı yangın kapısı', floor })
    }
    this.doors.push({ root, collider, floor, opened: false, target: 0 })
  }

  private buildStairs(concrete: THREE.Material): void {
    const b = this.b, tread = texMat('concrete', { color: 0xa8adb3, rough: 1 }), nose = solid(0xfacc15, { rough: 0.55 }), rail = solid(0x3d4852, { rough: 0.3, metal: 0.82 })
    // Open-to-below core floors have a separate flat stair landing at each level.
    for (const level of [0, FH, 2 * FH]) {
      if (level > 0) {
        b.box(52.5, level - 0.04, -3.55, 6.0, 0.08, 4.5, concrete, { cast: true })
        // Keep the rendered slab thickness, but use a thin top-surface collider so the lower flight retains headroom.
        b.col.add(52.5, level - 0.005, -3.55, 6.0, 0.01, 4.5)
      }
    }
    for (const base of [0, FH]) {
      for (let i = 1; i <= 10; i++) {
        const top = base + 0.18 * i, zc = -2.95 - 0.29 * (i - 0.5)
        b.box(50.65, (base + top) / 2, zc, 1.55, top - base, 0.29, tread, { cast: true })
        // Narrow walkable tread only; a full triangular collider traps the player against the risers while descending.
        b.col.add(50.65, top - 0.09, zc, 1.55, 0.18, 0.46)
        b.box(50.65, top - 0.006, zc - 0.12, 1.48, 0.012, 0.035, nose)
      }
      // Half-floor landing (not a solid vertical block): its upper face is the walkable surface.
      const mid = base + 1.8
      b.box(52.5, mid - 0.04, -7.45, 5.7, 0.08, 3.35, concrete, { cast: true })
      b.col.add(52.5, mid - 0.005, -7.45, 5.7, 0.01, 3.35)
      for (let i = 1; i <= 10; i++) {
        const top = base + 1.8 + 0.18 * i, zc = -8.12 + 0.29 * (i - 0.5)
        b.box(54.35, (base + 1.8 + top) / 2, zc, 1.55, top - (base + 1.8), 0.29, tread, { cast: true })
        // Slight tread overlap gives a continuous safe footing without changing the visible step rhythm.
        b.col.add(54.35, top - 0.09, zc, 1.55, 0.18, 0.56)
        b.box(54.35, top - 0.006, zc + 0.12, 1.48, 0.012, 0.035, nose)
      }
      // The deeper landing below catches a missed turn and the backstop prevents walking off the shaft.
      this.addRails(50.65, -2.95, -5.85, base, base + 1.8, rail)
      this.addRails(54.35, -8.12, -5.22, base + 1.8, base + 3.6, rail)
      this.addLandingBarrier(49.65, 55.35, -9.12, base + 1.8, rail)
      this.addLandingSideBarrier(49.65, -9.12, -5.74, base + 1.8, rail)
      this.addLandingSideBarrier(55.35, -9.12, -5.74, base + 1.8, rail)
      this.addLandingBarrier(51.55, 55.25, -5.74, base + 1.8, rail)
    }
    for (let f = 0; f < 3; f++) {
      const sign = signTex(`KAT ${f + 1}`, '#047857', '#fff', 'YANGIN MERDİVENİ', 420, 150)
      addWallSign(b, 49.35, f * FH + 2.0, -4.35, 0.95, 0.6, Math.PI / 2, sign, 0.3)
      b.fixture('stair', 52.5, f * FH + FH - 0.12, -7.0, 1.0, 0.32)
      b.pointLight('stair', 52.5, f * FH + 2.7, -6.2, 3.5, 5.2, 0xe4f1ff)
    }
    for (const base of [0, FH]) {
      const mid = base + 1.8
      const onward = base === 0 ? 'Sola dönün · zemin kata devam' : 'Sola dönün · 2. kata devam'
      addWallSign(b, 49.35, mid + 1.12, -7.25, 1.55, 0.4, Math.PI / 2,
        signTex('ARA SAHANLIK', '#14532d', '#fff', onward, 560, 160), 0.24)
    }
  }

  private addRails(x: number, z0: number, z1: number, y0: number, y1: number, mat: THREE.Material): void {
    const b = this.b
    for (const dx of [-0.82, 0.82]) {
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, z = z0 + (z1 - z0) * t, stepY = y0 + (y1 - y0) * t
        b.box(x + dx, stepY + 0.48, z, 0.055, 0.96, 0.055, mat, { cast: true })
      }
      for (const [offset, thickness] of [[0.92, 0.055], [0.5, 0.04]]) {
        const railY0 = y0 + offset, railY1 = y1 + offset
        const dz = z1 - z0, dy = railY1 - railY0, length = Math.hypot(dz, dy)
        const bar = b.box(x + dx, (railY0 + railY1) / 2, (z0 + z1) / 2, 0.055, thickness, length, mat, { cast: true })
        bar.rotation.x = -Math.atan2(dy, dz)
      }
      const low = Math.min(y0, y1)
      const high = Math.max(y0, y1)
      b.col.add(x + dx, low + (high - low + 1.0) / 2, (z0 + z1) / 2, 0.09, high - low + 1.0, Math.abs(z1 - z0) + 0.12)
    }
  }

  private addLandingBarrier(x0: number, x1: number, z: number, y: number, mat: THREE.Material): void {
    const b = this.b, cx = (x0 + x1) / 2, w = x1 - x0
    b.box(cx, y + 0.92, z, w, 0.07, 0.07, mat, { cast: true })
    b.box(cx, y + 0.5, z, w, 0.045, 0.045, mat, { cast: true })
    for (let x = x0; x <= x1 + 0.01; x += 0.65) b.box(x, y + 0.48, z, 0.05, 0.96, 0.05, mat, { cast: true })
    b.col.add(cx, y + 0.48, z, w, 0.96, 0.09)
  }

  private addLandingSideBarrier(x: number, z0: number, z1: number, y: number, mat: THREE.Material): void {
    const b = this.b, length = Math.abs(z1 - z0), cz = (z0 + z1) / 2
    b.box(x, y + 0.92, cz, 0.07, 0.07, length, mat, { cast: true })
    b.box(x, y + 0.5, cz, 0.045, 0.045, length, mat, { cast: true })
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1) + 0.01; z += 0.65) b.box(x, y + 0.48, z, 0.05, 0.96, 0.05, mat, { cast: true })
    b.col.add(x, y + 0.48, cz, 0.09, 0.96, length)
  }

  private addEmergencyArrow(x: number, y: number, z: number, angle: number): void {
    const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.x = -Math.PI / 2
    const material = new THREE.MeshBasicMaterial({ color: 0x36ef85, transparent: true, opacity: 0.96, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    const arrow = new THREE.Mesh(EMERGENCY_ARROW, material); arrow.rotation.z = angle; arrow.renderOrder = 3; group.add(arrow)
    group.visible = false; this.b.root.add(group); this.emergencyGuides.push(group)
  }

  private addEmergencySign(x: number, y: number, z: number, rotY: number, title: string, subtitle: string): void {
    const tex = signTex(title, '#047857', '#fff', subtitle, 620, 190)
    const material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.46), material)
    sign.position.set(x, y, z); sign.rotation.y = rotY; sign.visible = false; this.b.root.add(sign); this.emergencySigns.push(sign)
  }

  private addEmergencyLight(x: number, y: number, z: number, intensity: number, distance: number): void {
    const body = this.b.box(x, y, z, 0.78, 0.09, 0.24, solid(0x465360, { rough: 0.38, metal: 0.52 }), { cast: true })
    void body
    const lensMaterial = new THREE.MeshBasicMaterial({ color: 0x1c2931, toneMapped: false })
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.035, 0.15), lensMaterial)
    lens.position.set(x, y - 0.055, z); this.b.root.add(lens)
    const point = new THREE.PointLight(0xffe7ae, 0, distance, 1.8); point.position.set(x, y - 0.08, z); this.b.root.add(point)
    this.emergencyLights.push({ point, lens, intensity })
  }

  private buildEmergencyWayfinding(): void {
    for (let floor = 0; floor < 3; floor++) {
      const level = floor * FH
      for (const x of [42.4, 45.7, 49.0]) this.addEmergencyArrow(x, level + 0.018, 0.55, 0)
      this.addEmergencyArrow(51.8, level + 0.018, -0.55, Math.PI / 2)
      const corridorLabel = floor === 0 ? 'ACİL ÇIKIŞ →' : 'YANGIN MERDİVENİ →'
      this.addEmergencySign(50.1, level + 2.88, -1.82, 0, corridorLabel, `KAT ${floor + 1} · PANİK BARLI KAPI`)
      const stairLabel = floor === 0 ? 'ZEMİN KAT → ÇIKIŞ' : floor === 1 ? '2. KAT ↓ ZEMİN' : '3. KAT ↓ 2. KAT'
      this.addEmergencySign(49.42, level + 2.18, -4.35, Math.PI / 2, stairLabel, 'Merdiven korkuluğunu takip edin')
      this.addEmergencyLight(51.0, level + 3.25, -0.6, 4.4, 8.0)
      this.addEmergencyLight(52.5, level + 3.18, -4.2, 3.8, 7.0)
    }
    for (const base of [0, FH]) {
      const mid = base + 1.8
      this.addEmergencyLight(52.5, mid + 1.42, -7.25, 3.8, 6.5)
      this.addEmergencyArrow(52.5, mid + 0.018, -7.25, -2.59)
      const nextFloor = base === 0 ? 'ZEMİN KATA DEVAM' : '2. KATA DEVAM'
      this.addEmergencySign(55.08, mid + 1.28, -7.25, -Math.PI / 2, 'SOLA DÖNÜN', nextFloor)
      for (const t of [0.25, 0.5, 0.75]) {
        this.addEmergencyArrow(50.65, base + 1.8 - 1.8 * t + 0.018, -5.85 + 2.9 * t, -Math.PI / 2)
        this.addEmergencyArrow(54.35, base + 3.6 - 1.8 * t + 0.018, -5.22 - 2.9 * t, Math.PI / 2)
      }
    }
    for (const x of [53.0, 54.0, 55.0]) this.addEmergencyArrow(x, 0.018, -6.1, 0)
    this.addEmergencySign(54.25, 2.65, -6.35, Math.PI / 2, 'ACİL ÇIKIŞ →', 'Kapıyı açın, toplanma alanına gidin')
  }

  private buildReception(brick: THREE.Material): void {
    const b = this.b, wood = texMat('wood', { color: 0xb9a17f, rough: 0.82 })
    // Keep a clear entry lane; the reception desk is against the solid north wall, clear of the doorway.
    b.box(25.7, 0.57, -1.45, 2.2, 1.14, 0.72, solid(0x0f5d58, { rough: 0.48 }), { cast: true })
    b.box(25.7, 1.17, -1.45, 2.3, 0.07, 0.82, wood, { cast: true })
    b.col.add(25.7, 0.6, -1.45, 2.2, 1.2, 0.72)
    addWallSign(b, 25.7, 1.72, -1.84, 2.0, 0.42, 0, signTex('TAHLİYE MERKEZİ', '#065f46', '#fff', 'Tatbikat kayıt noktası', 640, 160), 0.25)
    addPlant(b, 30.5, 1.2, 1)
    addExtinguisher(b, 25.2, 2.0, Math.PI)
    // Face the start station toward the west entrance and keep its approach clear.
    const term = new THREE.Group(); term.position.set(LOBBY_TERMINAL.x, 0, LOBBY_TERMINAL.z); b.root.add(term)
    term.rotation.y = -Math.PI / 2
    b.box(0, 0.62, 0, 0.62, 1.24, 0.48, solid(0x253142, { rough: 0.38, metal: 0.45 }), { parent: term, cast: true })
    const tex = canvasTex(320, 220, (g, w, h) => { g.fillStyle = '#052e16'; g.fillRect(0, 0, w, h); g.fillStyle = '#4ade80'; g.font = font(32); g.textAlign = 'center'; g.fillText('TAHLİYE', w / 2, 68); g.fillText('TATBİKATI', w / 2, 108); g.fillStyle = '#fff'; g.font = font(24); g.fillText('[E] BAŞLAT', w / 2, 178) })
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.32), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.8 }))
    face.position.set(0, 0.93, 0.25); term.add(face)
    b.col.add(LOBBY_TERMINAL.x, 0.62, LOBBY_TERMINAL.z, 0.7, 1.25, 0.5)
    b.proxy(term, 1, 1.35, 0.8, 0.68); b.interactive(term, { kind: 'drill_start', name: 'Tahliye Tatbikatını Başlat' })
    this.terminalObj = term
    void brick
  }

  private buildPanelAndSmoke(): void {
    const b = this.b, y = FH, panel = new THREE.Group()
    panel.position.set(49.0, y, 1.72); b.root.add(panel)
    b.box(0, 1.47, 0, 0.76, 1.02, 0.18, solid(0x53616d, { rough: 0.42, metal: 0.55 }), { parent: panel, cast: true })
    b.box(0, 1.47, -0.105, 0.66, 0.9, 0.02, solid(0x252d35, { rough: 0.35, metal: 0.55 }), { parent: panel })
    const label = canvasTex(320, 150, (g, w, h) => { g.fillStyle = '#facc15'; g.fillRect(0, 0, w, h); g.fillStyle = '#111827'; g.font = font(34); g.textAlign = 'center'; g.fillText('ANA ELEKTRİK', w / 2, 58); g.font = font(24); g.fillText('ŞALTERİ', w / 2, 112) })
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.28), new THREE.MeshStandardMaterial({ map: label, emissive: 0xffffff, emissiveMap: label, emissiveIntensity: 0.12 }))
    plate.position.set(0, 1.73, -0.12); plate.rotation.y = Math.PI; panel.add(plate)
    this.panelLever = b.box(0.18, 1.22, -0.14, 0.09, 0.26, 0.07, solid(0xdc2626, { rough: 0.32, metal: 0.35 }), { parent: panel, cast: true })
    b.proxy(panel, 1.0, 1.4, 0.9, 1.5); b.interactive(panel, { kind: 'panel', name: '2. kat ana elektrik şalteri' })
    this.panelObj = panel
    this.panelLight = new THREE.PointLight(0xff9b45, 0, 7, 1.6); this.panelLight.position.set(48.9, y + 1.6, 1.0); b.root.add(this.panelLight)

    const smokeTex = canvasTex(128, 128, (g, w, h) => { const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64); grad.addColorStop(0, 'rgba(54,58,63,.75)'); grad.addColorStop(.55, 'rgba(60,64,70,.38)'); grad.addColorStop(1, 'rgba(60,64,70,0)'); g.fillStyle = grad; g.fillRect(0, 0, w, h) })
    this.smokeMat = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false, color: 0x818890 })
    for (let i = 0; i < 44; i++) {
      const s = new THREE.Sprite(this.smokeMat)
      const base = new THREE.Vector3(46.0 + b.rand() * 4.3, FH + 0.45 + b.rand() * 3.2, -0.8 + b.rand() * 3.6)
      s.position.copy(base); s.scale.setScalar(1.15 + b.rand() * 1.4); s.visible = false; b.root.add(s)
      this.smoke.push({ s, base, ph: b.rand() * Math.PI * 2 })
    }
    for (let i = 0; i < 22; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb75d }))
      mesh.visible = false; b.root.add(mesh); this.sparks.push({ m: mesh, v: new THREE.Vector3(), life: 0 })
    }
  }

  private buildPlan(): void {
    const b = this.b, g = new THREE.Group(); g.position.set(47.6, 2 * FH, -1.88); g.rotation.y = 0; b.root.add(g)
    b.box(0, 1.65, 0, 1.55, 1.18, 0.05, solid(0x263341, { rough: 0.4, metal: 0.45 }), { parent: g })
    const map = planTex(), m = new THREE.Mesh(new THREE.PlaneGeometry(1.47, 1.08), new THREE.MeshStandardMaterial({ map, roughness: 0.55, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.12 }))
    m.position.set(0, 1.65, 0.035); g.add(m)
    b.proxy(g, 1.75, 1.4, 0.5, 1.65); b.interactive(g, { kind: 'plan', name: 'Tahliye Kat Planı' }); this.planObj = g
  }

  private buildExteriorExit(_brick: THREE.Material): void {
    const b = this.b
    // Ground-floor final exit is a single outward-opening panic-bar door on the stair core's east wall.
    const door = this.panicDoor(55.88, 0, -6.1, 1.8, 2.3, 'z', 0x14532d)
    door.position.x = 56.0
    this.exitDoor = { root: door, collider: b.col.add(56.0, 1.15, -6.1, 0.18, 2.3, 1.8), floor: 0, exit: true, opened: false, target: 0 }
    const hit = new THREE.Group(); hit.position.set(55.55, 0, -6.1); b.root.add(hit); b.proxy(hit, 1.0, 2.5, 2.2, 1.25)
    b.interactive(hit, { kind: 'exit_door', name: 'Panik barlı acil çıkış kapısı' }); this.exitDoorObj = hit
    addExitSign(b, 55.84, 2.66, -6.1, -Math.PI / 2, 'right')
    addWallSign(b, 55.84, 3.0, -6.1, 1.4, 0.38, -Math.PI / 2, signTex('ACİL ÇIKIŞ', '#047857', '#fff', 'Panik barına basın', 560, 160), 0.35)
  }

  private buildYard(): void {
    const b = this.b, { x, z, r } = ASSEMBLY
    const disk = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ color: 0x16803e, roughness: 0.95, transparent: true, opacity: 0.2, side: THREE.DoubleSide }))
    disk.rotation.x = -Math.PI / 2; disk.position.set(x, 0.02, z); b.root.add(disk)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.25, 0.045, 8, 64), solid(0xf8fafc, { rough: 0.7 }))
    ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.035, z); b.root.add(ring)
    b.box(x, 1.1, z - 5.1, 0.12, 2.2, 0.12, solid(0x374151, { metal: 0.6 }), { solid: true, cast: true })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), new THREE.MeshStandardMaterial({ map: signTex('TOPLANMA ALANI', '#15803d', '#fff', 'Binadan uzak güvenli açık alan', 700, 300) }))
    sign.position.set(x, 2.4, z - 5.0); sign.castShadow = true; b.root.add(sign)
    const fenceMat = solid(0x74808a, { rough: 0.42, metal: 0.72 })
    for (let i = -1; i <= 1; i++) {
      if (i !== 0) b.box(70, 1.1, z + i * 6, 0.12, 2.2, 7.0, fenceMat, { solid: true, cast: true })
    }
    for (const [tx, tz] of [[61, -13], [69, -14], [70, 3], [61, 4]] as const) addPlant(b, tx, tz, 1.1)
  }

  openStairDoor(floor: number): void {
    const d = this.doors.find(v => v.floor === floor)
    if (!d || d.opened) return
    d.opened = true; d.target = Math.PI / 2; d.collider.enabled = false
  }
  stairDoorOpen(floor: number): boolean { return this.doors.find(v => v.floor === floor)?.opened ?? false }
  cutPower(): void {
    this.powerOff = true; this.setEmergencyMode(true)
    this.b.setPower('b0', 0.025); this.b.setPower('b1', 0.025); this.b.setPower('b2', 0.025); this.b.setPower('stair', 0.035)
    this.panelLever.material = solid(0x22c55e, { rough: 0.3, metal: 0.35 })
  }
  openExit(): void { this.exitOpen = true; this.exitDoor.opened = true; this.exitDoor.target = Math.PI / 2; this.exitDoor.collider.enabled = false }

  private setEmergencyMode(on: boolean): void {
    this.emergencyMode = on
    this.emergencySigns.forEach(sign => { sign.visible = on })
    this.emergencyGuides.forEach(guide => { guide.visible = on })
    for (const light of this.emergencyLights) {
      ;(light.lens.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xffefbd : 0x1c2931)
      light.point.intensity = on ? light.intensity : 0
    }
  }

  debugState(): { powerOff: boolean; emergencyMode: boolean; visibleSigns: number; visibleArrows: number; emergencyLampsOn: number; stairDoors: { floor: number; opened: boolean; angle: number; colliderEnabled: boolean }[]; exitDoor: { opened: boolean; angle: number; colliderEnabled: boolean } } {
    return {
      powerOff: this.powerOff, emergencyMode: this.emergencyMode,
      visibleSigns: this.emergencySigns.filter(sign => sign.visible).length,
      visibleArrows: this.emergencyGuides.filter(guide => guide.visible).length,
      emergencyLampsOn: this.emergencyLights.filter(light => light.point.intensity > 0).length,
      stairDoors: this.doors.map(d => ({ floor: d.floor, opened: d.opened, angle: d.root.rotation.y, colliderEnabled: d.collider.enabled })),
      exitDoor: { opened: this.exitDoor.opened, angle: this.exitDoor.root.rotation.y, colliderEnabled: this.exitDoor.collider.enabled },
    }
  }
  startDrill(): void {
    this.setEmergencyMode(false)
    this.drillActive = true; this.powerOff = false; this.smokeLevel = 1; this.exitOpen = false; this.planViewed = false
    this.smoke.forEach(v => { v.s.visible = true })
    this.panelLever.material = solid(0xdc2626, { rough: 0.32, metal: 0.35 })
    this.doors.forEach(d => { d.opened = false; d.target = 0; d.root.rotation.y = 0; d.collider.enabled = true })
    this.exitDoor.opened = false; this.exitDoor.target = 0; this.exitDoor.root.rotation.y = 0; this.exitDoor.collider.enabled = true
    this.b.setPower('b0', 0.62); this.b.setPower('b1', 0.58); this.b.setPower('b2', 0.55); this.b.setPower('stair', 0.82)
  }
  resetDrill(): void {
    this.setEmergencyMode(false)
    this.drillActive = false; this.powerOff = false; this.smokeLevel = 0
    this.smoke.forEach(v => { v.s.visible = false }); this.strobe.forEach(l => { l.intensity = 0 }); this.panelLight.intensity = 0
    this.b.setPower('b0', 1); this.b.setPower('b1', 1); this.b.setPower('b2', 1); this.b.setPower('stair', 1)
    this.panelLever.material = solid(0xdc2626, { rough: 0.32, metal: 0.35 })
    this.doors.forEach(d => { d.opened = false; d.target = 0; d.root.rotation.y = 0; d.collider.enabled = true })
    this.exitDoor.opened = false; this.exitDoor.target = 0; this.exitDoor.root.rotation.y = 0; this.exitDoor.collider.enabled = true
    this.exitOpen = false
  }
  inSmoke(x: number, y: number, z: number): boolean {
    return this.drillActive && this.smokeLevel > 0.15 && x > 45.4 && x < 50.5 && z > -1.9 && z < 2.1 && y > FH - 0.25 && y < 2 * FH + 0.45
  }
  inAssembly(x: number, z: number): boolean { return Math.hypot(x - ASSEMBLY.x, z - ASSEMBLY.z) < ASSEMBLY.r - 0.55 }

  update(dt: number): void {
    this.t += dt
    const t = this.t
    if (this.powerOff) this.smokeLevel = Math.max(0, this.smokeLevel - dt / 5.5)
    this.smokeMat.opacity = 0.48 * this.smokeLevel
    for (const v of this.smoke) {
      if (!v.s.visible) continue
      v.s.position.set(v.base.x + Math.sin(t * 0.31 + v.ph) * 0.3, v.base.y + Math.sin(t * 0.42 + v.ph * 1.4) * 0.22, v.base.z + Math.cos(t * 0.27 + v.ph) * 0.28)
      if (this.smokeLevel <= 0.01) v.s.visible = false
    }
    const flash = this.drillActive && Math.sin(t * 7.5) > 0.42 ? 1 : 0
    this.strobe.forEach(l => { l.intensity = flash * 8 })
    const sparking = this.drillActive && !this.powerOff
    this.panelLight.intensity = sparking && Math.random() < 0.55 ? 3 + Math.random() * 3 : 0.15
    this.sparkT -= dt
    if (sparking && this.sparkT <= 0) {
      this.sparkT = 0.14 + Math.random() * 0.24
      const v = this.sparks.find(s => s.life <= 0)
      if (v) { v.life = 0.55; v.m.visible = true; v.m.position.set(48.9 + Math.random() * 0.3, FH + 1.55, 1.25); v.v.set((Math.random() - 0.5) * 0.8, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6) }
    }
    for (const s of this.sparks) if (s.life > 0) {
      s.life -= dt; s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt)
      if (s.life <= 0 || s.m.position.y < FH + 0.04) { s.life = 0; s.m.visible = false }
    }
    for (const d of [...this.doors, this.exitDoor]) {
      if (!d.root) continue
      const current = d.root.rotation.y
      const diff = d.target - current
      if (Math.abs(diff) > 0.008) d.root.rotation.y += diff * (1 - Math.exp(-dt * 8))
      else {
        d.root.rotation.y = d.target
        if (d.opened) d.collider.enabled = false
      }
    }
  }
}
