import { formatTime } from './rules'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} bulunamadı`)
  return el as T
}

export type Objective = { text: string; done: boolean }
export type ModalButton = { label: string; primary?: boolean; onClick?: () => void }

export class Hud {
  private el = {
    hud: $('hud'), loc: $('locName'), objTitle: $('objTitle'), objList: $('objList'),
    hpBar: $('hpBar'), hpVal: $('hpVal'), dangerBar: $('dangerBar'), dangerVal: $('dangerVal'), score: $('scoreVal'), time: $('timeVal'),
    banner: $('banner'), cross: $('crosshair'), prompt: $('prompt'), toasts: $('toasts'), countdown: $('countdown'),
    ovDamage: $('ovDamage'), ovSmoke: $('ovSmoke'), ovGas: $('ovGas'), ovMask: $('ovMask'), ovFade: $('ovFade'),
    quakePanel: $('quakePanel'), phaseTag: $('phaseTag'), seismo: $<HTMLCanvasElement>('seismo'),
    chipCok: $('chipCok'), chipKapan: $('chipKapan'), chipTutun: $('chipTutun'),
    bagPanel: $('bagPanel'), bagCount: $('bagCount'), bagList: $('bagList'),
    gasPanel: $('gasPanel'), gasVal: $('gasVal'), gasState: $('gasState'),
    modal: $('modal'), modalCard: $('modalCard'),
  }
  private seismoData: number[] = new Array(150).fill(0)
  private dmgTimer = 0
  private lastObj = ''
  private lastPrompt = ''
  private lastLoc = ''

  show(v: boolean): void { this.el.hud.classList.toggle('hidden', !v) }

  setLocation(name: string, accent: string): void {
    if (name === this.lastLoc) return
    this.lastLoc = name; this.el.loc.textContent = name
    document.documentElement.style.setProperty('--accent', accent)
  }
  setObjectives(title: string, list: Objective[]): void {
    const key = title + JSON.stringify(list)
    if (key === this.lastObj) return
    this.lastObj = key
    this.el.objTitle.textContent = title
    const cur = list.findIndex(o => !o.done)
    this.el.objList.innerHTML = list.map((o, i) => `<li class="${o.done ? 'done' : i === cur ? 'cur' : ''}">${o.text}</li>`).join('')
  }
  setStats(health: number, score: number, seconds: number, danger: number): void {
    const hp = Math.max(0, Math.round(health))
    this.el.hpBar.style.width = `${hp}%`
    this.el.hpBar.style.background = hp > 55 ? '' : hp > 28 ? 'linear-gradient(90deg,#f59e0b,#fde68a)' : 'linear-gradient(90deg,#dc2626,#f87171)'
    this.el.hpVal.textContent = String(hp)
    const d = Math.round(Math.max(0, Math.min(1, danger)) * 100)
    this.el.dangerBar.style.width = `${d}%`; this.el.dangerVal.textContent = String(d)
    this.el.score.textContent = String(Math.round(score)); this.el.time.textContent = formatTime(seconds)
  }
  setPrompt(text: string | null, sub?: string, target?: string): void {
    const key = `${target ?? ''}|${text ?? ''}|${sub ?? ''}`
    if (key === this.lastPrompt) return
    this.lastPrompt = key
    if (!text) { this.el.prompt.classList.add('hidden'); this.el.cross.classList.remove('on'); return }
    this.el.prompt.replaceChildren()
    if (target) { const label = document.createElement('span'); label.className = 'prompt-target'; label.textContent = target; this.el.prompt.append(label) }
    const action = document.createElement('div'), keyHint = document.createElement('kbd')
    keyHint.textContent = 'E'; action.append(keyHint, document.createTextNode(` ${text}`)); this.el.prompt.append(action)
    if (sub) { const detail = document.createElement('small'); detail.textContent = sub; this.el.prompt.append(detail) }
    this.el.prompt.classList.remove('hidden'); this.el.cross.classList.add('on')
  }
  banner(text: string | null, alert = false): void {
    if (!text) { this.el.banner.classList.add('hidden'); return }
    if (this.el.banner.textContent !== text) this.el.banner.textContent = text
    this.el.banner.classList.toggle('alert', alert); this.el.banner.classList.remove('hidden')
  }
  toast(msg: string, kind: 'ok' | 'warn' | 'bad' | '' = '', ms = 3600): void {
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg
    this.el.toasts.appendChild(t)
    while (this.el.toasts.children.length > 4) this.el.toasts.firstElementChild?.remove()
    window.setTimeout(() => { t.classList.add('out'); window.setTimeout(() => t.remove(), 450) }, ms)
  }
  countdown(text: string | null, sub?: string): void {
    if (!text) { this.el.countdown.classList.add('hidden'); return }
    this.el.countdown.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`; this.el.countdown.classList.remove('hidden')
  }

  // ---- ekran kaplamaları
  flashDamage(): void { this.dmgTimer = 0.6; this.el.ovDamage.style.opacity = '1' }
  updateOverlays(dt: number, o: { smoke: number; gas: number; mask: boolean; lowHealth: number; fade: number }): void {
    if (this.dmgTimer > 0) { this.dmgTimer -= dt; this.el.ovDamage.style.opacity = String(Math.max(o.lowHealth * 0.45, Math.min(1, this.dmgTimer / 0.6))) }
    else this.el.ovDamage.style.opacity = String(o.lowHealth * 0.45)
    this.el.ovSmoke.style.opacity = String(Math.min(1, o.smoke))
    this.el.ovGas.style.opacity = String(Math.min(1, o.gas))
    this.el.ovMask.style.opacity = o.mask ? '1' : '0'
    this.el.ovFade.style.opacity = String(o.fade)
  }

  // ---- deprem paneli
  showQuake(v: boolean): void { this.el.quakePanel.classList.toggle('hidden', !v) }
  quakeUi(phase: string, chips: { cok: boolean; kapan: boolean; tutun: boolean }): void {
    this.el.phaseTag.textContent = phase === 'P' ? 'P DALGASI' : phase === 'S' ? 'S DALGASI' : phase === 'decay' ? 'SÖNÜMLENİYOR' : 'BEKLEMEDE'
    this.el.phaseTag.style.background = phase === 'S' ? '#b91c1c' : phase === 'P' ? '#a16207' : ''
    this.el.chipCok.classList.toggle('ok', chips.cok); this.el.chipKapan.classList.toggle('ok', chips.kapan); this.el.chipTutun.classList.toggle('ok', chips.tutun)
  }
  pushSeismo(v: number, phase: string): void {
    this.seismoData.push(v); this.seismoData.shift()
    const c = this.el.seismo, g = c.getContext('2d')!
    g.fillStyle = '#04100a'; g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = 'rgba(74,222,128,0.14)'; g.lineWidth = 1
    for (let y = 15; y < c.height; y += 15) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke() }
    g.strokeStyle = phase === 'S' ? '#f87171' : phase === 'P' ? '#fbbf24' : '#4ade80'; g.lineWidth = 2; g.beginPath()
    this.seismoData.forEach((d, i) => { const x = (i / (this.seismoData.length - 1)) * c.width, y = c.height / 2 + d * 38; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y) })
    g.stroke()
  }

  // ---- afet çantası
  showBag(v: boolean): void { this.el.bagPanel.classList.toggle('hidden', !v) }
  setBag(items: { name: string; state: '' | 'ok' | 'bad' }[], okCount: number, total: number): void {
    this.el.bagCount.textContent = `${okCount} / ${total}`
    this.el.bagList.innerHTML = items.map(i => `<li class="${i.state}"><span>${i.name}</span><span>${i.state === 'ok' ? '✓' : i.state === 'bad' ? '✕' : '○'}</span></li>`).join('')
  }

  // ---- gaz
  showGas(v: boolean): void { this.el.gasPanel.classList.toggle('hidden', !v) }
  setGas(ppm: number, masked: boolean): void {
    this.el.gasVal.innerHTML = `${ppm} <small>ppm</small>`
    const lvl = ppm > 150 ? 'danger' : ppm > 40 ? 'warn' : ''
    this.el.gasPanel.className = `panel ${lvl}`
    this.el.gasState.textContent = masked && ppm > 40 ? 'Maske takılı – korunuyorsunuz' : ppm > 150 ? 'TEHLİKE – Maske takın!' : ppm > 40 ? 'Dikkat' : 'Güvenli'
  }

  // ---- modal
  modal(html: string, buttons: ModalButton[], onShow?: (card: HTMLElement) => void): void {
    this.el.modalCard.innerHTML = html + `<div class="btns">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div>`
    this.el.modalCard.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach(btn => {
      btn.addEventListener('click', () => { const b = buttons[Number(btn.dataset.i)]; this.closeModal(); b.onClick?.() })
    })
    this.el.modal.classList.remove('hidden')
    onShow?.(this.el.modalCard)
  }
  closeModal(): void { this.el.modal.classList.add('hidden'); this.el.modalCard.innerHTML = '' }
  get modalOpen(): boolean { return !this.el.modal.classList.contains('hidden') }
}
