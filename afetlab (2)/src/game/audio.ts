/**
 * Tamamen WebAudio ile üretilen sesler: ortam uğultusu, adımlar, deprem gürültüsü, cam kırılması,
 * siren, gaz tıslaması, maske nefesi, kıvılcım. Dosya gerekmez.
 */
export class AudioSys {
  ctx: AudioContext | null = null
  master!: GainNode
  private noiseBuf!: AudioBuffer
  muted = false
  volume = 0.8

  private ambient?: { gain: GainNode }
  private rumble?: { gain: GainNode; low: GainNode; filt: BiquadFilterNode; osc: OscillatorNode }
  private siren?: { gain: GainNode; osc: OscillatorNode; lfo: OscillatorNode }
  private gas?: { gain: GainNode }
  private breath?: { gain: GainNode; timer: number }

  init(): void {
    if (this.ctx) { void this.ctx.resume(); return }
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    } catch { return }
    const c = this.ctx
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volume
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6
    this.master.connect(comp); comp.connect(c.destination)
    const len = c.sampleRate * 2
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 4 }
    this.startAmbient()
  }

  setMuted(m: boolean): void { this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05) }
  setVolume(v: number): void { this.volume = v; if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05) }

  private noise(loop = true): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; return s
  }

  private startAmbient(): void {
    const c = this.ctx!
    const n = this.noise(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260
    const g = c.createGain(); g.gain.value = 0.07
    n.connect(lp); lp.connect(g); g.connect(this.master); n.start()
    // 50 Hz elektrik uğultusu
    const o = c.createOscillator(); o.frequency.value = 100; const og = c.createGain(); og.gain.value = 0.008
    o.connect(og); og.connect(this.master); o.start()
    this.ambient = { gain: g }
  }

  setAmbient(level: number): void { if (this.ctx && this.ambient) this.ambient.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4) }

  /** Kısa ton (arayüz tıklaması / bildirim). */
  beep(freq = 520, dur = 0.08, type: OscillatorType = 'sine', vol = 0.07): void {
    const c = this.ctx; if (!c) return
    const o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.value = freq
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur + 0.02)
  }
  chime(): void { this.beep(880, 0.35, 'sine', 0.08); setTimeout(() => this.beep(1175, 0.5, 'sine', 0.07), 160) }
  success(): void { [660, 880, 1100].forEach((f, i) => setTimeout(() => this.beep(f, 0.3, 'triangle', 0.08), i * 110)) }
  error(): void { this.beep(180, 0.22, 'sawtooth', 0.07) }
  pickup(): void { this.beep(700, 0.06, 'triangle', 0.06); setTimeout(() => this.beep(1000, 0.08, 'triangle', 0.05), 50) }

  /** Adım sesi: yüzeye göre filtre. */
  step(kind: 'tile' | 'metal' | 'ground', run = false): void {
    const c = this.ctx; if (!c) return
    const n = this.noise(false), f = c.createBiquadFilter(), g = c.createGain()
    f.type = 'bandpass'
    f.frequency.value = kind === 'metal' ? 2200 : kind === 'ground' ? 500 : 1100
    f.Q.value = kind === 'metal' ? 4 : 1.2
    const v = (run ? 0.16 : 0.1) * (0.8 + Math.random() * 0.4)
    g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1)
    n.connect(f); f.connect(g); g.connect(this.master); n.start(0, Math.random() * 1.5, 0.12)
  }

  thud(vol = 0.35): void {
    const c = this.ctx; if (!c) return
    const n = this.noise(false), f = c.createBiquadFilter(), g = c.createGain()
    f.type = 'lowpass'; f.frequency.value = 220
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5)
    n.connect(f); f.connect(g); g.connect(this.master); n.start(0, Math.random(), 0.55)
  }

  glassBreak(): void {
    const c = this.ctx; if (!c) return
    for (let i = 0; i < 9; i++) {
      setTimeout(() => {
        const n = this.noise(false), f = c.createBiquadFilter(), g = c.createGain()
        f.type = 'highpass'; f.frequency.value = 3000 + Math.random() * 3500
        g.gain.setValueAtTime(0.22 * (1 - i / 11), c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18)
        n.connect(f); f.connect(g); g.connect(this.master); n.start(0, Math.random() * 1.5, 0.2)
      }, i * 45)
    }
  }

  creak(): void {
    const c = this.ctx; if (!c) return
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(90 + Math.random() * 40, c.currentTime)
    o.frequency.exponentialRampToValueAtTime(50 + Math.random() * 30, c.currentTime + 0.8)
    f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 8
    g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.linearRampToValueAtTime(0.07, c.currentTime + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.9)
    o.connect(f); f.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + 1)
  }

  spark(): void {
    const c = this.ctx; if (!c) return
    for (let i = 0; i < 4; i++) setTimeout(() => {
      const n = this.noise(false), f = c.createBiquadFilter(), g = c.createGain()
      f.type = 'highpass'; f.frequency.value = 5000
      g.gain.setValueAtTime(0.12, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05)
      n.connect(f); f.connect(g); g.connect(this.master); n.start(0, Math.random() * 1.5, 0.06)
    }, i * 40)
  }

  cough(): void {
    const c = this.ctx; if (!c) return
    for (let i = 0; i < 2; i++) setTimeout(() => {
      const n = this.noise(false), f = c.createBiquadFilter(), g = c.createGain()
      f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.5
      g.gain.setValueAtTime(0.18, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18)
      n.connect(f); f.connect(g); g.connect(this.master); n.start(0, Math.random() * 1.5, 0.2)
    }, i * 220)
  }

  // ---- sürekli sesler ----
  /** Deprem uğultusu: 0..1 şiddet. */
  setRumble(level: number): void {
    const c = this.ctx; if (!c) return
    if (!this.rumble) {
      const n = this.noise(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160
      const g = c.createGain(); g.gain.value = 0
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 38
      const low = c.createGain(); low.gain.value = 0
      n.connect(f); f.connect(g); g.connect(this.master)
      o.connect(low); low.connect(this.master)
      n.start(); o.start()
      this.rumble = { gain: g, low, filt: f, osc: o }
    }
    const r = this.rumble
    r.gain.gain.setTargetAtTime(level * 0.9, c.currentTime, 0.05)
    r.low.gain.setTargetAtTime(level * 0.4, c.currentTime, 0.05)
    r.filt.frequency.setTargetAtTime(110 + level * 260, c.currentTime, 0.1)
    r.osc.frequency.setTargetAtTime(30 + level * 16, c.currentTime, 0.1)
  }

  setSiren(on: boolean): void {
    const c = this.ctx; if (!c) return
    if (on && !this.siren) {
      const o = c.createOscillator(); o.type = 'square'
      const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 0.9
      const lg = c.createGain(); lg.gain.value = 260
      o.frequency.value = 780
      lfo.connect(lg); lg.connect(o.frequency)
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600
      const g = c.createGain(); g.gain.value = 0
      o.connect(f); f.connect(g); g.connect(this.master)
      o.start(); lfo.start()
      g.gain.setTargetAtTime(0.035, c.currentTime, 0.2)
      this.siren = { gain: g, osc: o, lfo }
    } else if (!on && this.siren) {
      const s = this.siren; this.siren = undefined
      s.gain.gain.setTargetAtTime(0, c.currentTime, 0.1)
      setTimeout(() => { try { s.osc.stop(); s.lfo.stop() } catch { /* zaten durdu */ } }, 500)
    }
  }

  setGas(level: number): void {
    const c = this.ctx; if (!c) return
    if (!this.gas) {
      const n = this.noise(); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500
      const g = c.createGain(); g.gain.value = 0
      n.connect(f); f.connect(g); g.connect(this.master); n.start()
      this.gas = { gain: g }
    }
    this.gas.gain.gain.setTargetAtTime(level * 0.05, c.currentTime, 0.2)
  }

  /** Maske nefesi: açıkken periyodik soluk. */
  setBreathing(on: boolean): void {
    const c = this.ctx; if (!c) return
    if (on && !this.breath) {
      const n = this.noise(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8
      const g = c.createGain(); g.gain.value = 0
      n.connect(f); f.connect(g); g.connect(this.master); n.start()
      const b = { gain: g, timer: 0 }
      const cycle = () => {
        if (!this.breath) return
        const t = c.currentTime
        g.gain.cancelScheduledValues(t)
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.9); g.gain.linearRampToValueAtTime(0, t + 1.5)
        g.gain.linearRampToValueAtTime(0.045, t + 2.4); g.gain.linearRampToValueAtTime(0, t + 3.1)
        b.timer = window.setTimeout(cycle, 3200)
      }
      this.breath = b; cycle()
    } else if (!on && this.breath) {
      clearTimeout(this.breath.timer); this.breath.gain.gain.setTargetAtTime(0, c.currentTime, 0.1); this.breath = undefined
    }
  }
}

/** Türkçe sesli yönerge. */
export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'tr-TR'; u.rate = 1.03
    window.speechSynthesis.speak(u)
  } catch { /* konuşma desteklenmiyor */ }
}
