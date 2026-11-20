/** Klavye + fare girdisi. İşaretçi kilidi yoksa sürükleyerek bakma yedeği vardır. */
export class Input {
  private down = new Set<string>()
  private virtualDown = new Set<string>()
  private pressed = new Set<string>()
  private dx = 0
  private dy = 0
  locked = false
  dragMode = false
  private dragging = false
  sensitivity = 1
  readonly touchMode = typeof window !== 'undefined' && ((window.matchMedia?.('(pointer: coarse)').matches ?? false) || navigator.maxTouchPoints > 0)
  onLockChange: (locked: boolean) => void = () => {}
  /** Oyun yazıyor mu (menü/modal açıkken girdiyi yok say). */
  enabled = true

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return
    if (e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    if (!this.down.has(e.code)) this.pressed.add(e.code)
    this.down.add(e.code)
  }
  private readonly onKeyUp = (e: KeyboardEvent): void => { this.down.delete(e.code) }
  private readonly onMove = (e: MouseEvent): void => {
    if (!this.enabled) return
    if (this.locked) { this.dx += e.movementX; this.dy += e.movementY }
    else if (this.dragMode && this.dragging) { this.dx += e.movementX; this.dy += e.movementY }
  }
  private readonly onDown = (e: MouseEvent): void => { if (e.button === 0 || e.button === 2) this.dragging = true }
  private readonly onUp = (): void => { this.dragging = false }
  private readonly onBlur = (): void => { this.down.clear(); this.virtualDown.clear(); this.pressed.clear(); this.dragging = false }
  private readonly onLock = (): void => {
    this.locked = document.pointerLockElement === this.el
    this.onLockChange(this.locked)
  }
  private readonly onLockErr = (): void => { this.dragMode = true }

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMove)
    el.addEventListener('mousedown', this.onDown)
    window.addEventListener('mouseup', this.onUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('pointerlockchange', this.onLock)
    document.addEventListener('pointerlockerror', this.onLockErr)
    el.addEventListener('contextmenu', e => e.preventDefault())
  }

  requestLock(): void {
    if (this.touchMode) return
    try {
      const p = (this.el as HTMLElement & { requestPointerLock: (o?: unknown) => Promise<void> | void }).requestPointerLock()
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => { this.dragMode = true })
    } catch { this.dragMode = true }
    // Kilit alınamazsa (ör. gömülü çerçeve) sürükleyerek bakma etkinleşir.
    window.setTimeout(() => { if (!this.locked) this.dragMode = true }, 400)
  }
  exitLock(): void { if (document.pointerLockElement) document.exitPointerLock() }

  held(code: string): boolean { return this.down.has(code) || this.virtualDown.has(code) }
  anyHeld(...codes: string[]): boolean { return codes.some(c => this.held(c)) }
  setVirtualHeld(code: string, held: boolean): void {
    if (held) {
      if (!this.enabled || this.virtualDown.has(code)) return
      this.virtualDown.add(code); this.pressed.add(code)
    } else this.virtualDown.delete(code)
  }
  addLookDelta(dx: number, dy: number): void { if (this.enabled) { this.dx += dx; this.dy += dy } }
  /** Bu karede ilk basılış. */
  consume(code: string): boolean { return this.pressed.delete(code) }
  look(): { dx: number; dy: number } {
    const r = { dx: this.dx * this.sensitivity, dy: this.dy * this.sensitivity }
    this.dx = 0; this.dy = 0
    return r
  }
  clearPressed(): void { this.pressed.clear() }
  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMove); window.removeEventListener('mouseup', this.onUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('pointerlockchange', this.onLock); document.removeEventListener('pointerlockerror', this.onLockErr)
  }
}
