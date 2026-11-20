import * as THREE from 'three'
import { GameLoop } from '../engine/loop'
import { Input } from '../engine/input'
import { Builder, solid, texMat } from './builder'
import { Gfx, type Quality } from './gfx'
import { AudioSys, speak } from './audio'
import { buildEnvironment, type Env } from './environment'
import { buildCorridor, buildBagRoom, buildHall, type BagRefs } from './world'
import { QuakeRoom, QUAKE, type QuakeCallbacks } from './quake'
import { HazmatRoom, GAS } from './hazmat'
import { Building, SPAWN3, planTex, FH } from './evac-building'
import { ExhibitMedia, type ExhibitRecord } from './exhibit-media'
import { familyPlanPanel, timelineEditorPanel } from './panels'
import { loadModels, addWallSign } from './props'
import { prebuildTextures, canvasTex, font } from './textures'
import { Player } from './player'
import { Avatar } from './avatar'
import { Hud, type Objective } from './hud'
import { CONFIG } from './config'
import { tuning } from './tuning'
import { BAG_ITEMS, BAG_REQUIRED, SCORE, bagPick, evacBonus, formatTime, gasDamagePerSecond, grade, quakeBonus, quakeDamagePerSecond, smokeDamagePerSecond } from './rules'

type Section = 'hall' | 'quake' | 'bag' | 'hazmat' | 'evac' | 'yard' | 'corridor'
type State = 'loading' | 'menu' | 'play' | 'paused' | 'modal'

const ACCENT: Record<Section, string> = { hall: '#38bdf8', quake: '#f59e0b', bag: '#fb923c', hazmat: '#a3e635', evac: '#f87171', yard: '#34d399', corridor: '#38bdf8' }
const TELEPORT: Record<string, { x: number; y: number; z: number; yaw: number }> = {
  Digit1: { x: 0, y: 0, z: 9, yaw: 0 },
  Digit2: { x: -21, y: 0, z: -9, yaw: Math.PI / 2 },
  Digit3: { x: -21, y: 0, z: 0, yaw: Math.PI / 2 },
  Digit4: { x: -21, y: 0, z: 9, yaw: Math.PI / 2 },
  Digit5: { x: 27, y: 0, z: 0.5, yaw: -Math.PI / 2 },
}

type Flight = { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; s0: number; hide: boolean }

export class Game {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.05, 420)
  readonly b: Builder
  readonly gfx: Gfx
  readonly input: Input
  readonly audio = new AudioSys()
  readonly hud = new Hud()
  readonly player = new Player()
  readonly avatar = new Avatar()
  readonly quake: QuakeRoom
  readonly hazmat: HazmatRoom
  readonly building: Building
  readonly exhibit: ExhibitMedia
  private env!: Env
  private bag!: BagRefs
  private loop: GameLoop
  state: State = 'loading'
  health = 100
  score = 0
  elapsed = 0
  done = { quake: false, bag: false, hazmat: false, evac: false }
  private section: Section = 'hall'
  private tp = false
  private prev = new THREE.Vector3()
  private cur = new THREE.Vector3()
  private fov = CONFIG.camera.fov
  private fade = 0
  private danger = 0
  private smokeAmt = 0
  private gasAmt = 0
  private flights: Flight[] = []
  private bagTaken = new Map<string, 'ok' | 'bad'>()
  private bagOkCount = 0
  private ray = new THREE.Raycaster()
  private interactionRefresh = 0
  private quakeCountdown = 0
  private quakeStarted = false
  private quakeTried = { under: false, crouch: false, hold: false }
  private quakeFinished = false
  private evac = { planViewed: false, reachedMid: false, reachedGround: false, drillStart: 0, elevatorCd: 0, fireWarned: false }
  private drillMistakes = 0
  private maskOn = false
  private coughCd = 0
  private dmgFlashCd = 0
  private base = { fogColor: new THREE.Color(), near: 70, far: 230 }
  private clock = new THREE.Clock(false)
  private lastSeismo = 0
  private shown: Record<string, boolean> = {}

  constructor(readonly canvas: HTMLCanvasElement) {
    this.b = new Builder(this.scene)
    this.gfx = new Gfx(canvas, this.scene, this.camera)
    this.input = new Input(canvas)
    this.quake = new QuakeRoom(this.b)
    this.hazmat = new HazmatRoom(this.b)
    this.building = new Building(this.b)
    this.exhibit = new ExhibitMedia(this.b)
    this.camera.rotation.order = 'YXZ'
    this.loop = new GameLoop({ step: dt => this.step(dt), render: (a, fs) => this.render(a, fs) }, 60)
    this.loop.paused = true
    this.scene.add(this.camera)
    this.scene.add(this.avatar.root)
    this.avatar.root.visible = false
  }

  // ------------------------------------------------------------------ yükleme
  async boot(onProgress: (f: number, label: string) => void): Promise<void> {
    await prebuildTextures(512, f => onProgress(f * 0.4, 'Malzemeler ve dokular hazırlanıyor'))
    await loadModels(this.b, f => onProgress(0.4 + f * 0.3, '3B modeller yükleniyor'))
    onProgress(0.72, 'Eğitim merkezi kuruluyor')
    await new Promise(r => setTimeout(r, 16))
    this.env = buildEnvironment(this.b, this.gfx.renderer)
    buildHall(this.b)
    buildCorridor(this.b)
    this.exhibit.build()
    void this.exhibit.init()
    this.quake.build()
    this.buildQuakeConsole()
    onProgress(0.8, 'Odalar ve ekipman yerleştiriliyor')
    await new Promise(r => setTimeout(r, 16))
    this.bag = buildBagRoom(this.b)
    this.hazmat.build()
    this.building.build()
    onProgress(0.95, 'Işıklandırma hesaplanıyor')
    await new Promise(r => setTimeout(r, 16))
    const savedQuality = localStorage.getItem('afet.quality') as Quality | null
    const compactTouchDevice = window.matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) <= 520
    const q = savedQuality ?? (this.gfx.software || compactTouchDevice ? 'low' : 'medium')
    this.gfx.setQuality(q, this.env.sun)
    this.resize()
    window.addEventListener('resize', () => this.resize())
    this.base.fogColor.copy((this.scene.fog as THREE.Fog).color)
    this.base.near = (this.scene.fog as THREE.Fog).near; this.base.far = (this.scene.fog as THREE.Fog).far
    this.bindUi(q)
    this.player.teleport(0, 0, 9, 0)
    this.prev.copy(this.player.pos); this.cur.copy(this.player.pos)
    this.player.onStep = run => this.audio.step(this.stepKind(), run)
    this.player.onLand = v => { this.audio.thud(0.4); if (v > 9) this.drainOnce((v - 9) * 6, 'Sert düştünüz!') }
    this.player.onJump = () => tuning.activate('jump')
    this.input.onLockChange = locked => { if (!locked && !this.input.touchMode && this.state === 'play' && !this.input.dragMode) this.pause() }
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause() })
    this.updateHud(0)
    this.loop.start()
    this.gfx.render(0)
    onProgress(1, 'Hazır')
    this.state = 'menu'
  }

  private resize(): void { this.gfx.resize(window.innerWidth, window.innerHeight) }

  private bindUi(q: Quality): void {
    const $ = (id: string) => document.getElementById(id)!
    const selQ = $('selQuality') as HTMLSelectElement, sens = $('rngSens') as HTMLInputElement, vol = $('rngVol') as HTMLInputElement
    selQ.value = q
    selQ.addEventListener('change', () => { localStorage.setItem('afet.quality', selQ.value); this.gfx.setQuality(selQ.value as Quality, this.env.sun) })
    sens.addEventListener('input', () => { this.input.sensitivity = Number(sens.value) })
    vol.addEventListener('input', () => this.audio.setVolume(Number(vol.value)))
    $('btnStart').addEventListener('click', () => this.begin())
    $('btnResume').addEventListener('click', () => this.resume())
    $('btnRestart').addEventListener('click', () => location.reload())
    $('btnTimelineEditor').addEventListener('click', () => this.openTimelineEditor())
    this.bindTouchControls()
  }

  private bindTouchControls(): void {
    const root = document.getElementById('touchControls')
    const stick = document.getElementById('touchStick')
    const knob = document.getElementById('stickKnob')
    const lookPad = document.getElementById('lookPad')
    if (!root || !stick || !knob || !lookPad) return
    root.classList.toggle('touch-enabled', this.input.touchMode)
    if (this.input.touchMode) document.getElementById('startNote')!.textContent = 'Dokunmatik kumanda altta: sol joystick ile hareket, sağ alanda sürükleyerek bakış.'

    let stickPointer = -1
    const stickKeys = new Set<string>()
    const releaseStick = () => { for (const code of stickKeys) this.input.setVirtualHeld(code, false); stickKeys.clear(); knob.style.transform = '' }
    const updateStick = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
      let dx = e.clientX - cx, dy = e.clientY - cy
      const max = r.width * 0.34, mag = Math.hypot(dx, dy)
      if (mag > max) { dx *= max / mag; dy *= max / mag }
      knob.style.transform = `translate(${dx}px, ${dy}px)`
      const next = new Set<string>()
      if (dy < -max * 0.22) next.add('KeyW')
      if (dy > max * 0.22) next.add('KeyS')
      if (dx < -max * 0.22) next.add('KeyA')
      if (dx > max * 0.22) next.add('KeyD')
      for (const code of stickKeys) if (!next.has(code)) this.input.setVirtualHeld(code, false)
      for (const code of next) if (!stickKeys.has(code)) this.input.setVirtualHeld(code, true)
      stickKeys.clear(); next.forEach(code => stickKeys.add(code))
    }
    stick.addEventListener('pointerdown', e => { e.preventDefault(); stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); updateStick(e) })
    stick.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) updateStick(e) })
    const stickUp = (e: PointerEvent) => { if (e.pointerId === stickPointer) { releaseStick(); stickPointer = -1 } }
    stick.addEventListener('pointerup', stickUp); stick.addEventListener('pointercancel', stickUp)

    let lookPointer = -1, lastX = 0, lastY = 0
    lookPad.addEventListener('pointerdown', e => { e.preventDefault(); lookPointer = e.pointerId; lastX = e.clientX; lastY = e.clientY; lookPad.setPointerCapture(e.pointerId) })
    lookPad.addEventListener('pointermove', e => {
      if (e.pointerId !== lookPointer) return
      e.preventDefault(); this.input.addLookDelta(e.clientX - lastX, e.clientY - lastY); lastX = e.clientX; lastY = e.clientY
    })
    const lookUp = (e: PointerEvent) => { if (e.pointerId === lookPointer) lookPointer = -1 }
    lookPad.addEventListener('pointerup', lookUp); lookPad.addEventListener('pointercancel', lookUp)

    root.querySelectorAll<HTMLButtonElement>('button[data-code]').forEach(button => {
      const code = button.dataset.code!
      button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); this.input.setVirtualHeld(code, true) })
      const up = () => this.input.setVirtualHeld(code, false)
      button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('lostpointercapture', up)
    })
  }

  begin(): void {
    $show('screenStart', false)
    this.audio.init()
    this.audio.setVolume(Number((document.getElementById('rngVol') as HTMLInputElement).value))
    if (!this.input.touchMode) this.input.requestLock()
    this.hud.show(true)
    this.state = 'play'; this.loop.paused = false; this.input.enabled = true
    this.clock.start()
    tuning.activate('run')
    speak('Afet eğitim merkezine hoş geldiniz.')
  }

  pause(): void {
    if (this.state !== 'play') return
    this.state = 'paused'; this.loop.paused = true; this.input.enabled = false; this.input.exitLock(); this.audio.setRumble(0)
    $show('screenPause', true)
  }
  resume(): void {
    if (this.state !== 'paused') return
    $show('screenPause', false)
    this.state = 'play'; this.loop.paused = false; this.input.enabled = true; this.input.clearPressed()
    if (!this.input.touchMode) this.input.requestLock()
  }

  private openModal(html: string, buttons: { label: string; primary?: boolean; onClick?: () => void }[], onShow?: (c: HTMLElement) => void): void {
    this.state = 'modal'; this.loop.paused = true; this.input.enabled = false; this.input.exitLock()
    this.hud.modal(html, buttons.map(b => ({ ...b, onClick: () => { this.state = 'play'; this.loop.paused = false; this.input.enabled = true; this.input.clearPressed(); if (!this.input.touchMode) this.input.requestLock(); b.onClick?.() } })), onShow)
  }

  // ------------------------------------------------------------------ dünya ek parçaları
  private buildQuakeConsole(): void {
    const b = this.b
    const g = new THREE.Group(); g.position.set(-21, 0, -4.24); b.root.add(g)
    b.box(0, 1.35, 0, 1.0, 0.7, 0.14, solid(0x1f2937, { rough: 0.4, metal: 0.4 }), { parent: g, cast: true })
    const scr = canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = '#0a1a12'; c.fillRect(0, 0, w, h)
      c.fillStyle = '#4ade80'; c.font = font(38); c.textAlign = 'center'; c.fillText('DEPREM SİMÜLATÖRÜ', w / 2, 66)
      c.fillStyle = '#fbbf24'; c.font = font(28); c.fillText('P ve S dalgası – 14 sn', w / 2, 118)
      c.fillStyle = '#fff'; c.font = font(32); c.fillText('[E] Başlat', w / 2, 200)
    })
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ map: scr, emissive: 0xffffff, emissiveMap: scr, emissiveIntensity: 1.0 }))
    face.position.set(0, 1.35, -0.075); face.rotation.y = Math.PI; g.add(face)
    b.proxy(g, 1.2, 0.9, 0.8, 1.3).position.z = -0.4
    b.interactive(g, { kind: 'quake_start', name: 'Deprem Simülatörü' })
    addWallSign(b, -21, 2.2, -4.17, 1.6, 0.4, Math.PI, canvasTex(640, 160, (c, w, h) => { c.fillStyle = '#b45309'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = font(54); c.textAlign = 'center'; c.fillText('DEPREM TATBİKATI', w / 2, 98) }), 0.35)
    void texMat
  }

  // ------------------------------------------------------------------ yardımcılar
  private stepKind(): 'tile' | 'metal' | 'ground' {
    const p = this.player.pos
    if (p.x > 49.2 && p.x < 55.8 && p.z > -9.8 && p.z < -2) return 'metal'
    if (p.x > 56 && p.x < 72) return 'ground'
    return 'tile'
  }

  private detectSection(): Section {
    const { x, y, z } = this.player.pos
    void y
    if (x < -18) return z < -4 ? 'quake' : z < 4 ? 'bag' : 'hazmat'
    if (x >= 24 && x <= 56 && z >= -10 && z <= 10) return 'evac'
    if (x > 18 && x < 24 && Math.abs(z) < 2) return 'corridor'
    if (x > 56 && x < 76 && z > -17 && z < 8) return 'yard'
    return 'hall'
  }

  private teleport(t: { x: number; y: number; z: number; yaw: number }): void {
    this.player.teleport(t.x, t.y, t.z, t.yaw)
    this.prev.copy(this.player.pos); this.cur.copy(this.player.pos)
    this.fade = 1
  }

  private drain(rate: number, dt: number, reason?: string): void {
    if (rate <= 0 || this.state !== 'play') return
    this.health = Math.max(0, this.health - rate * dt)
    this.dmgFlashCd -= dt
    if (this.dmgFlashCd <= 0) { this.hud.flashDamage(); this.dmgFlashCd = 0.5 }
    if (this.health <= 0) this.fail(reason ?? 'Sağlığınız tükendi.')
  }
  private drainOnce(amount: number, reason: string): void {
    if (this.state !== 'play') return
    this.health = Math.max(0, this.health - amount)
    this.hud.flashDamage(); this.hud.toast(reason, 'bad')
    if (this.health <= 0) this.fail(reason)
  }
  addScore(n: number): void { this.score = Math.max(0, this.score + n) }

  private fail(reason: string): void {
    this.audio.setRumble(0); this.audio.setBreathing(false); this.audio.setGas(0); this.audio.setSiren(false)
    this.quake.stop()
    this.openModal(
      `<h2 class="modal-title">Yaralandınız</h2><div class="modal-sub">${reason}</div><div class="modal-body"><p>Gerçek bir afette de ilk saniyeler belirleyicidir. Doğru davranışı tekrar deneyin: <b>Çök – Kapan – Tutun</b>, korunma ekipmanı olmadan tehlikeli alana girmeyin ve dumanda eğilerek ilerleyin.</p></div>`,
      [{ label: 'Salona dön ve tekrar dene', primary: true, onClick: () => this.respawn() }],
    )
  }
  private respawn(): void {
    this.health = 75; this.addScore(-25)
    this.hazmat.reset(); this.maskOn = false; this.avatar.setMask(false)
    this.building.resetDrill(); this.quake.reset(); this.quakeCountdown = 0; this.quakeStarted = false
    this.hud.showQuake(false)
    this.teleport(TELEPORT.Digit1)
    this.hud.toast('Sağlığınız kısmen yenilendi. Tekrar deneyin.', 'warn')
  }

  // ------------------------------------------------------------------ ana adım
  private step(dt: number): void {
    if (this.state !== 'play') return
    const inp = this.input
    this.elapsed += dt
    if (inp.consume('Escape')) { this.pause(); return }
    if (inp.consume('KeyU')) { this.openTimelineEditor(); return }
    if (inp.consume('KeyV')) { this.tp = !this.tp; this.hud.toast(this.tp ? 'Üçüncü şahıs kamera' : 'Birinci şahıs kamera') }
    if (inp.consume('KeyM')) { this.audio.setMuted(!this.audio.muted); this.hud.toast(this.audio.muted ? 'Ses kapalı' : 'Ses açık') }
    for (const k of Object.keys(TELEPORT)) if (inp.consume(k)) this.goTo(k)

    // oyuncu
    this.prev.copy(this.player.pos)
    this.player.update(dt, inp, this.b.col, { canMove: this.fade < 0.9, canLook: true })
    this.cur.copy(this.player.pos)
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 2.2)
    const p = this.player.pos

    // bölüm geçişleri
    const sec = this.detectSection()
    if (sec !== this.section) this.onSectionChange(this.section, sec)
    this.section = sec

    // dünya güncellemeleri
    const info = { x: p.x, y: p.y, z: p.z, crouching: this.player.crouching, holding: this.player.holding }
    this.updateQuakeFlow(dt, info)
    this.quake.update(dt, info)
    this.hazmat.update(dt)
    this.building.update(dt)
    for (const u of this.b.updaters) u(dt, this.elapsed)
    this.updateFlights(dt)
    this.updateHazards(dt)
    this.interactionRefresh -= dt
    if (this.interactionRefresh <= 0) {
      this.interactionRefresh += 1 / 30
      this.updateInteraction()
    }
    this.evac.elevatorCd -= dt
    this.updateEvacFlow()

    // genel arayüz
    this.updateHud(dt)
  }

  private goTo(code: string): void {
    const t = TELEPORT[code]
    if (this.quake.running) this.quake.stop()
    this.quakeCountdown = 0; this.hud.countdown(null); this.hud.showQuake(false)
    this.building.drillActive && code !== 'Digit5' && this.cancelDrill()
    this.teleport(t)
  }

  private cancelDrill(): void {
    this.building.resetDrill(); this.audio.setSiren(false); this.hud.banner(null)
  }

  private onSectionChange(from: Section, to: Section): void {
    if (from === 'hazmat') {
      if (this.maskOn) this.hud.toast('Maskeyi çıkardınız.', '')
      this.maskOn = false; this.avatar.setMask(false); this.audio.setBreathing(false); this.audio.setGas(0)
      this.hazmat.reset()
    }
    if (from === 'quake' && this.quake.running === false) this.hud.showQuake(false)
    if ((from === 'evac' || from === 'yard') && (to === 'hall' || to === 'corridor') && this.building.drillActive) {
      this.cancelDrill(); this.hud.toast('Tatbikat iptal edildi.', 'warn')
    }
    const names: Partial<Record<Section, string>> = { quake: 'Deprem Tatbikat Odası', bag: 'Afet Çantası Hazırlama Odası', hazmat: 'Tehlikeli Madde Odası' }
    if (names[to] && !this.shown[to]) {
      this.shown[to] = true
      const msg: Record<string, string> = {
        quake: 'Duvardaki konsoldan simülasyonu başlatın. Sarsıntı sırasında sağlam masaya geçin.',
        bag: 'Masalardaki eşyalara bakıp E ile seçin: gerekli olanlar çantaya, gereksizler çanta dışına gider.',
        hazmat: 'Toksik gaz sızıntısı! Önce gaz maskesini bulun (batı duvarındaki KKD istasyonu).',
      }
      this.hud.toast(msg[to], '', 6500)
    }
    if (to === 'hazmat') this.hud.showGas(true)
    if (from === 'hazmat') this.hud.showGas(false)
    if (to === 'bag') this.refreshBagUi()
    this.hud.showBag(to === 'bag')
  }

  // ------------------------------------------------------------------ deprem akışı
  private quakeCb: QuakeCallbacks = {
    damage: (a, r) => this.drainOnce(a * 0.9, r),
    toast: (m, k) => this.hud.toast(m, k ?? 'warn'),
    sfx: {
      creak: () => this.audio.creak(), glass: () => this.audio.glassBreak(), thud: v => this.audio.thud(v),
      spark: () => this.audio.spark(), rumble: l => this.audio.setRumble(l),
    },
    speak: m => speak(m),
    finished: r => this.onQuakeFinished(r),
  }

  private updateQuakeFlow(dt: number, info: { x: number; z: number; y: number; crouching: boolean; holding: boolean }): void {
    if (this.quakeCountdown > 0) {
      const prevSec = Math.ceil(this.quakeCountdown)
      this.quakeCountdown -= dt
      const sec = Math.ceil(this.quakeCountdown)
      if (this.quakeCountdown <= 0) {
        this.hud.countdown(null)
        this.quakeStarted = true; this.quakeFinished = false
        this.quakeTried = { under: false, crouch: false, hold: false }
        this.quake.start(this.quakeCb)
        this.hud.showQuake(true)
      } else {
        this.hud.countdown(String(sec), 'Sağlam masanın yanına gidin')
        if (sec !== prevSec) this.audio.beep(660, 0.08, 'square', 0.05)
      }
    }
    if (this.quake.running) {
      const under = this.quake.isUnderTable(info)
      if (under) this.quakeTried.under = true
      if (info.crouching) this.quakeTried.crouch = true
      if (this.quake.phase === 'S' && under && info.crouching && info.holding) this.quakeTried.hold = true
      this.hud.quakeUi(this.quake.phase, { cok: info.crouching, kapan: under, tutun: info.holding && under })
      const ph = this.quake.phase
      this.hud.banner(ph === 'P' ? 'P dalgası! S dalgası gelmeden ÇÖK – KAPAN – TUTUN' : ph === 'S' ? 'S dalgası! Masanın altında kal, TUTUN (T)' : 'Sarsıntı yatışıyor… yerinde kal', ph !== 'decay')
      // yalnızca ilk anlık kısıtlama: S dalgasında korumasızlık hasarı
      const inRoom = this.section === 'quake'
      if (inRoom) this.drain(quakeDamagePerSecond(this.quake.phase === 'decay' ? 'idle' : (this.quake.phase as 'P' | 'S'), info.crouching, info.holding, under), dt, 'Deprem sırasında korunmasızdınız!')
      else if (this.quake.phase === 'S') this.drain(0, dt)
      this.lastSeismo -= dt
      if (this.lastSeismo <= 0) { this.lastSeismo = 1 / 30; this.hud.pushSeismo(Math.max(-1, Math.min(1, this.quake.displacement * 0.9)), this.quake.phase) }
    } else if (this.quakeStarted && !this.quakeFinished) {
      // bitişi finished geri çağrısı yönetir
    }
  }

  private onQuakeFinished(r: { safeSeconds: number; exposedSeconds: number; hits: number; fullyProtected: boolean }): void {
    this.quakeFinished = true; this.quakeStarted = false
    this.hud.banner(null); this.hud.showQuake(false); this.audio.setRumble(0)
    const bonus = quakeBonus(r.safeSeconds)
    const ok = r.safeSeconds >= 4.5
    this.addScore(bonus + (ok && r.hits === 0 ? 40 : 0))
    if (ok) this.done.quake = true
    const steps = this.quakeTried
    const html = `<h2 class="modal-title">${ok ? 'Deprem Tatbikatı Tamamlandı' : 'Tatbikat Yetersiz'}</h2>
      <div class="modal-sub">Güvenli kalma süresi: ${r.safeSeconds.toFixed(1)} sn · Korunmasız süre: ${r.exposedSeconds.toFixed(1)} sn · Yaralanma: ${r.hits}</div>
      <div class="modal-body"><p>
      <span class="tag ${steps.crouch ? '' : 'bad'}">ÇÖK ${steps.crouch ? '✓' : '✕'}</span>
      <span class="tag ${steps.under ? '' : 'bad'}">KAPAN ${steps.under ? '✓' : '✕'}</span>
      <span class="tag ${steps.hold ? '' : 'bad'}">TUTUN ${steps.hold ? '✓' : '✕'}</span></p>
      <ul><li><b>P dalgası</b> daha hızlı ve zayıftır; uyarı verir. <b>S dalgası</b> yıkıcıdır.</li>
      <li>Sağlam bir masanın altında çömelip ayağına tutunun; kafanızı ve boynunuzu koruyun.</li>
      <li>Pencere, cam, kitaplık ve tavan armatürlerinden uzak durun. Sarsıntı bitene kadar yerinizde kalın.</li></ul>
      <p>Kazanılan puan: <b>+${bonus}</b>${ok && r.hits === 0 ? ' · Hasarsız bonus <b>+40</b>' : ''}</p></div>`
    this.openModal(html, [{ label: ok ? 'Devam' : 'Tekrar dene', primary: true, onClick: () => { this.quake.reset(); this.checkAllDone() } }])
  }

  // ------------------------------------------------------------------ tehlikeler
  private updateHazards(dt: number): void {
    const p = this.player.pos
    let smokeT = 0, gasT = 0
    this.coughCd -= dt
    // gaz
    if (this.section === 'hazmat') {
      const ppm = this.hazmat.ppmAt(p.x, p.z)
      const inZone = this.hazmat.inZone(p.x, p.z)
      this.hud.setGas(ppm, this.maskOn)
      this.hazmat.drawDetector(ppm, this.elapsed)
      const dmg = gasDamagePerSecond(inZone, this.maskOn) * CONFIG.hazard.gasDamageScale
      if (dmg > 0) {
        this.drain(dmg, dt, 'Zehirli gazı soludunuz!')
        if (this.coughCd <= 0) { this.audio.cough(); this.coughCd = 1.4; this.hud.toast('Gazdan etkileniyorsunuz! Gaz maskesi takın.', 'bad', 2500) }
      }
      gasT = inZone ? (this.maskOn ? 0.2 : 0.75) : Math.min(0.2, ppm / 400)
      const prox = Math.max(0, 1 - Math.hypot(p.x - GAS.x, p.z - GAS.z) / 10)
      this.audio.setGas(prox * this.hazmat.gasLevel)
    }
    // duman
    const bld = this.building
    if (bld.drillActive) {
      const smoky = bld.inSmoke(p.x, p.y, p.z)
      if (smoky) {
        const rate = smokeDamagePerSecond(true, this.player.crouching, bld.powerOff, this.maskOn) * CONFIG.hazard.smokeDamageScale
        this.drain(rate, dt, 'Dumandan zehirlendiniz!')
        if (rate > 0 && this.coughCd <= 0) { this.audio.cough(); this.coughCd = 1.6; if (!this.player.crouching) this.hud.toast('Duman yoğun – eğilin (C) ve şalteri kapatın!', 'warn', 2600) }
        smokeT = (this.player.crouching ? 0.38 : 0.8) * bld.smokeLevel
      }
    }
    const k = Math.min(1, dt * 3)
    this.smokeAmt += (smokeT - this.smokeAmt) * k
    this.gasAmt += (gasT - this.gasAmt) * k
    // sis
    const fog = this.scene.fog as THREE.Fog
    const sm = Math.min(1, this.smokeAmt * 1.2), gs = Math.min(1, this.gasAmt * 0.9)
    const w = Math.max(sm, gs)
    const col = new THREE.Color(this.base.fogColor)
    if (sm >= gs && sm > 0) col.lerp(new THREE.Color(0x2e2e32), sm)
    else if (gs > 0) col.lerp(new THREE.Color(0x7a9b3a), gs)
    fog.color.copy(col); (this.scene.background as THREE.Color).copy(col.lerp(new THREE.Color(0x9fc4e8), 0).multiplyScalar(1))
    fog.near = this.base.near + (0.6 - this.base.near) * w; fog.far = this.base.far + (9 - this.base.far) * w
    if (w < 0.02) { (this.scene.background as THREE.Color).set(0x9fc4e8) }
  }

  // ------------------------------------------------------------------ etkileşim
  private rayBlocked(origin: THREE.Vector3, dir: THREE.Vector3, maxD: number): number {
    // en yakın çarpıştırıcı mesafesi (zemin hariç)
    let best = Infinity
    const ox = origin.x, oy = origin.y, oz = origin.z
    const dx = dir.x, dy = dir.y, dz = dir.z
    for (const bx of this.b.col.boxes) {
      if (!bx.enabled || bx.maxY - bx.minY > 100 || bx.maxX - bx.minX > 100) continue
      let t0 = 0, t1 = maxD
      if (Math.abs(dx) < 1e-8) { if (ox < bx.minX || ox > bx.maxX) continue }
      else { let a = (bx.minX - ox) / dx, c = (bx.maxX - ox) / dx; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) continue }
      if (Math.abs(dy) < 1e-8) { if (oy < bx.minY || oy > bx.maxY) continue }
      else { let a = (bx.minY - oy) / dy, c = (bx.maxY - oy) / dy; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) continue }
      if (Math.abs(dz) < 1e-8) { if (oz < bx.minZ || oz > bx.maxZ) continue }
      else { let a = (bx.minZ - oz) / dz, c = (bx.maxZ - oz) / dz; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) continue }
      if (t0 > 0.02 && t0 < best) best = t0
    }
    return best
  }

  private updateInteraction(): void {
    const eye = this.player.eyePos, dir = this.player.forward
    this.ray.set(eye, dir); this.ray.far = 3.2
    const hits = this.ray.intersectObjects(this.b.interactives, true)
    let found: THREE.Object3D | null = null, bestDistance = Infinity
    const visited = new Set<THREE.Object3D>()
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o && !o.userData.__interactive) o = o.parent
      if (!o) continue
      if (visited.has(o)) continue
      visited.add(o)
      if (!o.visible) continue
      const block = this.rayBlocked(eye, dir, h.distance)
      if (block < h.distance - 0.08) continue
      if (h.distance < bestDistance) { found = o; bestDistance = h.distance }
    }
    if (!found) { this.hud.setPrompt(null); return }
    const d = found.userData as { kind: string; name: string; hint?: string; pointIndex?: number }
    const { text, sub, ok } = this.promptFor(d)
    this.hud.setPrompt(text, sub, d.name)
    if (this.input.consume('KeyE') && ok) this.interact(found)
  }

  private promptFor(d: { kind: string; name: string; hint?: string; floor?: number; pointIndex?: number }): { text: string; sub?: string; ok: boolean } {
    switch (d.kind) {
      case 'bag_item': return { text: `Seç: ${d.name}`, ok: !this.done.bag || true }
      case 'exhibit_media': return { text: 'Sergi fotoğraf/video arşivini aç', ok: true }
      case 'timeline_point': return { text: 'Bu dönemin panosunu görüntüle', sub: 'Düzenlemek için Zaman Tünelini Düzenle düğmesini kullanın.', ok: true }
      case 'family_plan': return { text: 'Afet Aile Planını aç', sub: 'Buluşma noktaları, görevler ve iletişim bilgileri', ok: true }
      case 'mask': return { text: 'Gaz maskesini tak', ok: true }
      case 'valve': return this.maskOn ? { text: this.hazmat.valveClosed ? 'Vana kapalı' : 'Sızıntı vanasını kapat', ok: !this.hazmat.valveClosed } : { text: 'Ana vana', sub: 'Maskesiz yaklaşmayın! Önce gaz maskesini takın.', ok: true }
      case 'eyewash': return { text: 'Göz yıkama / acil duşu incele', ok: true }
      case 'drill_start': return { text: 'Tahliye tatbikatını başlat', ok: true }
      case 'plan': return { text: 'Tahliye planını incele', ok: true }
      case 'panel': return this.building.drillActive ? (this.building.powerOff ? { text: 'Ana şalter kapalı', ok: false } : { text: 'Ana elektrik şalterini kapat', ok: true }) : { text: 'Elektrik panosu', sub: 'Tatbikat başladığında kullanılır.', ok: false }
      case 'elevator': return { text: 'Asansör', sub: this.building.drillActive ? 'Yangında asansör kullanılmaz!' : undefined, ok: true }
      case 'exit_door': return this.building.exitOpen ? { text: 'Kapı açık', ok: false } : { text: 'Acil çıkış kapısını aç', ok: true }
      case 'stair_door': {
        const floor = Number(d.floor ?? 0)
        return this.building.stairDoorOpen(floor)
          ? { text: 'Yangın kapısı açık', ok: false }
          : { text: 'Panik barına basıp yangın merdivenine gir', ok: true }
      }
      case 'quake_start': return this.quake.running || this.quakeCountdown > 0 ? { text: 'Simülasyon sürüyor', ok: false } : { text: 'Deprem simülasyonunu başlat', ok: true }
      default: return { text: d.name, ok: true }
    }
  }

  private interact(o: THREE.Object3D): void {
    const d = o.userData as { kind: string; name: string; hint?: string; itemId?: string; ok?: boolean; floor?: number; pointIndex?: number }
    switch (d.kind) {
      case 'bag_item': return this.pickBagItem(o, d.itemId!, !!d.ok, d.name, d.hint ?? '')
      case 'exhibit_media': return this.openExhibitManager()
      case 'timeline_point': return this.openTimelineViewer(Number(d.pointIndex ?? 0))
      case 'family_plan': return this.openFamilyPlan()
      case 'mask': {
        this.hazmat.takeMask(); this.maskOn = true; this.avatar.setMask(true); this.audio.setBreathing(true)
        this.addScore(SCORE.mask); this.audio.beep(880, 0.1, 'sine', 0.08)
        this.hud.toast('Gaz maskesi takıldı. Şimdi sızıntı vanasını kapatın.', 'ok', 5000)
        speak('Gaz maskesini taktınız. Şimdi sızıntı vanasını kapatın.')
        return
      }
      case 'valve': {
        if (!this.maskOn) { this.hud.toast('Maskesiz yaklaşmak tehlikeli! Önce gaz maskesini takın.', 'warn'); return }
        this.hazmat.closeValve(); this.valveSpin = 1.6
        this.addScore(60); this.audio.beep(520, 0.12, 'square', 0.06)
        this.hud.toast('Vana kapatılıyor… sızıntı durduruldu.', 'ok')
        window.setTimeout(() => this.completeHazmat(), 2400)
        return
      }
      case 'eyewash': this.hud.toast('Kimyasal temasında gözleri ve cildi en az 15 dakika bol suyla yıkayın.', '', 5200); return
      case 'quake_start': {
        this.quakeCountdown = 5; this.quake.reset(); this.hud.showQuake(true); this.hud.quakeUi('idle', { cok: false, kapan: false, tutun: false })
        speak('Deprem simülasyonu beş saniye içinde başlayacak. Sağlam masanın yanına geçin.')
        return
      }
      case 'drill_start': return this.startDrill()
      case 'plan': {
        if (!this.evac.planViewed) { this.evac.planViewed = true; this.addScore(SCORE.plan) }
        this.openModal(`<h2 class="modal-title">Tahliye Planı – 3. Kat</h2><div class="modal-sub">Kırmızı nokta konumunuzdur; yeşil rota merdiven kovasına gider.</div><div class="modal-body" id="planHost"></div>`,
          [{ label: 'Kapat', primary: true }], c => {
            const src = planTex().image as HTMLCanvasElement
            const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height
            cv.getContext('2d')!.drawImage(src, 0, 0); c.querySelector('#planHost')!.appendChild(cv)
          })
        return
      }
      case 'panel': {
        if (!this.building.drillActive || this.building.powerOff) return
        this.building.cutPower(); this.addScore(SCORE.panel); this.audio.spark()
        this.hud.toast('Ana elektrik kesildi. Acil aydınlatmalar ve yeşil tahliye okları devrede; korkuluğu izleyin.', 'ok', 5200)
        speak('Elektrik kesildi. Acil aydınlatmalar ve yeşil yönlendirme devrede. Merdiven korkuluğunu takip ederek tahliyeyi sürdürün.')
        return
      }
      case 'elevator': {
        if (this.evac.elevatorCd > 0) return
        this.evac.elevatorCd = 2.5
        if (this.building.drillActive) { this.addScore(SCORE.elevatorPenalty); this.drillMistakes++; this.hud.toast('Yangın/deprem anında asansör kullanılmaz! (−20 puan)', 'bad'); this.audio.beep(200, 0.25, 'sawtooth', 0.08) }
        else this.hud.toast('Asansörler tatbikat dışında çalışmaz durumda.', '')
        return
      }
      case 'exit_door': {
        this.building.openExit(); this.audio.thud(0.5)
        this.hud.toast('Acil çıkış açıldı. Toplanma alanına gidin.', 'ok'); return
      }
      case 'stair_door': {
        this.building.openStairDoor(Number(d.floor ?? 0)); this.audio.thud(0.34)
        this.hud.toast('Panik barına basın; yangın kapısı menteşesinden açılır. Basamaklarda korkuluğu izleyin.', 'ok', 4600)
        return
      }
    }
  }
  private valveSpin = 0

  private openTimelineEditor(): void {
    const panel = timelineEditorPanel(this.exhibit.timeline, entries => this.exhibit.refreshTimeline(entries))
    this.openModal(panel.html, panel.buttons, panel.onShow)
  }

  private openTimelineViewer(index: number): void {
    const point = this.exhibit.timeline.load()[index]
    if (!point) { this.hud.toast('Bu zaman panosu bulunamadı.', 'warn'); return }
    this.openModal('<h2 class="modal-title" id="timelineViewerTitle">Tarihsel zaman tüneli</h2><div class="modal-sub">Tarihsel zaman tüneli</div><div class="modal-body" id="timelineViewerContent"></div>',
      [{ label: 'Kapat', primary: true }, { label: 'Zaman tünelini düzenle', onClick: () => this.openTimelineEditor() }], card => {
        card.querySelector<HTMLElement>('#timelineViewerTitle')!.textContent = `${point.date} · ${point.title}`
        const content = card.querySelector<HTMLElement>('#timelineViewerContent')!
        const description = document.createElement('p'); description.textContent = point.description; content.append(description)
        if (!point.photo) return
        const image = document.createElement('img'); image.src = point.photo; image.alt = `${point.date} — ${point.title}`; image.className = 'timeline-viewer-image'
        content.append(image)
      })
  }

  private openFamilyPlan(): void {
    const panel = familyPlanPanel()
    this.openModal(panel.html, panel.buttons, panel.onShow)
  }

  private openExhibitManager(): void {
    this.openModal(
      `<h2 class="modal-title">Sergi Medya Arşivi</h2><div class="modal-sub">Fotoğraf veya MP4/WebM videosu ekleyin. Dosyalar yalnızca bu cihazdaki tarayıcıda saklanır.</div>
       <div class="modal-body"><label class="field">Fotoğraf / video seçin <input id="exhibitFile" type="file" accept="image/*,video/mp4,video/webm,video/ogg" multiple /></label>
       <div class="note">Tek dosya en fazla 100 MB. Videolar sergi ekranında sessiz ve döngüde oynar.</div><div id="exhibitStatus" role="status" aria-live="polite"></div><div id="exhibitList" class="media-list"></div></div>`,
      [{ label: 'Kapat', primary: true }],
      card => {
        const input = card.querySelector<HTMLInputElement>('#exhibitFile')!
        const list = card.querySelector<HTMLElement>('#exhibitList')!
        const status = card.querySelector<HTMLElement>('#exhibitStatus')!
        const refresh = async () => {
          const items = await this.exhibit.list()
          list.replaceChildren()
          if (!items.length) { const empty = document.createElement('p'); empty.className = 'note'; empty.textContent = 'Henüz medya eklenmedi.'; list.append(empty); return }
          for (const item of items) list.append(makeMediaRow(item))
        }
        input.addEventListener('change', async () => {
          const files = [...(input.files ?? [])]
          for (const file of files) {
            try { await this.exhibit.add(file); status.textContent = `${file.name} sergi arşivine eklendi.` }
            catch (error) { status.textContent = error instanceof Error ? error.message : 'Dosya eklenemedi.' }
          }
          input.value = ''
          await refresh()
        })
        list.addEventListener('click', async event => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-media-action]')
          if (!button) return
          const id = button.dataset.id!, action = button.dataset.mediaAction!
          try {
            if (action === 'display') { await this.exhibit.display(id); status.textContent = 'Medya sergi ekranında gösteriliyor.' }
            else { await this.exhibit.remove(id); status.textContent = 'Medya arşivden silindi.'; await refresh() }
          } catch (error) { status.textContent = error instanceof Error ? error.message : 'Medya açılamadı.' }
        })
        void refresh().catch(error => { status.textContent = error instanceof Error ? error.message : 'Arşiv açılamadı.' })
      },
    )
  }

  private pickBagItem(o: THREE.Object3D, id: string, ok: boolean, name: string, hint: string): void {
    if (this.bagTaken.has(id)) return
    this.bagTaken.set(id, ok ? 'ok' : 'bad')
    this.b.removeInteractive(o)
    const r = bagPick(ok)
    this.addScore(r.score)
    const from = new THREE.Vector3(); o.getWorldPosition(from)
    this.flights.push({ obj: o, from, to: (ok ? this.bag.bagPos : this.bag.binPos).clone(), t: 0, dur: 0.7, s0: o.scale.x, hide: true })
    if (ok) {
      this.bagOkCount++
      this.audio.beep(740, 0.07, 'sine', 0.07)
      this.hud.toast(`✓ ${name} – ${hint}`, 'ok', 4200)
    } else {
      this.audio.beep(220, 0.18, 'sawtooth', 0.07)
      this.drainOnce(-r.health, `✕ ${name} gereksiz! ${hint}`)
    }
    this.refreshBagUi()
    if (this.bagOkCount >= BAG_REQUIRED) window.setTimeout(() => this.completeBag(), 900)
  }

  private refreshBagUi(): void {
    const items = [...this.bagTaken.entries()].map(([id, st]) => ({ name: BAG_ITEMS.find(i => i.id === id)!.name, state: st }))
    this.hud.setBag(items, this.bagOkCount, BAG_REQUIRED)
  }

  private completeBag(): void {
    if (this.done.bag) return
    this.done.bag = true
    const wrong = [...this.bagTaken.values()].filter(v => v === 'bad').length
    const bonus = SCORE.firstClearBonus - wrong * 10
    this.addScore(Math.max(0, bonus))
    this.openModal(`<h2 class="modal-title">Afet Çantası Hazır</h2><div class="modal-sub">${this.bagOkCount} gerekli eşya · ${wrong} yanlış seçim</div>
      <div class="modal-body"><ul><li>Çanta hafif, su geçirmez ve kolay erişilebilir olmalı; kapı yanında saklayın.</li><li>Her 6 ayda bir gıda ve su tarihlerini, pilleri kontrol edin.</li><li>Ailenin her bireyi için ilaç ve belgelerin kopyasını ekleyin.</li></ul>
      <p>Tamamlama bonusu: <b>+${Math.max(0, bonus)}</b></p></div>`, [{ label: 'Devam', primary: true, onClick: () => this.checkAllDone() }])
  }

  private completeHazmat(): void {
    if (this.done.hazmat) return
    this.done.hazmat = true
    this.openModal(`<h2 class="modal-title">Tehlikeli Madde Eğitimi Tamamlandı</h2><div class="modal-sub">Maske takıldı, kaynak izole edildi.</div>
      <div class="modal-body"><ul><li>Gaz sızıntısında önce <b>kendi güvenliğiniz</b>: uygun KKD olmadan alana girmeyin.</li><li>Rüzgâr yönüne dik hareket edin; sızıntıyı mümkünse kaynağından izole edin.</li><li>Cilt/göz teması olursa acil duşta bol suyla yıkayın ve yetkililere haber verin.</li></ul><p>Bölüm bonusu: <b>+90</b> (maske +30, vana +60)</p></div>`,
      [{ label: 'Devam', primary: true, onClick: () => this.checkAllDone() }])
  }

  // ------------------------------------------------------------------ tahliye
  private startDrill(): void {
    if (this.building.drillActive) return
    this.evac = { planViewed: false, reachedMid: false, reachedGround: false, drillStart: this.elapsed, elevatorCd: 0, fireWarned: false }
    this.drillMistakes = 0
    this.building.startDrill()
    this.audio.setSiren(true)
    this.teleport({ x: SPAWN3.x, y: SPAWN3.y, z: SPAWN3.z, yaw: -Math.PI / 2 })
    this.hud.toast('ALARM! 3. kattasınız. Uzun koridorun sonundaki ayrı yangın merdivenine gidin; asansörü kullanmayın.', 'bad', 6500)
    speak('Alarm! Binayı tahliye ediyoruz. Asansörü kullanmayın. Koridorun sonundaki yangın merdiveni kapısını açın.')
  }

  private updateEvacFlow(): void {
    const b = this.building, p = this.player.pos
    if (!b.drillActive) return
    if (p.y > 3 && p.y < 4.2) this.evac.reachedMid = true
    if (this.evac.reachedMid && p.y < 0.5 && this.section === 'evac') this.evac.reachedGround = true
    if (b.exitOpen && b.inAssembly(p.x, p.z)) this.completeEvac()
  }

  private completeEvac(): void {
    if (this.done.evac) { this.cancelDrill(); return }
    this.done.evac = true
    const secs = this.elapsed - this.evac.drillStart
    const bonus = evacBonus(secs) + (this.building.powerOff ? 0 : -30)
    this.addScore(Math.max(0, bonus))
    this.audio.setSiren(false); this.hud.banner(null)
    this.openModal(`<h2 class="modal-title">Tahliye Tamamlandı</h2><div class="modal-sub">Toplanma alanına ulaştınız · Süre: ${formatTime(secs)}</div>
      <div class="modal-body"><ul><li>Elektrik şalteri: ${this.building.powerOff ? '<span class="tag">kapatıldı</span>' : '<span class="tag bad">kapatılmadı (−30)</span>'}</li>
      <li>Kat planı: ${this.evac.planViewed ? '<span class="tag">incelendi</span>' : '<span class="tag bad">incelenmedi</span>'}</li>
      <li>Asansör hataları: ${this.drillMistakes}</li></ul>
      <p>Tahliye bonusu: <b>+${Math.max(0, bonus)}</b>. Toplanma alanında yoklama alınana kadar bekleyin; binaya geri dönmeyin.</p></div>`,
      [{ label: 'Devam', primary: true, onClick: () => { this.building.resetDrill(); this.checkAllDone() } }])
  }

  private checkAllDone(): void {
    const d = this.done
    if (!(d.quake && d.bag && d.hazmat && d.evac) || this.shown.final) return
    this.shown.final = true
    const g = grade(this.score)
    window.setTimeout(() => this.openModal(`<div style="text-align:center"><div class="grade">${g.letter}</div><h2 class="modal-title">${g.label}</h2><div class="modal-sub">Tüm eğitim alanlarını tamamladınız.</div></div>
      <div class="stats-grid"><div><b>${Math.round(this.score)}</b><span>Toplam puan</span></div><div><b>${Math.round(this.health)}</b><span>Sağlık</span></div><div><b>${formatTime(this.elapsed)}</b><span>Süre</span></div></div>
      <div class="modal-body"><p>Afetlere hazırlıklı olmak; bilgi, plan ve doğru alışkanlıklarla başlar. Ailenizle bir tatbikat planı yapmayı unutmayın.</p></div>`,
      [{ label: 'Serbest dolaşmaya devam et', primary: true }, { label: 'Yeniden oyna', onClick: () => location.reload() }]), 600)
  }

  // ------------------------------------------------------------------ uçuşlar
  private updateFlights(dt: number): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]
      f.t += dt
      const k = Math.min(1, f.t / f.dur), e = k * k * (3 - 2 * k)
      const pos = f.from.clone().lerp(f.to, e); pos.y += Math.sin(e * Math.PI) * 0.35
      if (f.obj.parent) f.obj.parent.worldToLocal(pos)
      f.obj.position.copy(pos); f.obj.rotation.y += dt * 6
      f.obj.scale.setScalar(f.s0 * (1 - 0.5 * e))
      if (k >= 1) { if (f.hide) f.obj.visible = false; this.flights.splice(i, 1) }
    }
    if (this.valveSpin > 0) { this.valveSpin -= dt; this.hazmat.setValveSpin(dt) }
  }

  // ------------------------------------------------------------------ arayüz
  private objectives(): { title: string; list: Objective[] } {
    const q = this.quakeTried, d = this.done, b = this.building
    switch (this.section) {
      case 'quake': return { title: 'Deprem Tatbikatı', list: [
        { text: 'Konsoldan simülasyonu başlat', done: this.quakeStarted || d.quake },
        { text: 'ÇÖK: Çömel (C)', done: q.crouch },
        { text: 'KAPAN: Sağlam masanın altına gir', done: q.under },
        { text: 'TUTUN: S dalgası boyunca masaya tutun (T)', done: q.hold || d.quake },
        { text: 'Sarsıntı bitene kadar güvende kal', done: d.quake },
      ] }
      case 'bag': return { title: 'Afet Çantası', list: [
        { text: `Gerekli eşyaları seç (${this.bagOkCount}/${BAG_REQUIRED})`, done: d.bag },
        { text: 'Gereksiz eşyalardan kaçın (−puan, −sağlık)', done: d.bag && [...this.bagTaken.values()].every(v => v === 'ok') },
        { text: 'Çantayı tamamla', done: d.bag },
      ] }
      case 'hazmat': return { title: 'Tehlikeli Madde', list: [
        { text: 'Sızıntıyı fark et (gaz dedektörü)', done: true },
        { text: 'Gaz maskesini bul ve tak', done: this.maskOn || d.hazmat },
        { text: 'Ana sızıntı vanasını kapat', done: this.hazmat.valveClosed || d.hazmat },
      ] }
      case 'evac': case 'yard': case 'corridor': return { title: 'Bina Tahliyesi', list: [
        { text: 'Tatbikat terminalinden başlat (zemin kat)', done: b.drillActive || d.evac },
        { text: 'Kat planını incele (3. kat)', done: this.evac.planViewed || d.evac },
        { text: 'Merdiven kovasına git, asansör kullanma', done: this.evac.reachedMid || d.evac },
        { text: '2. katta ana elektrik şalterini kapat', done: b.powerOff || d.evac },
        { text: 'Zemin kata in', done: this.evac.reachedGround || d.evac },
        { text: 'Acil çıkıştan binayı terk et ve toplanma alanına git', done: d.evac },
      ] }
      default: return { title: 'Genel İlerleme', list: [
        { text: '1. Deprem tatbikatı odası', done: d.quake }, { text: '2. Afet çantası odası', done: d.bag },
        { text: '3. Tehlikeli madde odası', done: d.hazmat }, { text: '4–5. Üç katlı tahliye binası', done: d.evac },
      ] }
    }
  }

  private locationName(): string {
    const y = this.player.pos.y
    switch (this.section) {
      case 'quake': return 'Deprem Tatbikat Odası'
      case 'bag': return 'Afet Çantası Hazırlama Odası'
      case 'hazmat': return 'Tehlikeli Madde Odası'
      case 'evac': return `Tahliye Binası – ${y > FH * 2 - 0.3 ? '3. Kat' : y > FH - 0.3 ? '2. Kat' : 'Zemin Kat'}`
      case 'yard': return 'Bina Dışı – Toplanma Alanı'
      case 'corridor': return 'Bağlantı Koridoru'
      default: return 'Ana Sergi Salonu'
    }
  }

  private updateHud(dt: number): void {
    const o = this.objectives()
    this.hud.setLocation(this.locationName(), ACCENT[this.section])
    this.hud.setObjectives(o.title, o.list)
    const q = this.quake.running ? this.quake.intensity : 0
    const gas = this.section === 'hazmat' && !this.maskOn ? Math.min(1, this.hazmat.ppmAt(this.player.pos.x, this.player.pos.z) / 350) : 0
    const smoke = this.building.drillActive ? this.smokeAmt : 0
    const targetDanger = Math.max(q, gas, smoke, this.building.drillActive && !this.done.evac ? 0.25 : 0)
    this.danger += (targetDanger - this.danger) * Math.min(1, dt * 4 + 0.01)
    this.hud.setStats(this.health, this.score, this.elapsed, this.danger)
    if (this.building.drillActive && !this.quake.running) {
      this.hud.banner(this.building.exitOpen ? 'Toplanma alanına gidin (doğu avlusundaki yeşil daire)' : this.evac.reachedGround ? 'Zemin kat: acil aydınlatmalı oku doğu çıkışına kadar izleyin' : this.building.powerOff ? 'Acil ışıklar ve yeşil oklar açık – korkuluğu izleyerek zemine inin' : 'TAHLİYE! Koridorun sonundaki yangın merdiveni → 2. katta ana şalter', !this.building.powerOff)
    } else if (!this.quake.running && !this.building.drillActive) this.hud.banner(null)
    this.hud.updateOverlays(dt, { smoke: this.smokeAmt, gas: this.gasAmt * 0.8, mask: this.maskOn && this.section === 'hazmat', lowHealth: Math.max(0, (40 - this.health) / 40), fade: this.fade })
  }

  // ------------------------------------------------------------------ çizim
  private render(alpha: number, frameSec: number): void {
    const pl = this.player
    const pos = this.prev.clone().lerp(this.cur, alpha)
    const t = this.clock.running ? this.clock.elapsedTime : 0
    // FOV
    const targetFov = CONFIG.camera.fov + (pl.running ? 5 : 0) - (this.maskOn && this.section === 'hazmat' ? 6 : 0)
    this.fov += (targetFov - this.fov) * Math.min(1, frameSec * 6)
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix() }

    const bob = pl.grounded && pl.speed > 0.3 && !this.tp ? Math.sin(pl.bobPhase * 2) * 0.022 * Math.min(1, pl.speed / 3) : 0
    const eyeY = pos.y + pl.eye + bob
    const shake = this.quake.running ? this.quake.displacement * CONFIG.quake.shakeScale : 0
    const intensity = this.quake.running ? this.quake.intensity * CONFIG.quake.shakeScale : 0
    const yaw = pl.yaw, pitch = pl.pitch

    this.avatar.root.visible = this.tp
    this.avatar.update(frameSec, pos, yaw, pl.speed, pl.crouching, pl.holding, pl.running)

    if (!this.tp) {
      this.camera.position.set(pos.x + shake * 0.035, eyeY + Math.abs(shake) * 0.02, pos.z + shake * 0.02)
      this.camera.rotation.set(pitch + shake * 0.004, yaw, shake * 0.012 * (intensity > 0 ? 1 : 0))
    } else {
      const f = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
      const pivot = new THREE.Vector3(pos.x, pos.y + (pl.crouching ? 0.9 : 1.55), pos.z)
      const dist = CONFIG.camera.tpDistance
      let d = dist
      for (let s = 0.3; s <= dist; s += 0.15) {
        const c = pivot.clone().addScaledVector(f, -s)
        if (this.b.col.hits(c.x, c.y - 0.1, c.z, 0.12, 0.2) && c.y > 0.1) { d = Math.max(0.5, s - 0.2); break }
      }
      const c = pivot.clone().addScaledVector(f, -d)
      c.y = Math.max(0.15, c.y)
      this.camera.position.set(c.x + shake * 0.03, c.y, c.z)
      this.camera.rotation.set(pitch, yaw, shake * 0.01)
    }
    void t
    this.gfx.render(this.elapsed)
  }

  // ------------------------------------------------------------------ test/hata ayıklama
  debug() {
    return {
      game: this, teleport: (k: string) => this.goTo(k),
      setPos: (x: number, y: number, z: number, yaw = 0) => this.teleport({ x, y, z, yaw }),
      startDrill: () => this.startDrill(), step: (dt: number) => this.step(dt),
      state: () => ({ state: this.state, section: this.section, health: this.health, score: this.score, pos: this.player.pos.toArray(), done: this.done, reachedMid: this.evac.reachedMid, reachedGround: this.evac.reachedGround, evacuation: this.building.debugState() }),
    }
  }
}

function makeMediaRow(item: ExhibitRecord): HTMLElement {
  const row = document.createElement('div'); row.className = 'media-row'
  const details = document.createElement('div'); details.className = 'media-details'
  const name = document.createElement('strong'); name.textContent = item.name; name.title = item.name
  const type = document.createElement('span'); type.textContent = `${item.type.startsWith('video/') ? 'Video' : 'Fotoğraf'} · ${new Date(item.createdAt).toLocaleDateString('tr-TR')}`
  details.append(name, type)
  const actions = document.createElement('div'); actions.className = 'media-actions'
  for (const [action, label] of [['display', 'Ekrana yansıt'], ['remove', 'Sil']] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'media-action'; button.textContent = label
    button.dataset.mediaAction = action; button.dataset.id = item.id; actions.append(button)
  }
  row.append(details, actions); return row
}

function $show(id: string, v: boolean): void { document.getElementById(id)?.classList.toggle('hidden', !v) }
void QUAKE
