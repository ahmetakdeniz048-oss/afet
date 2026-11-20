import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'jump' | 'run'
type Control = {
  id: string; type: 'number'; category: string; label: string; description: string; unit: string
  default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY'
}
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const bindings: Binding[] = []

function number<S extends keyof typeof CONFIG>(
  section: S, key: keyof typeof CONFIG[S] & string, label: string, category: string,
  min: number, max: number, step: number, unit: string, integrity: 'COSMETIC' | 'GAMEPLAY', boundary?: Boundary,
): void {
  const values = CONFIG[section] as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as Record<string, number>
  bindings.push({
    control: Object.freeze({
      id: `${section}.${key}`, type: 'number', category, label,
      description: boundary === 'jump' ? 'Bir sonraki zıplamada geçerli olur.' : 'Bu önizlemede hemen geçerli olur.',
      unit, default: defaults[key], min, max, step,
      applyMode: boundary === 'jump' ? 'NEXT_ACTION' : boundary === 'run' ? 'NEXT_RUN' : 'LIVE', integrity,
    }),
    boundary, read: () => values[key], write: v => { values[key] = v },
  })
}

number('player', 'walkSpeed', 'Yürüme hızı', 'Hareket', 1, 8, 0.5, 'm/s', 'GAMEPLAY')
number('player', 'runSpeed', 'Koşma hızı', 'Hareket', 2, 10, 0.5, 'm/s', 'GAMEPLAY')
number('player', 'crouchSpeed', 'Çömelerek yürüme hızı', 'Hareket', 0.5, 4, 0.5, 'm/s', 'GAMEPLAY')
number('player', 'jumpSpeed', 'Zıplama gücü', 'Hareket', 2, 9, 0.5, 'm/s', 'GAMEPLAY', 'jump')
number('camera', 'fov', 'Görüş açısı', 'Kamera', 50, 100, 1, '°', 'COSMETIC')
number('camera', 'tpDistance', 'Üçüncü şahıs mesafesi', 'Kamera', 1.5, 6, 0.5, 'm', 'COSMETIC')
number('quake', 'shakeScale', 'Deprem kamera sarsıntısı', 'Deprem', 0, 2, 0.25, 'x', 'COSMETIC')
number('hazard', 'gasDamageScale', 'Gaz hasarı çarpanı', 'Tehlike', 0, 3, 0.25, 'x', 'GAMEPLAY')
number('hazard', 'smokeDamageScale', 'Duman hasarı çarpanı', 'Tehlike', 0, 3, 0.25, 'x', 'GAMEPLAY')

const byId = new Map(bindings.map(b => [b.control.id, b]))
let requested: Record<string, number> = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
const valid = (v: Record<string, number>) => v['player.walkSpeed'] <= v['player.runSpeed']
let unranked = false
const gameplayModified = () => bindings.some(b => b.control.integrity === 'GAMEPLAY' && b.read() !== b.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(b => b.control)),
  read() {
    return { requested: { ...requested }, active: Object.fromEntries(bindings.map(b => [b.control.id, b.read()])) }
  },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (value !== control.default && Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    const candidate = { ...requested, ...(patch as Record<string, number>) }
    const nextActive = this.read().active as Record<string, number>
    for (const [id, value] of entries) if (byId.get(id)!.control.applyMode === 'LIVE') nextActive[id] = value as number
    if (!valid(candidate) || !valid(nextActive)) throw new Error('Walking speed must not exceed running speed')
    requested = candidate
    for (const [id, value] of entries) {
      const b = byId.get(id)!
      if (b.control.applyMode === 'LIVE') b.write(value as number)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const b of bindings) if (b.boundary === boundary) b.write(requested[b.control.id])
    unranked = boundary === 'run' ? gameplayModified() : unranked || gameplayModified()
  },
}
