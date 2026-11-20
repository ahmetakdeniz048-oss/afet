import * as THREE from 'three'
import type { Colliders } from '../engine/collision'
import type { Input } from '../engine/input'
import { CONFIG } from './config'

export const HULL = { r: 0.28, stand: 1.75, crouch: 0.88, eyeStand: 1.64, eyeCrouch: 0.8, step: 0.36 }
export const SPEED = { gravity: 15 }

export class Player {
  pos = new THREE.Vector3(0, 0, 9)
  vy = 0
  yaw = 0 // 0 => -z yönüne bakar
  pitch = 0
  grounded = true
  crouching = false
  holding = false
  running = false
  moving = false
  speed = 0
  eye = HULL.eyeStand
  height = HULL.stand
  bobPhase = 0
  stepDist = 0
  /** Çarpışma + hareket kilidi (ör. masaya tutunma). */
  locked = false
  private wantCrouch = false
  /** Adım olayı: dokunulan zemin türüyle. */
  onStep: (run: boolean) => void = () => {}
  onLand: (v: number) => void = () => {}
  onJump: () => void = () => {}

  teleport(x: number, y: number, z: number, yaw: number): void {
    this.pos.set(x, y, z); this.vy = 0; this.yaw = yaw; this.pitch = 0
    this.crouching = false; this.wantCrouch = false; this.holding = false; this.height = HULL.stand; this.eye = HULL.eyeStand
  }

  get eyePos(): THREE.Vector3 { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z) }
  get forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))
  }

  update(dt: number, input: Input, col: Colliders, ctl: { canMove: boolean; canLook: boolean }): void {
    // bakış
    const look = input.look()
    if (ctl.canLook) {
      this.yaw -= look.dx * 0.0023
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - look.dy * 0.0023))
      const k = 1.9 * dt
      if (input.held('ArrowLeft')) this.yaw += k
      if (input.held('ArrowRight')) this.yaw -= k
      if (input.held('ArrowUp')) this.pitch = Math.min(1.45, this.pitch + k)
      if (input.held('ArrowDown')) this.pitch = Math.max(-1.45, this.pitch - k)
    }

    // çömelme (C: aç/kapat, Ctrl: basılı tut)
    if (input.consume('KeyC')) this.wantCrouch = !this.wantCrouch
    const wantC = this.wantCrouch || input.held('ControlLeft')
    if (wantC && !this.crouching) { this.crouching = true; this.height = HULL.crouch }
    else if (!wantC && this.crouching) {
      if (!col.hits(this.pos.x, this.pos.y + 0.02, this.pos.z, HULL.r, HULL.stand)) { this.crouching = false; this.height = HULL.stand }
      else this.wantCrouch = true // üstü kapalı: kalkamaz
    }
    this.holding = input.held('KeyT') && this.crouching

    // yatay hareket
    let mx = 0, mz = 0
    if (ctl.canMove && !this.holding) {
      if (input.anyHeld('KeyW')) mz -= 1
      if (input.anyHeld('KeyS')) mz += 1
      if (input.anyHeld('KeyA')) mx -= 1
      if (input.anyHeld('KeyD')) mx += 1
    }
    this.moving = mx !== 0 || mz !== 0
    this.running = this.moving && input.held('ShiftLeft') && !this.crouching
    const target = this.crouching ? CONFIG.player.crouchSpeed : this.running ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed
    const len = Math.hypot(mx, mz) || 1
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw)
    const wx = (mx / len) * c + (mz / len) * s
    const wz = -(mx / len) * s + (mz / len) * c
    // hızlanma
    const want = this.moving ? target : 0
    this.speed += (want - this.speed) * Math.min(1, dt * (this.moving ? 10 : 12))
    const dirx = this.moving ? wx : 0, dirz = this.moving ? wz : 0
    if (this.moving) { this.lastDirX = dirx; this.lastDirZ = dirz }
    const vx = (this.moving ? dirx : this.lastDirX) * this.speed, vz = (this.moving ? dirz : this.lastDirZ) * this.speed
    this.moveAxis(col, vx * dt, 0)
    this.moveAxis(col, 0, vz * dt)

    // zıplama + yerçekimi
    if (ctl.canMove && this.grounded && !this.crouching && input.consume('Space')) { this.onJump(); this.vy = CONFIG.player.jumpSpeed; this.grounded = false }
    const wasGrounded = this.grounded
    this.vy -= SPEED.gravity * dt
    this.vy = Math.max(this.vy, -25)
    this.moveY(col, this.vy * dt)
    // merdiven inişinde yere yapış
    if (wasGrounded && !this.grounded && this.vy <= 0) {
      const drop = this.groundBelow(col, 0.4)
      if (drop !== null) { this.pos.y = drop; this.vy = 0; this.grounded = true }
    }

    // göz yüksekliği yumuşatma + yürüyüş sallanması
    const eyeT = this.crouching ? HULL.eyeCrouch : HULL.eyeStand
    this.eye += (eyeT - this.eye) * Math.min(1, dt * 12)
    const horiz = this.speed
    if (this.grounded && horiz > 0.3) {
      this.stepDist += horiz * dt
      this.bobPhase += horiz * dt * (this.running ? 2.0 : 2.4)
      const stride = this.crouching ? 1.1 : this.running ? 2.0 : 1.55
      if (this.stepDist > stride) { this.stepDist = 0; this.onStep(this.running) }
    }
  }

  private lastDirX = 0
  private lastDirZ = 0

  private groundBelow(col: Colliders, maxDrop: number): number | null {
    let best: number | null = null
    for (const b of col.boxes) {
      if (!b.enabled) continue
      if (this.pos.x + HULL.r > b.minX && this.pos.x - HULL.r < b.maxX && this.pos.z + HULL.r > b.minZ && this.pos.z - HULL.r < b.maxZ) {
        const top = b.maxY
        if (top <= this.pos.y + 0.001 && top >= this.pos.y - maxDrop && (best === null || top > best)) best = top
      }
    }
    return best
  }

  private moveAxis(col: Colliders, dx: number, dz: number): void {
    if (dx === 0 && dz === 0) return
    const nx = this.pos.x + dx, nz = this.pos.z + dz
    const y = this.pos.y + 0.001
    if (!col.hits(nx, y, nz, HULL.r, this.height)) { this.pos.x = nx; this.pos.z = nz; return }
    // basamak çık
    if (this.grounded || this.vy <= 0.5) {
      const top = col.highestTopHit(nx, y, nz, HULL.r, this.height)
      const lift = top - this.pos.y
      if (lift > 0 && lift <= HULL.step && !col.hits(nx, top + 0.002, nz, HULL.r, this.height)) {
        this.pos.x = nx; this.pos.z = nz; this.pos.y = top; this.vy = Math.max(this.vy, 0); this.grounded = true
      }
    }
  }

  private moveY(col: Colliders, dy: number): void {
    const prev = this.pos.y
    let ny = prev + dy
    this.grounded = false
    if (dy <= 0) {
      // aşağı: üstten yüzeye konma
      let land = -Infinity
      for (const b of col.boxes) {
        if (!b.enabled) continue
        if (this.pos.x + HULL.r > b.minX && this.pos.x - HULL.r < b.maxX && this.pos.z + HULL.r > b.minZ && this.pos.z - HULL.r < b.maxZ) {
          if (b.maxY <= prev + 0.02 && b.maxY > land && b.maxY >= ny - 0.0001) land = b.maxY
        }
      }
      if (land > -Infinity && ny <= land) {
        if (this.vy < -7) this.onLand(-this.vy)
        ny = land; this.vy = 0; this.grounded = true
      }
    } else {
      const hit = col.hits(this.pos.x, ny, this.pos.z, HULL.r, this.height)
      if (hit) { ny = hit.minY - this.height - 0.001; this.vy = 0 }
    }
    this.pos.y = ny
  }
}
