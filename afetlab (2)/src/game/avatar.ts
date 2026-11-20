import * as THREE from 'three'
import { solid } from './builder'

/** Basit ama inandırıcı insan figürü: yürüme, koşma, çömelme (diz çökme) ve masaya tutunma pozu. */
export class Avatar {
  readonly root = new THREE.Group()
  private hips = new THREE.Group()
  private torso = new THREE.Group()
  private head = new THREE.Group()
  private armL = new THREE.Group()
  private armR = new THREE.Group()
  private foreL = new THREE.Group()
  private foreR = new THREE.Group()
  private legL = new THREE.Group()
  private legR = new THREE.Group()
  private shinL = new THREE.Group()
  private shinR = new THREE.Group()
  private mask = new THREE.Group()
  private walk = 0
  private cw = 0 // çömelme ağırlığı
  private hw = 0 // tutunma ağırlığı
  private mw = 0 // hareket ağırlığı

  constructor() {
    const skin = solid(0xd9a47c, { rough: 0.7 })
    const vest = solid(0xf97316, { rough: 0.75 })
    const shirt = solid(0x1e3a5f, { rough: 0.8 })
    const pants = solid(0x1f2a44, { rough: 0.85 })
    const boots = solid(0x111317, { rough: 0.6 })
    const helmet = solid(0xfacc15, { rough: 0.35, metal: 0.1 })
    const refl = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.3, metalness: 0.6, emissive: 0x222222 })

    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m
    }
    this.root.add(this.hips); this.hips.position.y = 0.95
    this.hips.add(this.torso)
    // gövde
    add(this.torso, new THREE.CapsuleGeometry(0.15, 0.3, 6, 14), shirt, 0, 0.3, 0).scale.set(1, 1, 0.72)
    const v = add(this.torso, new THREE.CapsuleGeometry(0.158, 0.2, 6, 14), vest, 0, 0.34, 0); v.scale.set(1.04, 1, 0.78)
    add(this.torso, new THREE.BoxGeometry(0.34, 0.035, 0.24), refl, 0, 0.27, 0)
    add(this.torso, new THREE.BoxGeometry(0.34, 0.035, 0.24), refl, 0, 0.42, 0)
    // kafa
    this.torso.add(this.head); this.head.position.y = 0.66
    add(this.head, new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), skin, 0, 0.0, 0)
    add(this.head, new THREE.SphereGeometry(0.105, 18, 14), skin, 0, 0.12, 0).scale.set(0.95, 1.08, 1)
    const hel = add(this.head, new THREE.SphereGeometry(0.118, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), helmet, 0, 0.145, 0); hel.scale.set(1, 1, 1.08)
    add(this.head, new THREE.BoxGeometry(0.2, 0.012, 0.08), helmet, 0, 0.14, 0.11)
    add(this.head, new THREE.SphereGeometry(0.012, 8, 6), solid(0x111111), 0.04, 0.13, 0.095)
    add(this.head, new THREE.SphereGeometry(0.012, 8, 6), solid(0x111111), -0.04, 0.13, 0.095)
    // gaz maskesi
    const mk = solid(0x2f3b2f, { rough: 0.6 })
    const face = add(this.mask, new THREE.SphereGeometry(0.1, 16, 12), mk, 0, 0.11, 0.035); face.scale.set(1, 1.05, 1)
    add(this.mask, new THREE.SphereGeometry(0.03, 10, 8), solid(0x050505, { rough: 0.1, metal: 0.4 }), 0.045, 0.14, 0.12)
    add(this.mask, new THREE.SphereGeometry(0.03, 10, 8), solid(0x050505, { rough: 0.1, metal: 0.4 }), -0.045, 0.14, 0.12)
    add(this.mask, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), solid(0x4b5563, { rough: 0.5, metal: 0.5 }), 0, 0.07, 0.13).rotation.x = Math.PI / 2
    this.head.add(this.mask); this.mask.visible = false
    // kollar
    for (const [arm, fore, sx] of [[this.armL, this.foreL, 1], [this.armR, this.foreR, -1]] as const) {
      this.torso.add(arm); arm.position.set(sx * 0.21, 0.56, 0)
      add(arm, new THREE.CapsuleGeometry(0.048, 0.2, 5, 10), shirt, 0, -0.14, 0)
      arm.add(fore); fore.position.y = -0.3
      add(fore, new THREE.CapsuleGeometry(0.042, 0.2, 5, 10), skin, 0, -0.13, 0)
      add(fore, new THREE.SphereGeometry(0.05, 10, 8), solid(0xf59e0b, { rough: 0.7 }), 0, -0.29, 0) // eldiven
    }
    // bacaklar
    for (const [leg, shin, sx] of [[this.legL, this.shinL, 1], [this.legR, this.shinR, -1]] as const) {
      this.hips.add(leg); leg.position.set(sx * 0.095, 0, 0)
      add(leg, new THREE.CapsuleGeometry(0.075, 0.28, 5, 12), pants, 0, -0.22, 0)
      leg.add(shin); shin.position.y = -0.45
      add(shin, new THREE.CapsuleGeometry(0.06, 0.28, 5, 12), pants, 0, -0.22, 0)
      add(shin, new THREE.BoxGeometry(0.1, 0.08, 0.26), boots, 0, -0.43, 0.06)
    }
  }

  setMask(on: boolean): void { this.mask.visible = on }

  /** speed: yatay hız; crouch/hold: durum; yaw: bakış yönü. */
  update(dt: number, pos: THREE.Vector3, yaw: number, speed: number, crouch: boolean, hold: boolean, running: boolean): void {
    this.root.position.copy(pos)
    this.root.rotation.y = yaw + Math.PI
    const k = Math.min(1, dt * 9)
    this.cw += ((crouch ? 1 : 0) - this.cw) * k
    this.hw += ((hold ? 1 : 0) - this.hw) * k
    this.mw += ((speed > 0.3 ? 1 : 0) - this.mw) * k
    this.walk += dt * speed * (running ? 2.3 : 2.8)
    const sw = Math.sin(this.walk) * this.mw * (running ? 0.9 : 0.6) * (1 - this.cw * 0.7)
    const c = this.cw, h = this.hw

    // diz çökmüş eğik poz
    this.hips.position.y = 0.95 * (1 - c) + 0.5 * c
    this.torso.rotation.x = (running ? 0.22 : 0.05) * this.mw * (1 - c) + c * (1.18 + h * 0.08)
    this.head.rotation.x = -c * 0.9 + sw * 0.0
    this.legL.rotation.x = -sw * (1 - c) + c * -0.1
    this.legR.rotation.x = sw * (1 - c) + c * -0.1
    const kneeL = Math.max(0, sw) * 1.1 * (1 - c) + c * 1.55
    const kneeR = Math.max(0, -sw) * 1.1 * (1 - c) + c * 1.55
    this.shinL.rotation.x = kneeL; this.shinR.rotation.x = kneeR
    // kollar: yürürken sallanır, tutunurken öne uzanır
    const armSwing = sw * 0.9 * (1 - c)
    this.armL.rotation.x = armSwing * 1 * (1 - h) + h * -1.5 + c * (1 - h) * -0.6
    this.armR.rotation.x = -armSwing * (1 - h) + h * -1.5 + c * (1 - h) * -0.6
    this.armL.rotation.z = -0.05 - h * 0.2; this.armR.rotation.z = 0.05 + h * 0.2
    this.foreL.rotation.x = -0.25 * (1 - h) + h * -0.5 - Math.max(0, -sw) * 0.5 * (1 - c)
    this.foreR.rotation.x = -0.25 * (1 - h) + h * -0.5 - Math.max(0, sw) * 0.5 * (1 - c)
  }
}
