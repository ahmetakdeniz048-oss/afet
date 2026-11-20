import * as THREE from 'three'
import { Builder, solid, texMat } from './builder'
import { H_ROOM } from './world'
import { addExitSign, addLocker, addWallSign, modelOr } from './props'
import { canvasTex, font, posterTex, signTex } from './textures'

export const GAS = { x: -27, z: 11, radius: 6.2 }

export class HazmatRoom {
  maskTaken = false
  valveClosed = false
  gasLevel = 1
  maskObj: THREE.Object3D | null = null
  valveObj: THREE.Object3D | null = null
  eyewashObj: THREE.Object3D | null = null
  private sprites: { s: THREE.Sprite; base: THREE.Vector3; ph: number; sp: number }[] = []
  private gasMat!: THREE.SpriteMaterial
  private puddle!: THREE.Mesh
  private valveWheel!: THREE.Object3D
  private detector!: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; last: number }
  private fans: THREE.Object3D[] = []
  private pedestalGlass: THREE.Object3D | null = null
  private t = 0

  constructor(private b: Builder) {}

  /** Konuma göre gaz yoğunluğu (ppm). Maske yoğunluğu değiştirmez; sağlık hasarı rules'da. */
  ppmAt(x: number, z: number): number {
    const d = Math.hypot(x - GAS.x, z - GAS.z)
    const base = d < GAS.radius ? 80 + (1 - d / GAS.radius) * 420 : Math.max(0, 80 * Math.exp(-(d - GAS.radius) / 2.2))
    return Math.round(base * this.gasLevel)
  }
  inZone(x: number, z: number): boolean {
    return this.gasLevel > 0.15 && Math.hypot(x - GAS.x, z - GAS.z) < GAS.radius && z > 4 && z < 14 && x < -18
  }

  reset(): void {
    this.maskTaken = false; this.valveClosed = false; this.gasLevel = 1
    if (this.maskObj) this.maskObj.visible = true
    if (this.maskObj && !this.b.interactives.includes(this.maskObj)) this.b.interactives.push(this.maskObj)
    this.gasMat.opacity = 0.2
  }

  takeMask(): void {
    this.maskTaken = true
    if (this.maskObj) { this.maskObj.visible = false; this.b.removeInteractive(this.maskObj) }
  }

  closeValve(): void { this.valveClosed = true }

  build(): void {
    const b = this.b
    const x0 = -34, x1 = -18, z0 = 4, z1 = 14
    const wall = texMat('plaster', { color: 0xd8dccd, rough: 1 })
    const floor = texMat('concrete', { color: 0xa9adb3, rough: 1, env: 0.7 })
    const ceil = texMat('ceiling', { color: 0xdedede, rough: 1 })
    b.floor(x0, z0, x1, z1, 0, floor, 0.2, false)
    b.ceiling(x0, z0, x1, z1, H_ROOM, ceil)
    b.wallX(z1, x0, x1, 0, H_ROOM, wall, [{ at: -22, w: 1.8, h: 0.9, sill: 1.9, kind: 'window' }, { at: -31, w: 1.8, h: 0.9, sill: 1.9, kind: 'window' }])
    b.wallZ(x0, z0, z1, 0, H_ROOM, wall)

    // aydınlatma: soğuk endüstriyel
    for (const x of [-31, -26, -21]) for (const z of [6.5, 11.5]) b.fixture('hazmat', x, H_ROOM - 0.02, z, 1.4, 0.35)
    for (const [x, z] of [[-30, 7], [-22, 8], [-27, 12]] as const) b.pointLight('hazmat', x, 2.9, z, 6, 11, 0xe9f5ff)

    // zemin tehlike şeritleri (sızıntı bölgesi çevresi)
    const hz = texMat('hazard', { rough: 1 })
    const strip = (cx: number, cz: number, w: number, d: number) => { const m = b.box(cx, 0.008, cz, w, 0.016, d, hz, { recv: true }); m.castShadow = false }
    strip(-27, 6.0, 12.4, 0.22); strip(-27, 13.5, 12.4, 0.22); strip(-33.2, 9.75, 0.22, 7.5); strip(-20.8, 9.75, 0.22, 7.5)

    // varil istifi + sızıntı yapan varil
    const wood = texMat('wood', { color: 0x8a6b45, rough: 1 })
    const pallet = (x: number, z: number, r = 0) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; b.root.add(g)
      for (let i = 0; i < 3; i++) b.box(0, 0.06, -0.45 + i * 0.45, 1.2, 0.12, 0.12, wood, { parent: g, cast: true })
      for (let i = 0; i < 5; i++) b.box(-0.5 + i * 0.25, 0.14, 0, 0.14, 0.03, 1.0, wood, { parent: g, cast: true })
      b.col.add(x, 0.08, z, 1.2, 0.16, 1.2)
    }
    pallet(-29.2, 12.2, 0.1); pallet(-24.6, 12.4, -0.2)
    const barrel = (x: number, y: number, z: number, ry = 0, tipped = false) => {
      const o = modelOr(b, 'barrel', 0.92, () => {
        const g = new THREE.Group()
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.86, 24), solid(0xca8a04, { rough: 0.4, metal: 0.5 })); m.position.y = 0.43; m.castShadow = true; g.add(m)
        return g
      })
      o.position.set(x, y, z); o.rotation.y = ry
      if (tipped) { o.rotation.z = Math.PI / 2; o.position.y = 0.31 }
      b.root.add(o)
      return o
    }
    barrel(-29.5, 0.16, 12.0, 0.4); barrel(-28.9, 0.16, 12.7, 1.1); barrel(-24.8, 0.16, 12.2, 2.0); barrel(-24.2, 0.16, 12.9, 0.3)
    b.col.add(-29.2, 0.6, 12.35, 1.2, 1.0, 1.4); b.col.add(-24.5, 0.6, 12.5, 1.2, 1.0, 1.4)
    const leak = barrel(-26.8, 0, 11.0, 0.5, true)
    b.col.add(-26.8, 0.3, 11.0, 0.9, 0.6, 0.65)
    b.blob(-29.2, 0, 12.3, 1.8, 1.8, 0.5); b.blob(-24.6, 0, 12.5, 1.8, 1.8, 0.5)
    void leak
    // sızıntı birikintisi
    const puddleTex = canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(120,255,60,0.95)'); gr.addColorStop(0.7, 'rgba(60,170,40,0.75)'); gr.addColorStop(1, 'rgba(60,170,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h) })
    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ map: puddleTex, transparent: true, roughness: 0.05, metalness: 0.1, emissive: 0x4ade80, emissiveIntensity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }))
    this.puddle.rotation.x = -Math.PI / 2; this.puddle.position.set(-26.4, 0.018, 10.5); this.puddle.scale.set(1.5, 1.0, 1); this.puddle.renderOrder = 3; b.root.add(this.puddle)
    b.pointLight('hazmat', -26.5, 0.6, 10.8, 3, 4.5, 0x7dff4a)

    // gaz bulutu
    const gtex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(170,255,90,0.55)'); gr.addColorStop(0.5, 'rgba(120,220,60,0.25)'); gr.addColorStop(1, 'rgba(120,220,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h) })
    this.gasMat = new THREE.SpriteMaterial({ map: gtex, transparent: true, opacity: 0.2, depthWrite: false })
    for (let i = 0; i < 56; i++) {
      const s = new THREE.Sprite(this.gasMat)
      const a = b.rand() * Math.PI * 2, r = Math.sqrt(b.rand()) * (GAS.radius - 0.4)
      const base = new THREE.Vector3(GAS.x + Math.cos(a) * r, 0.4 + b.rand() * 2.6, GAS.z + Math.sin(a) * r * 0.7)
      base.z = Math.min(13.6, Math.max(4.4, base.z)); base.x = Math.min(-18.6, Math.max(-33.6, base.x))
      s.position.copy(base); s.scale.setScalar(2.0 + b.rand() * 2.4)
      b.root.add(s); this.sprites.push({ s, base, ph: b.rand() * 6.28, sp: 0.2 + b.rand() * 0.3 })
    }

    // boru hattı + vana
    const pipeM = solid(0x9ca3af, { rough: 0.35, metal: 0.85 })
    b.cyl(-26.5, 1.1, 13.62, 0.07, 0.07, 9, pipeM).rotation.z = Math.PI / 2
    b.cyl(-26.5, 2.6, 13.62, 0.07, 0.07, 9, solid(0xca8a04, { rough: 0.4, metal: 0.6 })).rotation.z = Math.PI / 2
    for (let i = 0; i < 6; i++) b.box(-30.5 + i * 1.6, 1.1, 13.7, 0.06, 0.18, 0.12, solid(0x4b5563, { rough: 0.5, metal: 0.7 }))
    const valve = new THREE.Group(); valve.position.set(-26.5, 1.1, 13.4); b.root.add(valve)
    b.cyl(0, 0, 0, 0.1, 0.1, 0.22, solid(0xdc2626, { rough: 0.35, metal: 0.4 }), { parent: valve }).rotation.x = Math.PI / 2
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 10, 28), solid(0xdc2626, { rough: 0.35, metal: 0.4 })); wheel.position.z = -0.12; wheel.castShadow = true; valve.add(wheel)
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.018, 0.018), solid(0xdc2626, { rough: 0.35, metal: 0.4 })); sp.rotation.z = (i * Math.PI) / 4; wheel.add(sp) }
    this.valveWheel = wheel
    b.proxy(valve, 0.6, 0.6, 0.5, 0).position.z = -0.1
    b.interactive(valve, { kind: 'valve', name: 'Ana Sızıntı Vanası' })
    this.valveObj = valve
    addWallSign(b, -26.5, 1.7, 13.84, 1.0, 0.3, Math.PI, signTex('ANA VANA', '#b91c1c', '#fff', undefined, 512, 150))

    // KKD istasyonu: gaz maskesi
    const px = -31.2, pz = 6.0
    b.box(px, 0.55, pz, 0.7, 1.1, 0.7, solid(0x273449, { rough: 0.45, metal: 0.4 }), { solid: true, cast: true })
    const maskObj = modelOr(b, 'gasmask', 0.34, () => {
      const g = new THREE.Group()
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), solid(0x334155, { rough: 0.6 })); m.position.y = 0.17; m.scale.set(1, 1.1, 0.9); m.castShadow = true; g.add(m)
      return g
    })
    maskObj.position.set(px, 1.1, pz); maskObj.rotation.y = Math.PI / 2 + 0.2; b.root.add(maskObj)
    b.proxy(maskObj, 0.5, 0.5, 0.5, 0.18)
    b.interactive(maskObj, { kind: 'mask', name: 'Gaz Maskesi' })
    this.maskObj = maskObj
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.48, 0.64), new THREE.MeshPhysicalMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.1, roughness: 0.03, depthWrite: false }))
    glass.position.set(px, 1.35, pz); glass.visible = false; b.root.add(glass); this.pedestalGlass = glass
    const lamp = b.pointLight('hazmat', px + 0.4, 1.9, pz + 0.3, 1.8, 3, 0x5dffa0)
    lamp.castShadow = false
    addWallSign(b, -33.82, 1.9, pz, 1.5, 0.5, Math.PI / 2, signTex('KKD – GAZ MASKESİ', '#047857', '#fff', 'Önce maskeni tak!', 700, 235), 0.7)
    b.blob(px, 0, pz, 1.3, 1.3, 0.5)

    // gaz dedektörü (duvar ekranı)
    const dc = document.createElement('canvas'); dc.width = 256; dc.height = 128
    const dctx = dc.getContext('2d')!
    const dtex = new THREE.CanvasTexture(dc); dtex.colorSpace = THREE.SRGBColorSpace
    this.detector = { tex: dtex, ctx: dctx, last: -1 }
    b.box(-18.18, 1.7, 5.4, 0.08, 0.5, 0.7, solid(0x111827, { rough: 0.4 }))
    const dscr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.32), new THREE.MeshStandardMaterial({ map: dtex, emissive: 0xffffff, emissiveMap: dtex, emissiveIntensity: 1.1, roughness: 0.4 }))
    dscr.position.set(-18.225, 1.7, 5.4); dscr.rotation.y = Math.PI / 2; b.root.add(dscr)

    // göz duşu / acil duş
    const es = new THREE.Group(); es.position.set(-19.0, 0, 12.7); b.root.add(es)
    const yel = solid(0x16a34a, { rough: 0.4, metal: 0.4 })
    b.cyl(0, 1.2, 0, 0.03, 0.03, 2.4, solid(0xcbd5e1, { rough: 0.3, metal: 0.9 }), { parent: es })
    b.cyl(0.3, 2.3, 0, 0.22, 0.22, 0.05, solid(0xcbd5e1, { rough: 0.3, metal: 0.9 }), { parent: es })
    b.box(0.15, 2.3, 0, 0.3, 0.04, 0.04, solid(0xcbd5e1, { rough: 0.3, metal: 0.9 }), { parent: es })
    b.box(-0.0, 1.0, 0.15, 0.4, 0.12, 0.22, yel, { parent: es })
    b.cyl(0, 0.9, 0.15, 0.1, 0.1, 0.05, solid(0xe5e7eb, { rough: 0.2, metal: 0.8 }), { parent: es })
    b.box(0.55, 1.6, 0, 0.02, 0.5, 0.02, yel, { parent: es })
    b.proxy(es, 0.9, 2.4, 0.8, 1.2)
    b.col.add(-19.0, 1.2, 12.7, 0.5, 2.4, 0.5)
    b.interactive(es, { kind: 'eyewash', name: 'Göz Yıkama ve Acil Duş' })
    this.eyewashObj = es
    addWallSign(b, -18.17, 2.5, 12.0, 0.8, 0.8, -Math.PI / 2, canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#16a34a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, 90, 32, 0, 7); g.fill(); g.fillRect(w / 2 - 40, 130, 80, 60); g.font = font(34); g.textAlign = 'center'; g.fillText('ACİL DUŞ', w / 2, 236) }), 0.5)

    // uyarı levhaları + afiş
    const warn = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#facc15'; g.fillRect(0, 0, w, h); g.fillStyle = '#111827'; g.beginPath(); g.moveTo(w / 2, 30); g.lineTo(w - 30, h - 120); g.lineTo(30, h - 120); g.closePath(); g.lineWidth = 16; g.strokeStyle = '#111827'; g.stroke(); g.font = font(160); g.textAlign = 'center'; g.fillText('☠', w / 2, 300); g.font = font(56); g.fillText('TOKSİK GAZ', w / 2, h - 50) })
    addWallSign(b, -18.17, 2.2, 7.4, 0.7, 0.7, -Math.PI / 2, warn)
    addWallSign(b, -33.84, 2.3, 10.8, 1.0, 1.0, Math.PI / 2, warn)
    const chem = posterTex('KİMYASAL ACİL DURUM', ['1. Gaz maskeni tak.', '2. Sızıntı kaynağını izole et (vana).', '3. Rüzgâr yönüne dikkat et.', '4. Temas varsa göz/ciltte bol suyla yıka.', '5. Yetkililere bildir.'], '#a16207')
    addWallSign(b, -22.5, 2.15, 4.17, 1.1, 1.47, 0, chem)

    // havalandırma fanı + dolaplar
    for (const fx of [-24.5, -29.5]) {
      const g = new THREE.Group(); g.position.set(fx, 2.7, 13.74); b.root.add(g)
      b.cyl(0, 0, 0, 0.36, 0.36, 0.1, solid(0x4b5563, { rough: 0.5, metal: 0.6 }), { parent: g }).rotation.x = Math.PI / 2
      const rotor = new THREE.Group(); rotor.position.z = -0.03; g.add(rotor)
      for (let i = 0; i < 5; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.01), solid(0xd1d5db, { rough: 0.3, metal: 0.6 })); bl.position.x = 0.15; const pv = new THREE.Group(); pv.rotation.z = (i / 5) * Math.PI * 2; pv.add(bl); rotor.add(pv) }
      this.fans.push(rotor)
    }
    addLocker(b, -19.2, 4.6, Math.PI, 3, 0x1f2937)
    addExitSign(b, -18.2, 2.9, 8.0, -Math.PI / 2)
  }

  update(dt: number): void {
    this.t += dt
    const t = this.t
    // gaz
    if (this.valveClosed) this.gasLevel = Math.max(0, this.gasLevel - dt / 7)
    this.gasMat.opacity = 0.2 * this.gasLevel
    for (const g of this.sprites) {
      g.s.position.set(g.base.x + Math.sin(t * g.sp + g.ph) * 0.5, g.base.y + Math.sin(t * g.sp * 1.3 + g.ph) * 0.3, g.base.z + Math.cos(t * g.sp + g.ph) * 0.5)
      g.s.visible = this.gasLevel > 0.02
    }
    const pm = this.puddle.material as THREE.MeshStandardMaterial
    pm.opacity = this.valveClosed ? Math.max(0.3, pm.opacity - dt * 0.02) : 1
    this.puddle.scale.x = 1.5 + (this.valveClosed ? 0 : Math.min(0.8, t * 0.01)); this.puddle.scale.y = 1.0 + (this.valveClosed ? 0 : Math.min(0.5, t * 0.006))
    this.valveWheel.rotation.z += this.valveClosed ? 0 : 0
    for (const f of this.fans) f.rotation.z += dt * 9 * (0.3 + 0.7 * this.gasLevel)
  }

  setValveSpin(dt: number): void { this.valveWheel.rotation.z += dt * 6 }

  /** Dedektör ekranını yeniler (yaklaşık 4 Hz). */
  drawDetector(ppm: number, t: number): void {
    const d = this.detector
    if (t - d.last < 0.25) return
    d.last = t
    const g = d.ctx
    g.fillStyle = '#04120a'; g.fillRect(0, 0, 256, 128)
    const danger = ppm > 150
    g.fillStyle = danger ? '#ef4444' : ppm > 40 ? '#facc15' : '#22c55e'
    g.font = font(60); g.textAlign = 'center'; g.fillText(String(ppm), 128, 74)
    g.font = font(20); g.fillText('ppm  TOKSİK GAZ', 128, 102)
    g.fillStyle = '#86efac'; g.font = font(16); g.fillText(danger ? 'TEHLİKE – MASKE TAK' : ppm > 40 ? 'DİKKAT' : 'GÜVENLİ', 128, 22)
    d.tex.needsUpdate = true
  }

  showGlass(): void { if (this.pedestalGlass) this.pedestalGlass.visible = true }
}
