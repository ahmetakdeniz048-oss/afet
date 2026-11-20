import * as THREE from 'three'

/** Eksen hizalı kutu çarpıştırıcı. `enabled=false` olunca (ör. açılan kapı) yok sayılır. */
export type Box = {
  minX: number; minY: number; minZ: number
  maxX: number; maxY: number; maxZ: number
  enabled: boolean
}

export class Colliders {
  readonly boxes: Box[] = []

  /** Merkez + boyut ile kutu ekler. */
  add(cx: number, cy: number, cz: number, w: number, h: number, d: number): Box {
    const b: Box = {
      minX: cx - w / 2, maxX: cx + w / 2,
      minY: cy - h / 2, maxY: cy + h / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      enabled: true,
    }
    this.boxes.push(b)
    return b
  }

  /** Min/max ile kutu ekler. */
  addRange(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box {
    const b: Box = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), enabled: true }
    this.boxes.push(b)
    return b
  }

  /** Verilen gövde (ayak merkezi + yarıçap + yükseklik) bir kutuyla kesişiyor mu? */
  hits(x: number, feetY: number, z: number, r: number, h: number): Box | null {
    const y0 = feetY, y1 = feetY + h
    for (const b of this.boxes) {
      if (!b.enabled) continue
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ && y1 > b.minY && y0 < b.maxY) return b
    }
    return null
  }

  /** Kesişen en yüksek kutunun üst yüzeyi (basamak çıkma için); yoksa -Infinity. */
  highestTopHit(x: number, feetY: number, z: number, r: number, h: number): number {
    let top = -Infinity
    const y0 = feetY, y1 = feetY + h
    for (const b of this.boxes) {
      if (!b.enabled) continue
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ && y1 > b.minY && y0 < b.maxY) top = Math.max(top, b.maxY)
    }
    return top
  }

  /** Işın - kutu: ilk çarpma mesafesi (kamera çarpışması için). */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number {
    let best = maxDist
    for (const b of this.boxes) {
      if (!b.enabled) continue
      let tmin = 0, tmax = best
      const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z]
      const lo = [b.minX, b.minY, b.minZ], hi = [b.maxX, b.maxY, b.maxZ]
      let ok = true
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-8) {
          if (o[i] < lo[i] || o[i] > hi[i]) { ok = false; break }
        } else {
          let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i]
          if (t1 > t2) [t1, t2] = [t2, t1]
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
          if (tmin > tmax) { ok = false; break }
        }
      }
      if (ok && tmin < best) best = tmin
    }
    return best
  }
}
