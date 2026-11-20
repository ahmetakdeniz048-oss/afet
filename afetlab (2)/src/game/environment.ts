import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Builder, texMat } from './builder'

export type Env = { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; sky: Sky }

/** Gökyüzü, güneş (gölgeli), hemisfer dolgu ışığı, IBL ve dış zemin. */
export function buildEnvironment(b: Builder, renderer: THREE.WebGLRenderer): Env {
  const scene = b.scene
  scene.background = new THREE.Color(0x9fc4e8)
  scene.fog = new THREE.Fog(0xbcd3e6, 70, 230)

  const sky = new Sky(); sky.scale.setScalar(900)
  const u = sky.material.uniforms
  u['turbidity'].value = 4; u['rayleigh'].value = 1.4; u['mieCoefficient'].value = 0.004; u['mieDirectionalG'].value = 0.8
  const sunDir = new THREE.Vector3(10, 36, 22).normalize()
  u['sunPosition'].value.copy(sunDir)
  scene.add(sky)

  // IBL: iç mekân odası ortamı (düşük şiddet)
  const pm = new THREE.PMREMGenerator(renderer)
  const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  scene.environmentIntensity = 0.16
  pm.dispose()

  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x6b665e, 0.22)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight(0xfff0d8, 0.68)
  sun.position.copy(sunDir).multiplyScalar(90).add(new THREE.Vector3(6, 0, 4))
  sun.target.position.set(6, 0, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const cam = sun.shadow.camera
  cam.left = -58; cam.right = 58; cam.top = 36; cam.bottom = -36; cam.near = 10; cam.far = 220
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05
  scene.add(sun, sun.target)

  // dış zemin: çim + asfalt
  const grass = texMat('grass', { rough: 1 })
  b.box(0, -0.62, 0, 400, 1.2, 400, grass)
  const asph = texMat('asphalt', { rough: 1, normal: 1.2 })
  b.box(40, -0.04, 13.7, 32, 0.08, 7.0, asph) // bina güneyi: dış kaldırım
  b.box(66.2, -0.04, -5.8, 20.4, 0.08, 20.4, asph) // doğu servis avlusu ve toplanma alanı
  // zemin çarpıştırıcısı (tüm harita)
  b.col.addRange(-200, -3, -200, 200, 0, 200)
  return { sun, hemi, sky }
}

export function setSunQuality(sun: THREE.DirectionalLight, enabled: boolean, size: number): void {
  sun.castShadow = enabled
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size)
    sun.shadow.map?.dispose(); sun.shadow.map = null
  }
}
