import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Builder, solid, texMat } from './builder'
import { canvasTex, font, signTex } from './textures'

// ---------------------------------------------------------------- modeller
/** Üretilen GLB modeller (kayıtlı depolama yolları, bkz. assets.lock.json). */
export const MODEL_URLS: Record<string, string> = {
  gasmask: '/manus-storage/game/sha256/cd4e8afd937a84b2b9ec4b17ae876613a17a7a357397dfc153b26138df0f87b9.glb',
  barrel: '/manus-storage/game/sha256/bf9afc88f65a6d95fbca2fe364e1a0dcfa17c2764a1fa6709bbc3d452ca7cb1c.glb',
  extinguisher: '/manus-storage/game/sha256/e8f702de2bdd38fdd9024da1eb869a2c95bc435d3c0a0b19abcfd289a6efc912.glb',
  firstaid: '/manus-storage/game/sha256/7d0ba85dd6e6b936f36ddd6b5a385499b85c801c51b411964fe30ff4bc50e862.glb',
  backpack: '/manus-storage/game/sha256/102b6909aa44f758a3b4feb0b77ecc1c4d02557facf9ad93ef5788052b964488.glb',
}

export async function loadModels(b: Builder, onProgress: (f: number) => void): Promise<void> {
  const loader = new GLTFLoader()
  const names = Object.keys(MODEL_URLS)
  let done = 0
  await Promise.all(names.map(async n => {
    try {
      const gltf = await loader.loadAsync(MODEL_URLS[n])
      const root = gltf.scene
      const box = new THREE.Box3().setFromObject(root)
      const size = box.getSize(new THREE.Vector3())
      const s = 1 / Math.max(size.x, size.y, size.z, 1e-4)
      const wrap = new THREE.Group()
      root.scale.setScalar(s)
      const b2 = new THREE.Box3().setFromObject(root)
      const c = b2.getCenter(new THREE.Vector3())
      root.position.set(-c.x, -b2.min.y, -c.z)
      wrap.add(root)
      root.traverse(o => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.castShadow = true; m.receiveShadow = true
          const mat = m.material as THREE.MeshStandardMaterial
          if (mat) { mat.roughness = Math.max(mat.roughness ?? 0.6, 0.55); mat.metalness = Math.min(mat.metalness ?? 0, 0.2); mat.envMapIntensity = 0.5 }
        }
      })
      b.models.set(n, wrap)
    } catch (e) {
      console.warn('Model yüklenemedi, yedek model kullanılacak:', n, e)
    }
    onProgress(++done / names.length)
  }))
}

/** Yüklü modelin kopyası; en büyük boyut `maxDim` metre, tabanı y=0. Yoksa `fallback()` döner. */
export function modelOr(b: Builder, name: string, maxDim: number, fallback: () => THREE.Object3D): THREE.Object3D {
  const src = b.models.get(name)
  if (!src) return fallback()
  const g = new THREE.Group()
  const c = src.clone(true)
  c.scale.setScalar(maxDim)
  g.add(c)
  return g
}

// ---------------------------------------------------------------- eşyalar (afet çantası)
const std = (color: number, rough = 0.5, metal = 0) => solid(color, { rough, metal })

function labelMat(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 128, rough = 0.5): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: canvasTex(w, h, draw), roughness: rough, metalness: 0.05 })
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m
}

/** Her eşya merkezde, tabanı y=0'da, ~0.15–0.3 m boyutunda. */
export function makeItem(b: Builder, id: string): THREE.Group {
  const g = new THREE.Group()
  switch (id) {
    case 'water': {
      const bottle = new THREE.MeshPhysicalMaterial({ color: 0x9bd3f5, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0, clearcoat: 1 })
      g.add(mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.2, 20), bottle, 0, 0.1, 0))
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.052, 0.05, 20), bottle, 0, 0.225, 0))
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 16), std(0x1d4ed8, 0.4), 0, 0.262, 0))
      const lab = labelMat((c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#0369a1'; c.fillRect(0, 0, w, 40); c.fillStyle = '#fff'; c.font = font(30); c.textAlign = 'center'; c.fillText('SU', w / 2, 32); c.fillStyle = '#0ea5e9'; c.font = font(22); c.fillText('1.5 L', w / 2, 90) })
      g.add(mesh(new THREE.CylinderGeometry(0.0535, 0.0535, 0.08, 20, 1, true), lab, 0, 0.1, 0))
      break
    }
    case 'flashlight': {
      g.rotation.z = Math.PI / 2
      const body = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 18), std(0x111827, 0.4, 0.5), 0, 0, 0)
      const head = mesh(new THREE.CylinderGeometry(0.052, 0.034, 0.07, 18), std(0xf59e0b, 0.35, 0.5), 0, 0.13, 0)
      const lens = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 18), new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfde68a, emissiveIntensity: 1.2 }), 0, 0.167, 0)
      const btn = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 10), std(0xdc2626, 0.4), 0, 0.02, 0.03)
      const inner = new THREE.Group(); inner.add(body, head, lens, btn); inner.position.y = 0.05; g.add(inner)
      g.position.y = 0
      const wrap = new THREE.Group(); g.position.y = 0.05; wrap.add(g); return wrap
    }
    case 'firstaid': {
      g.add(modelOr(b, 'firstaid', 0.34, () => {
        const f = new THREE.Group()
        f.add(mesh(new THREE.BoxGeometry(0.28, 0.2, 0.1), std(0xdc2626, 0.45), 0, 0.1, 0))
        const cross = labelMat((c, w, h) => { c.fillStyle = '#dc2626'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(w / 2 - 14, h / 2 - 50, 28, 100); c.fillRect(w / 2 - 50, h / 2 - 14, 100, 28) }, 128, 128)
        const face = mesh(new THREE.PlaneGeometry(0.2, 0.2), cross, 0, 0.1, 0.051); f.add(face)
        f.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.03), std(0x111827), 0, 0.21, 0))
        return f
      }))
      break
    }
    case 'can': {
      const lab = labelMat((c, w, h) => { c.fillStyle = '#b91c1c'; c.fillRect(0, 0, w, h); c.fillStyle = '#fef3c7'; c.fillRect(0, 36, w, 56); c.fillStyle = '#7f1d1d'; c.font = font(28); c.textAlign = 'center'; c.fillText('FASULYE', w * 0.25, 76); c.fillText('FASULYE', w * 0.75, 76) }, 256, 128, 0.4)
      g.add(mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.11, 24), lab, 0, 0.065, 0))
      const metal = std(0xcbd5e1, 0.25, 0.8)
      g.add(mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.008, 24), metal, 0, 0.01, 0))
      g.add(mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.008, 24), metal, 0, 0.12, 0))
      g.scale.setScalar(1.35)
      break
    }
    case 'whistle': {
      g.add(mesh(new THREE.BoxGeometry(0.07, 0.035, 0.035), std(0xf97316, 0.35), 0, 0.02, 0))
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.036, 14), std(0xf97316, 0.35), 0.035, 0.02, 0).rotateZ(0))
      const ring = mesh(new THREE.TorusGeometry(0.014, 0.003, 8, 16), std(0xd1d5db, 0.3, 0.8), -0.04, 0.02, 0); ring.rotation.y = Math.PI / 2; g.add(ring)
      const cord = mesh(new THREE.TorusGeometry(0.06, 0.004, 8, 28), std(0x111827, 0.8), -0.1, 0.004, 0); cord.rotation.x = Math.PI / 2; g.add(cord)
      g.scale.setScalar(1.7)
      break
    }
    case 'radio': {
      const grille = labelMat((c, w, h) => { c.fillStyle = '#1f2937'; c.fillRect(0, 0, w, h); c.fillStyle = '#0b1220'; for (let y = 10; y < h; y += 14) c.fillRect(8, y, w - 16, 5); c.fillStyle = '#e5e7eb'; c.font = font(18); c.textAlign = 'left'; c.fillText('AM / FM', 12, 18) }, 256, 128)
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.07), std(0xfacc15, 0.5), 0, 0.06, 0))
      g.add(mesh(new THREE.PlaneGeometry(0.15, 0.075), grille, -0.012, 0.06, 0.0355))
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 14), std(0x111827), 0.08, 0.075, 0.04).rotateX(Math.PI / 2))
      const ant = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.26, 6), std(0xd1d5db, 0.3, 0.8), 0.085, 0.24, -0.02); ant.rotation.z = -0.25; g.add(ant)
      g.scale.setScalar(1.2)
      break
    }
    case 'blanket': {
      const foil = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.18, metalness: 0.85, envMapIntensity: 1 })
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.07, 0.15), foil, 0, 0.035, 0))
      g.add(mesh(new THREE.BoxGeometry(0.205, 0.012, 0.155), std(0xf59e0b, 0.5), 0, 0.035, 0))
      g.scale.setScalar(1.2)
      break
    }
    case 'knife': {
      g.add(mesh(new THREE.BoxGeometry(0.09, 0.022, 0.03), std(0xdc2626, 0.4), 0, 0.012, 0))
      const bl = std(0xd8dde6, 0.2, 0.9)
      g.add(mesh(new THREE.BoxGeometry(0.085, 0.004, 0.018), bl, 0.07, 0.014, 0.005))
      const bl2 = mesh(new THREE.BoxGeometry(0.06, 0.004, 0.014), bl, 0.05, 0.02, -0.005); bl2.rotation.y = 0.35; g.add(bl2)
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.032, 8), std(0xd1d5db, 0.3, 0.8), -0.04, 0.012, 0).rotateX(Math.PI / 2))
      g.scale.setScalar(1.8)
      break
    }
    case 'cash': {
      const note = labelMat((c, w, h) => { c.fillStyle = '#16a34a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#bbf7d0'; c.lineWidth = 5; c.strokeRect(8, 8, w - 16, h - 16); c.fillStyle = '#bbf7d0'; c.font = font(44); c.textAlign = 'center'; c.fillText('100', w / 2, h / 2 + 14) }, 256, 128, 0.6)
      for (let i = 0; i < 2; i++) g.add(mesh(new THREE.BoxGeometry(0.16, 0.014, 0.075), note, 0, 0.007 + i * 0.0145, i * 0.002))
      g.add(mesh(new THREE.BoxGeometry(0.035, 0.034, 0.078), std(0xfef3c7, 0.7), 0, 0.016, 0))
      g.scale.setScalar(1.3)
      break
    }
    case 'idcopy': {
      const card = labelMat((c, w, h) => { c.fillStyle = '#f1f5f9'; c.fillRect(0, 0, w, h); c.fillStyle = '#b91c1c'; c.fillRect(0, 0, w, 28); c.fillStyle = '#fff'; c.font = font(18); c.textAlign = 'left'; c.fillText('KİMLİK FOTOKOPİSİ', 12, 21); c.fillStyle = '#94a3b8'; c.fillRect(14, 44, 48, 62); c.fillStyle = '#64748b'; for (let i = 0; i < 4; i++) c.fillRect(76, 48 + i * 16, 150 - i * 12, 7) }, 256, 128, 0.7)
      const sleeve = new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.35, roughness: 0.1 })
      const p = mesh(new THREE.BoxGeometry(0.17, 0.004, 0.11), card, 0, 0.004, 0); g.add(p)
      g.add(mesh(new THREE.BoxGeometry(0.18, 0.008, 0.12), sleeve, 0, 0.005, 0))
      g.scale.setScalar(1.35)
      break
    }
    case 'powerbank': {
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.022, 0.065), std(0x0f172a, 0.35, 0.3), 0, 0.011, 0))
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.002, 0.012), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.5 }), 0.0, 0.023, 0.02))
      g.add(mesh(new THREE.BoxGeometry(0.014, 0.008, 0.02), std(0xe5e7eb, 0.3, 0.8), 0.062, 0.011, 0))
      g.scale.setScalar(1.5)
      break
    }
    case 'raincoat': {
      const y = new THREE.MeshPhysicalMaterial({ color: 0xfacc15, roughness: 0.25, clearcoat: 0.7 })
      g.add(mesh(new THREE.BoxGeometry(0.17, 0.06, 0.12), y, 0, 0.03, 0))
      g.add(mesh(new THREE.BoxGeometry(0.175, 0.008, 0.125), std(0x111827, 0.5), 0, 0.03, 0))
      g.scale.setScalar(1.35)
      break
    }
    case 'perfume': {
      const glass = new THREE.MeshPhysicalMaterial({ color: 0xf9a8d4, transparent: true, opacity: 0.72, roughness: 0.04, clearcoat: 1 })
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.09, 0.04), glass, 0, 0.045, 0))
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 12), std(0xd4a017, 0.25, 0.9), 0, 0.105, 0))
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 12), std(0xd4a017, 0.25, 0.9), 0, 0.132, 0))
      g.scale.setScalar(1.5)
      break
    }
    case 'vase': {
      const pts: THREE.Vector2[] = []
      for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector2(0.025 + Math.sin(t * Math.PI) * 0.05 + (t > 0.85 ? (t - 0.85) * 0.2 : 0), t * 0.2)) }
      const porcelain = labelMat((c, w, h) => { c.fillStyle = '#f8fafc'; c.fillRect(0, 0, w, h); c.strokeStyle = '#1d4ed8'; c.lineWidth = 5; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 20 + i * 18); c.bezierCurveTo(60, 0 + i * 18, 160, 40 + i * 18, w, 20 + i * 18); c.stroke() } }, 256, 128, 0.15)
      const v = mesh(new THREE.LatheGeometry(pts, 28), porcelain); g.add(v)
      g.scale.setScalar(1.4)
      break
    }
    case 'book': {
      const cover = labelMat((c, w, h) => { c.fillStyle = '#7c2d12'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fbbf24'; c.lineWidth = 4; c.strokeRect(10, 10, w - 20, h - 20); c.fillStyle = '#fbbf24'; c.font = font(26); c.textAlign = 'center'; c.fillText('ANSİKLOPEDİ', w / 2, h / 2 + 8) }, 256, 128, 0.6)
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.14), cover, 0, 0.04, 0))
      g.add(mesh(new THREE.BoxGeometry(0.19, 0.07, 0.135), std(0xfef3c7, 0.9), 0.003, 0.04, 0.0))
      g.scale.setScalar(1.2)
      break
    }
  }
  return g
}

// ---------------------------------------------------------------- mobilya
export function addWorkTable(b: Builder, x: number, z: number, w = 2.4, d = 1.2, topY = 0.9): { top: THREE.Mesh; parts: THREE.Object3D[] } {
  const wood = texMat('wood', { color: 0xd6b48a, rough: 0.9 })
  const metal = solid(0x374151, { rough: 0.45, metal: 0.7 })
  const parts: THREE.Object3D[] = []
  const g = new THREE.Group(); g.position.set(x, 0, z); b.root.add(g)
  const top = b.box(0, topY - 0.04, 0, w, 0.08, d, wood, { parent: g, cast: true })
  parts.push(top)
  b.col.add(x, topY - 0.04, z, w, 0.08, d)
  const lx = w / 2 - 0.06, lz = d / 2 - 0.06
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(b.box(sx * lx, (topY - 0.08) / 2, sz * lz, 0.07, topY - 0.08, 0.07, metal, { parent: g, cast: true }))
    b.col.add(x + sx * lx, (topY - 0.08) / 2, z + sz * lz, 0.08, topY - 0.08, 0.08)
  }
  // alt çerçeve / traversler
  parts.push(b.box(0, 0.2, lz, w - 0.12, 0.04, 0.04, metal, { parent: g }))
  parts.push(b.box(0, 0.2, -lz, w - 0.12, 0.04, 0.04, metal, { parent: g }))
  parts.push(b.box(lx, 0.2, 0, 0.04, 0.04, d - 0.12, metal, { parent: g }))
  parts.push(b.box(-lx, 0.2, 0, 0.04, 0.04, d - 0.12, metal, { parent: g }))
  b.blob(x, 0, z, w + 0.4, d + 0.4, 0.45)
  return { top, parts }
}

export function addOfficeDesk(b: Builder, x: number, z: number, rotY = 0, withMonitor = true): THREE.Group {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; b.root.add(g)
  const wood = texMat('wood', { color: 0xf1e3cf, rough: 0.8 })
  const white = solid(0xe5e7eb, { rough: 0.55 })
  b.box(0, 0.74, 0, 1.6, 0.04, 0.8, wood, { parent: g, cast: true })
  b.box(-0.74, 0.37, 0, 0.04, 0.74, 0.74, white, { parent: g, cast: true })
  b.box(0.2, 0.37, -0.36, 1.0, 0.7, 0.04, white, { parent: g })
  b.box(0.58, 0.25, 0, 0.36, 0.5, 0.7, white, { parent: g, cast: true })
  // çarpıştırıcı (dönük masa için eksen hizalı yaklaşık kutu)
  const rotated = Math.abs(Math.sin(rotY)) > 0.5
  b.col.add(x, 0.37, z, rotated ? 0.85 : 1.65, 0.78, rotated ? 1.65 : 0.85)
  if (withMonitor) {
    const m = new THREE.Group(); m.position.set(0.1, 0.76, -0.15); g.add(m)
    const screen = canvasTex(256, 160, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#0e7490'); gr.addColorStop(1, '#1e3a8a'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 6; i++) c.fillRect(18, 18 + i * 20, 80 + (i * 37) % 120, 8) })
    b.box(0, 0.015, 0, 0.22, 0.03, 0.16, solid(0x111827, { rough: 0.4 }), { parent: m })
    b.box(0, 0.12, 0, 0.04, 0.2, 0.04, solid(0x111827, { rough: 0.4 }), { parent: m })
    const body = b.box(0, 0.3, 0.01, 0.56, 0.34, 0.04, solid(0x0b0f17, { rough: 0.35 }), { parent: m })
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshStandardMaterial({ map: screen, emissive: 0xffffff, emissiveMap: screen, emissiveIntensity: 0.55 }))
    face.position.set(0, 0, 0.0205); body.add(face)
    b.box(0.0, 0.775, 0.22, 0.42, 0.015, 0.14, solid(0x1f2937, { rough: 0.5 }), { parent: g })
  }
  b.blob(x, 0, z, 2.0, 1.2, 0.4, rotY)
  return g
}

export function addChair(b: Builder, x: number, z: number, rotY = 0, color = 0x1f2937): THREE.Group {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; b.root.add(g)
  const fabric = solid(color, { rough: 0.9 }), metal = solid(0x9ca3af, { rough: 0.35, metal: 0.8 })
  b.box(0, 0.46, 0, 0.46, 0.07, 0.46, fabric, { parent: g, cast: true })
  b.box(0, 0.75, -0.21, 0.44, 0.5, 0.06, fabric, { parent: g, cast: true })
  b.cyl(0, 0.24, 0, 0.025, 0.025, 0.4, metal, { parent: g, seg: 8 })
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.box(Math.sin(a) * 0.15, 0.04, Math.cos(a) * 0.15, 0.04, 0.03, 0.3, metal, { parent: g }).rotation.y = a }
  b.col.add(x, 0.4, z, 0.5, 0.8, 0.5)
  return g
}

export function addPlant(b: Builder, x: number, z: number, s = 1): void {
  const pot = b.cyl(x, 0.25 * s, z, 0.24 * s, 0.18 * s, 0.5 * s, solid(0xa16207, { rough: 0.9 }), { cast: true })
  pot.receiveShadow = true
  const leaf = solid(0x2f7d32, { rough: 0.7 }), leaf2 = solid(0x3f9142, { rough: 0.7 })
  const g = new THREE.Group(); g.position.set(x, 0.5 * s, z); b.root.add(g)
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + b.rand(), tilt = 0.25 + b.rand() * 0.7
    const l = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), i % 2 ? leaf : leaf2)
    l.scale.set(0.09 * s, 0.38 * s, 0.03 * s)
    l.position.set(Math.sin(a) * 0.16 * s, 0.36 * s, Math.cos(a) * 0.16 * s)
    l.rotation.set(Math.cos(a) * tilt, a, -Math.sin(a) * tilt)
    l.castShadow = true; g.add(l)
  }
  b.col.add(x, 0.5 * s, z, 0.5 * s, 1 * s, 0.5 * s)
  b.blob(x, 0, z, 0.9 * s, 0.9 * s, 0.5)
}

export function addBench(b: Builder, x: number, z: number, rotY = 0, len = 2.0): void {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; b.root.add(g)
  const wood = texMat('wood', { color: 0xbf9262, rough: 0.9 }), metal = solid(0x1f2937, { rough: 0.4, metal: 0.7 })
  b.box(0, 0.45, 0, len, 0.05, 0.42, wood, { parent: g, cast: true })
  b.box(0, 0.7, -0.2, len, 0.3, 0.04, wood, { parent: g, cast: true })
  for (const s of [-1, 1]) b.box(s * (len / 2 - 0.15), 0.22, 0, 0.05, 0.44, 0.38, metal, { parent: g })
  const rot = Math.abs(Math.sin(rotY)) > 0.5
  b.col.add(x, 0.4, z, rot ? 0.5 : len, 0.8, rot ? len : 0.5)
  b.blob(x, 0, z, len + 0.3, 0.8, 0.4, rotY)
}

export function addLocker(b: Builder, x: number, z: number, rotY = 0, n = 3, color = 0x4b5563): void {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; b.root.add(g)
  const m = solid(color, { rough: 0.4, metal: 0.6 })
  for (let i = 0; i < n; i++) {
    const cx = (i - (n - 1) / 2) * 0.42
    b.box(cx, 0.95, 0, 0.4, 1.9, 0.45, m, { parent: g, cast: true })
    b.box(cx, 1.6, 0.226, 0.2, 0.015, 0.003, solid(0x111827), { parent: g })
    b.box(cx, 1.6, 0.226, 0.2, 0.06, 0.003, solid(0x0b0f17), { parent: g })
    b.box(cx + 0.13, 1.0, 0.235, 0.025, 0.12, 0.02, solid(0xd1d5db, { metal: 0.9, rough: 0.2 }), { parent: g })
  }
  const rot = Math.abs(Math.sin(rotY)) > 0.5
  const w = n * 0.42
  b.col.add(x, 0.95, z, rot ? 0.46 : w, 1.9, rot ? w : 0.46)
  b.blob(x, 0, z, w + 0.3, 0.9, 0.4, rotY)
}

/** Acil çıkış levhası (yeşil, emisif). Duvara bakan yönü rotY. */
export function addExitSign(b: Builder, x: number, y: number, z: number, rotY = 0, arrow: 'left' | 'right' | 'none' = 'none'): void {
  const tex = canvasTex(256, 96, (c, w, h) => {
    c.fillStyle = '#047857'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8)
    c.fillStyle = '#fff'; c.font = font(34); c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText(arrow === 'left' ? '← ACİL ÇIKIŞ' : arrow === 'right' ? 'ACİL ÇIKIŞ →' : 'ACİL ÇIKIŞ', w / 2, h / 2 + 2)
  })
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.5 })
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.19, 0.06), [solid(0x064e3b), solid(0x064e3b), solid(0x064e3b), solid(0x064e3b), mat, mat])
  m.position.set(x, y, z); m.rotation.y = rotY; b.root.add(m)
}

export function addWallSign(b: Builder, x: number, y: number, z: number, w: number, h: number, rotY: number, tex: THREE.Texture, emissive = 0): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: emissive ? 0xffffff : 0, emissiveMap: emissive ? tex : null, emissiveIntensity: emissive })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.position.set(x, y, z); m.rotation.y = rotY; m.receiveShadow = true
  b.root.add(m)
  return m
}

export function addExtinguisher(b: Builder, x: number, z: number, rotY = 0, y = 0): THREE.Object3D {
  const o = modelOr(b, 'extinguisher', 0.62, () => {
    const g = new THREE.Group()
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 20), solid(0xcc1f1f, { rough: 0.35, metal: 0.3 }), 0, 0.23, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.075, 0.06, 20), solid(0xcc1f1f, { rough: 0.35 }), 0, 0.47, 0))
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), solid(0x111827), 0.03, 0.52, 0))
    return g
  })
  o.position.set(x, y, z); o.rotation.y = rotY
  b.root.add(o)
  // duvar tabelası
  const sign = signTex('YANGIN SÖNDÜRÜCÜ', '#b91c1c', '#fff', undefined, 512, 128)
  addWallSign(b, x + Math.sin(rotY + Math.PI) * 0.12 * -1, y + 1.55, z + Math.cos(rotY + Math.PI) * 0.12 * -1, 0.5, 0.125, rotY, sign)
  return o
}
