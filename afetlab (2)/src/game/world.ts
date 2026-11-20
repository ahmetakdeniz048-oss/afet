import * as THREE from 'three'
import { Builder, solid, texMat } from './builder'
import { BAG_ITEMS } from './rules'
import { addBench, addChair, addExitSign, addExtinguisher, addLocker, addPlant, addWallSign, makeItem, modelOr } from './props'
import { canvasTex, font, posterTex, signTex, wrapText } from './textures'

export const H_HALL = 5.2
export const H_ROOM = 3.4

// ----- pano / afiş yardımcıları -----
function poster(b: Builder, tex: THREE.Texture, x: number, y: number, z: number, rotY: number, w = 1.5): void {
  const h = w * (4 / 3)
  const frame = solid(0x1f2937, { rough: 0.4, metal: 0.5 })
  const nx = Math.sin(rotY), nz = Math.cos(rotY)
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; b.root.add(g)
  b.box(0, 0, -0.015, w + 0.08, h + 0.08, 0.03, frame, { parent: g })
  addWallSign(b, x + nx * 0.005, y, z + nz * 0.005, w, h, rotY, tex)
}

function mapTex(): THREE.CanvasTexture {
  return canvasTex(1024, 640, (g, w, h) => {
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#1e3a5f'; g.lineWidth = 1
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() }
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
    g.fillStyle = '#38bdf8'; g.font = font(40); g.textAlign = 'left'; g.fillText('TESİS KAT PLANI', 36, 62)
    // x:-34..46 -> 40..980 ; z:-14..14 -> 120..560
    const X = (x: number) => 40 + (x + 34) * (940 / 80), Z = (z: number) => 330 + z * 15
    const room = (x0: number, z0: number, x1: number, z1: number, fill: string, label: string) => {
      g.fillStyle = fill; g.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0))
      g.strokeStyle = '#e2e8f0'; g.lineWidth = 3; g.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0))
      g.fillStyle = '#fff'; g.font = font(22); g.textAlign = 'center'; g.fillText(label, (X(x0) + X(x1)) / 2, (Z(z0) + Z(z1)) / 2 + 8)
    }
    room(-34, -14, -18, -4, '#075985', 'DEPREM ODASI')
    room(-34, -4, -18, 4, '#b45309', 'AFET ÇANTASI')
    room(-34, 4, -18, 14, '#a16207', 'HAZMAT')
    room(-18, -14, 18, 14, '#1e293b', 'ANA SERGİ SALONU')
    room(24, -6, 40, 6, '#065f46', 'TAHLİYE BİNASI')
    g.fillStyle = '#334155'; g.fillRect(X(18), Z(-1.5), X(24) - X(18), Z(1.5) - Z(-1.5))
    // buradasınız
    g.fillStyle = '#ef4444'; g.beginPath(); g.arc(X(0), Z(9), 9, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#fecaca'; g.font = font(20); g.fillText('BURADASINIZ', X(0), Z(9) + 30)
  })
}

// =============================================================== ANA SALON
export function buildHall(b: Builder): void {
  const wall = texMat('plaster', { rough: 1 })
  const tile = texMat('tile', { color: 0xe7ebf0, rough: 1, env: 0.8 })
  const ceil = texMat('ceiling', { rough: 1 })
  const steel = solid(0x2b3340, { rough: 0.5, metal: 0.7 })

  b.floor(-18, -14, 18, 14, 0, tile, 0.2, false)
  b.ceiling(-18, -14, 18, 14, H_HALL, ceil)

  const door = { w: 2.0, h: 2.5, kind: 'door' as const }
  b.wallZ(-18, -14, 14, 0, H_HALL, wall, [{ at: -9, ...door }, { at: 0, ...door }, { at: 9, ...door }])
  b.wallZ(18, -14, 14, 0, H_HALL, wall, [{ at: 0, w: 3.0, h: 2.7, kind: 'door' }])
  b.wallX(-14, -18, 18, 0, H_HALL, wall)
  b.wallX(14, -18, 18, 0, H_HALL, wall, [-12, -4, 4, 12].map(at => ({ at, w: 3.0, h: 1.6, sill: 2.7, kind: 'window' as const })))

  // Sergi salonunun orta aksında kolon yoktur; ziyaretçi akışı ve görüş duvar kenarlarında açıktır.
  // Mevcut tavan kirişleri tavana bitişik dekoratif elemanlardır, yürüyüş hattına sarkmaz.
  for (const z of [-9, -3, 3, 9]) b.box(0, H_HALL - 0.35, z, 36, 0.4, 0.28, steel, { cast: true })
  b.cyl(0, H_HALL - 0.8, -11, 0.28, 0.28, 36, solid(0xcbd5e1, { rough: 0.4, metal: 0.8 })).rotation.z = Math.PI / 2
  b.cyl(0, H_HALL - 0.8, 11, 0.28, 0.28, 36, solid(0xcbd5e1, { rough: 0.4, metal: 0.8 })).rotation.z = Math.PI / 2

  // aydınlatma
  for (const x of [-11, 0, 11]) for (const z of [-8, 0, 8]) b.fixture('hall', x, H_HALL - 0.55, z, 2.4, 0.5)
  for (const [x, z] of [[-9, -6], [9, -6], [-9, 6], [9, 6], [0, 0]] as const) b.pointLight('hall', x, 4.4, z, 11, 20)

  // yönlendirme çizgileri
  const line = (x0: number, z0: number, x1: number, z1: number, color: number) => {
    const w = Math.abs(x1 - x0) || 0.22, d = Math.abs(z1 - z0) || 0.22
    const m = b.box((x0 + x1) / 2, 0.006, (z0 + z1) / 2, w, 0.012, d, new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.18 }), { recv: true })
    m.castShadow = false
  }
  line(-4, -9, -4, 9, 0x64748b)
  line(-17.4, -9, -4, -9, 0x0ea5e9); line(-17.4, 0, -4, 0, 0xf59e0b); line(-17.4, 9, -4, 9, 0xeab308)
  line(4, 0, 17.4, 0, 0x10b981); line(-4, 0, 4, 0, 0x64748b)
  const logo = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#0b1220'; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#38bdf8'; g.lineWidth = 14; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 22, 0, Math.PI * 2); g.stroke()
    g.fillStyle = '#fff'; g.font = font(92); g.textAlign = 'center'; g.fillText('AFET', w / 2, h / 2 - 6)
    g.fillStyle = '#38bdf8'; g.font = font(54); g.fillText('EĞİTİM', w / 2, h / 2 + 64)
  })
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ map: logo, roughness: 0.35 }))
  disc.rotation.x = -Math.PI / 2; disc.position.set(0, 0.014, 0); b.root.add(disc)

  // kapı tabelaları (salon tarafı)
  const sign = (label: string, sub: string, color: string, z: number) => {
    addWallSign(b, -17.83, 3.55, z, 2.8, 1.0, Math.PI / 2, signTex(label, color, '#fff', sub, 700, 250), 0.55)
  }
  sign('DEPREM ODASI', 'Çök – Kapan – Tutun', '#0369a1', -9)
  sign('AFET ÇANTASI', 'Doğru eşyaları seç', '#b45309', 0)
  sign('HAZMAT ODASI', 'Kimyasal güvenlik', '#a16207', 9)
  addWallSign(b, 17.83, 3.65, 0, 3.4, 1.1, -Math.PI / 2, signTex('TAHLİYE BİNASI', '#047857', '#fff', 'Yangın tahliye tatbikatı', 800, 256), 0.6)

  // tesis haritası (doğu duvarı)
  const mapMat = mapTex()
  addWallSign(b, 17.83, 2.1, -7, 3.2, 2.0, -Math.PI / 2, mapMat, 0.35)
  b.box(17.9, 2.1, -7, 0.04, 2.12, 3.32, solid(0x1f2937, { rough: 0.4, metal: 0.5 })).position.x = 17.86

  // sismograf sergisi
  const px = 0, pz = -8.6
  b.cyl(px, 0.08, pz, 2.4, 2.5, 0.16, solid(0x1f2937, { rough: 0.4, metal: 0.6 }), { cast: true })
  b.box(px, 0.55, pz, 1.4, 0.9, 1.4, solid(0x273449, { rough: 0.5, metal: 0.4 }), { solid: true, cast: true })
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.16, roughness: 0.03, side: THREE.DoubleSide, envMapIntensity: 1.5 })
  glass.depthWrite = false
  b.box(px, 1.35, pz, 1.3, 0.8, 1.3, glass, { solid: true })
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 28), new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#fefce8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1e293b'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < w; i++) { const y = h / 2 + Math.sin(i * 0.4) * 10 * Math.sin(i * 0.037) + Math.sin(i * 1.7) * 3; i ? g.lineTo(i, y) : g.moveTo(i, y) } g.stroke() }), roughness: 0.8 }))
  drum.position.set(px, 1.3, pz); b.root.add(drum)
  const arm = b.box(px + 0.36, 1.32, pz, 0.3, 0.02, 0.02, solid(0xb91c1c, { rough: 0.4 }))
  b.updaters.push((_dt, t) => { drum.rotation.y = t * 0.4; arm.position.y = 1.32 + Math.sin(t * 7) * 0.012 })
  addWallSign(b, px, 1.0, pz + 0.705, 1.2, 0.36, 0, signTex('SİSMOGRAF', '#0f172a', '#38bdf8', 'Yer hareketini kaydeder', 512, 154))
  b.blob(px, 0, pz, 3.4, 3.4, 0.5)
  for (const a of [Math.PI * 0.2, Math.PI * 0.8, Math.PI * 1.2, Math.PI * 1.8]) addBench(b, px + Math.cos(a) * 3.1, pz + Math.sin(a) * 3.1 + 0.4, -a + Math.PI / 2, 1.5)

  // Afet Aile Planı masası (doğu-güney); ana yürüyüş aksının dışında ve mevcut AABB'siyle eşlenik.
  const dx = 12.2, dz = 10.8
  b.box(dx, 0.55, dz, 3.4, 1.1, 0.8, solid(0x1d4ed8, { rough: 0.45, metal: 0.2 }), { solid: true, cast: true })
  b.box(dx, 1.12, dz, 3.5, 0.06, 0.95, texMat('wood', { color: 0xe6d0ae, rough: 0.9 }), { cast: true })
  addWallSign(b, dx, 0.62, dz - 0.405, 2.6, 0.6, Math.PI, signTex('AİLE AFET PLANI', '#0f766e', '#fff', 'Buluşma • görev • iletişim', 680, 180))
  const tabletTex = canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#34d399'; g.font = font(34); g.fillText('AİLE AFET PLANI', 24, 48)
    g.strokeStyle = '#38bdf8'; g.lineWidth = 3; g.strokeRect(26, 76, 206, 92); g.strokeRect(256, 76, 228, 92)
    g.fillStyle = '#e2e8f0'; g.font = font(18); g.fillText('YAKIN BULUŞMA', 38, 105); g.fillText('GÜVENLİ NOKTA', 38, 143)
    g.fillText('GÖREVLER', 270, 105); g.fillText('İLETİŞİM', 270, 143)
    g.fillStyle = '#fbbf24'; g.font = font(20); g.fillText('E ile aile planını düzenleyin', 26, h - 32)
    void w
  })
  const tablet = new THREE.Group(); tablet.position.set(dx + 0.18, 1.20, dz - 0.06); tablet.rotation.x = -0.5; b.root.add(tablet)
  b.box(0, 0, 0, 1.32, 0.08, 0.84, solid(0x111827, { rough: 0.38, metal: 0.35 }), { parent: tablet, cast: true })
  const tabletScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.70), new THREE.MeshBasicMaterial({ map: tabletTex, toneMapped: false }))
  tabletScreen.position.z = 0.043; tablet.add(tabletScreen)
  const target = b.proxy(tablet, 1.42, 0.15, 0.94, 0.02); target.position.z = 0.06
  b.interactive(tablet, { kind: 'family_plan', name: 'Afet Aile Planı masası' })
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshBasicMaterial({ map: mapTex(), side: THREE.DoubleSide }))
  paper.rotation.x = -Math.PI / 2; paper.position.set(dx - 0.77, 1.16, dz + 0.02); b.root.add(paper)
  b.blob(dx, 0, dz, 4, 1.8, 0.45)

  // sedirler, bitkiler, söndürücü, yangın dolabı
  addBench(b, -13, -12.6, 0, 2.2); addBench(b, 13, -12.6, 0, 2.2)
  addPlant(b, -16.8, -12.8, 1.1); addPlant(b, 16.8, -12.8, 1.1); addPlant(b, -16.8, 12.8, 1.0); addPlant(b, 16.8, 12.8, 1.0)
  addExtinguisher(b, 17.6, -3.2, -Math.PI / 2)
  addExtinguisher(b, -17.55, 4.6, Math.PI / 2)
  for (const [x, y, z, r] of [[-17.75, 3.0, -4.6, Math.PI / 2], [17.75, 3.05, 3.8, -Math.PI / 2]] as const) addExitSign(b, x, y, z, r)
  addExitSign(b, 17.78, 3.1, 0, -Math.PI / 2)
}

// =============================================================== KORİDOR (salon -> tahliye binası)
export function buildCorridor(b: Builder): void {
  const wall = texMat('plaster', { rough: 1 })
  const floor = texMat('concrete', { color: 0xb8bcc2, rough: 1 })
  const ceil = texMat('ceiling', { rough: 1 })
  b.floor(18, -1.5, 24, 1.5, 0, floor, 0.2, false)
  b.ceiling(18, -1.5, 24, 1.5, 3.2, ceil)
  b.wallX(-1.5, 18, 24, 0, 3.2, wall); b.wallX(1.5, 18, 24, 0, 3.2, wall)
  b.fixture('corridor', 20, 3.17, 0, 1.2, 0.3); b.fixture('corridor', 22.5, 3.17, 0, 1.2, 0.3)
  b.pointLight('corridor', 21, 2.6, 0, 9, 9)
  addWallSign(b, 21, 1.8, -1.34, 2.2, 0.8, 0, signTex('TAHLİYE BİNASI →', '#047857', '#fff', 'Yangın tatbikatı için ilerleyin', 640, 232), 0.4)
  addExitSign(b, 23.4, 2.75, 1.35, Math.PI, 'right')
}

// =============================================================== AFET ÇANTASI ODASI
export type BagRefs = { backpack: THREE.Object3D; bin: THREE.Object3D; items: { root: THREE.Object3D; id: string; ok: boolean }[]; bagPos: THREE.Vector3; binPos: THREE.Vector3 }

export function buildBagRoom(b: Builder): BagRefs {
  const x0 = -34, x1 = -18, z0 = -4, z1 = 4
  const wall = texMat('plaster', { color: 0xf3ead7, rough: 1 })
  const floor = texMat('tile', { color: 0xd5c7ad, rough: 1, env: 0.7 })
  const ceil = texMat('ceiling', { rough: 1 })
  b.floor(x0, z0, x1, z1, 0, floor, 0.2, false)
  b.ceiling(x0, z0, x1, z1, H_ROOM, ceil)
  b.wallX(z0, x0, x1, 0, H_ROOM, wall)
  b.wallX(z1, x0, x1, 0, H_ROOM, wall)
  b.wallZ(x0, z0, z1, 0, H_ROOM, wall)
  for (const x of [-30, -22]) { b.fixture('bag', x, H_ROOM - 0.02, -1.3, 1.6, 0.4); b.fixture('bag', x, H_ROOM - 0.02, 1.3, 1.6, 0.4); b.pointLight('bag', x, 3.0, 0, 7, 10) }

  // iki uzun tezgâh
  const wood = texMat('wood', { color: 0xdcc39b, rough: 0.9 }), metal = solid(0x374151, { rough: 0.45, metal: 0.7 })
  const tableRow = (z: number) => {
    b.box(-27, 0.86, z, 9.4, 0.06, 1.1, wood, { cast: true })
    b.col.add(-27, 0.86, z, 9.4, 0.06, 1.1)
    for (const lx of [-31.4, -27, -22.6]) for (const lz of [-0.48, 0.48]) {
      b.box(lx, 0.42, z + lz, 0.07, 0.84, 0.07, metal, { cast: true }); b.col.add(lx, 0.42, z + lz, 0.1, 0.84, 0.1)
    }
    b.blob(-27, 0, z, 10, 1.7, 0.45)
  }
  tableRow(-1.4); tableRow(1.4)

  const items: BagRefs['items'] = []
  // sırayı karıştır (deterministik)
  const order = [...BAG_ITEMS]
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(b.rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  order.forEach((it, i) => {
    const row = i < 8 ? 0 : 1, idx = row === 0 ? i : i - 8
    const x = -31.2 + idx * 1.18 + (row ? 0.35 : 0)
    const z = row === 0 ? -1.4 : 1.4
    const root = new THREE.Group(); root.position.set(x, 0.89, z); root.rotation.y = (b.rand() - 0.5) * 0.9
    const model = makeItem(b, it.id); root.add(model)
    b.proxy(root, 0.36, 0.34, 0.36, 0.17)
    b.root.add(root)
    b.interactive(root, { kind: 'bag_item', name: it.name, itemId: it.id, ok: it.ok, hint: it.hint })
    // küçük temas gölgesi
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }))
    bl.rotation.x = -Math.PI / 2; bl.position.y = 0.004; root.add(bl)
    items.push({ root, id: it.id, ok: it.ok })
  })

  // çanta istasyonu
  const sx = -33.0, sz = 0
  b.box(sx, 0.45, sz, 1.0, 0.06, 1.5, wood, { cast: true }); b.col.add(sx, 0.45, sz, 1.0, 0.06, 1.5)
  for (const lx of [-0.4, 0.4]) for (const lz of [-0.65, 0.65]) { b.box(sx + lx, 0.21, sz + lz, 0.06, 0.42, 0.06, metal); }
  const backpack = modelOr(b, 'backpack', 0.62, () => {
    const g = new THREE.Group()
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.22), solid(0xea580c, { rough: 0.8 })); m.position.y = 0.28; m.castShadow = true; g.add(m)
    return g
  })
  backpack.position.set(sx + 0.05, 0.48, sz); backpack.rotation.y = Math.PI / 2; b.root.add(backpack)
  addWallSign(b, x0 + 0.17, 1.75, sz, 1.4, 0.45, Math.PI / 2, signTex('AFET ÇANTASI', '#c2410c', '#fff', 'Doğru eşyaları buraya koy', 700, 225), 0.3)
  const bin = new THREE.Group(); bin.position.set(-32.9, 0, 2.9)
  const binBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.62, 24, 1, true), solid(0xb91c1c, { rough: 0.5 })); binBody.position.y = 0.31; binBody.castShadow = true
  ;(binBody.material as THREE.Material).side = THREE.DoubleSide
  bin.add(binBody, new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), solid(0x450a0a)))
  bin.children[1].rotation.x = -Math.PI / 2; bin.children[1].position.y = 0.02
  b.root.add(bin)
  addWallSign(b, x0 + 0.17, 1.0, 2.9, 0.9, 0.3, Math.PI / 2, signTex('ÇANTA DIŞI', '#7f1d1d', '#fff', undefined, 512, 170))
  b.blob(-32.9, 0, 2.9, 0.9, 0.9, 0.5)

  // kontrol listesi afişi + raflar + dekor
  const list = posterTex('KONTROL LİSTESİ', ['72 saatlik ihtiyaç: su, gıda, ilaç', 'Işık ve haberleşme: fener, radyo, powerbank', 'Belgeler: kimlik kopyası, nakit para', 'Ağır, kırılgan ve gereksiz eşyalardan kaçın!'], '#c2410c')
  poster(b, list, -26, 2.0, z0 + 0.18, 0, 1.15)
  const shelfM = solid(0x4b5563, { rough: 0.45, metal: 0.6 })
  for (const sxx of [-31, -29, -27, -25]) {
    b.box(sxx, 0.9, 3.55, 1.8, 0.04, 0.5, shelfM); b.box(sxx, 1.5, 3.55, 1.8, 0.04, 0.5, shelfM)
    for (const px of [-0.88, 0.88]) b.box(sxx + px, 1.0, 3.55, 0.04, 2.0, 0.5, shelfM)
    for (let k = 0; k < 4; k++) { b.box(sxx - 0.6 + k * 0.4, 1.05, 3.55, 0.32, 0.28, 0.38, solid([0x2563eb, 0xea580c, 0x16a34a, 0xca8a04][k % 4], { rough: 0.8 })); b.box(sxx - 0.6 + k * 0.4, 1.65, 3.55, 0.32, 0.28, 0.38, solid([0xdc2626, 0xfafafa, 0x0891b2, 0x7c3aed][k % 4], { rough: 0.8 })) }
  }
  b.col.add(-28, 1.0, 3.55, 8.0, 2.0, 0.5)
  addLocker(b, -19.2, -3.3, 0, 3)
  addChair(b, -33, -3.0, 0.4); addPlant(b, -33.2, -3.2, 0.9)
  addExitSign(b, -18.2, 2.9, -1.2, -Math.PI / 2)
  return { backpack, bin, items, bagPos: new THREE.Vector3(sx + 0.05, 0.95, sz), binPos: new THREE.Vector3(-32.9, 0.5, 2.9) }
}

export { wrapText }
