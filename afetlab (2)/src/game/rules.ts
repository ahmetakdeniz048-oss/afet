/**
 * Saf (sahneden bağımsız) puan / sağlık kuralları. Birim testleri `tests/rules.test.ts` içindedir.
 */

export type BagItem = { id: string; name: string; ok: boolean; hint: string }

export const BAG_ITEMS: readonly BagItem[] = [
  { id: 'water', name: 'İçme Suyu', ok: true, hint: 'Kişi başı günde en az 3 litre.' },
  { id: 'flashlight', name: 'El Feneri', ok: true, hint: 'Elektrik kesintisinde mum yerine fener kullanın.' },
  { id: 'firstaid', name: 'İlk Yardım Çantası', ok: true, hint: 'Sargı bezi, antiseptik ve kişisel ilaçlar içermeli.' },
  { id: 'can', name: 'Konserve Gıda', ok: true, hint: 'Uzun ömürlü, pişirme gerektirmeyen gıdalar seçin.' },
  { id: 'whistle', name: 'Düdük', ok: true, hint: 'Enkaz altında sesinizi duyurmanın en az yorucu yolu.' },
  { id: 'radio', name: 'Pilli / Şarjlı Radyo', ok: true, hint: 'Resmi duyuruları takip etmek için.' },
  { id: 'blanket', name: 'Battaniye', ok: true, hint: 'Isı yalıtımlı battaniye hipotermiyi önler.' },
  { id: 'knife', name: 'Çakı / Makas', ok: true, hint: 'Çok amaçlı kesici alet.' },
  { id: 'cash', name: 'Nakit Para', ok: true, hint: 'Elektrik kesilince kartlar ve ATM çalışmayabilir.' },
  { id: 'idcopy', name: 'Kimlik Kopyası', ok: true, hint: 'Su geçirmez poşette saklayın.' },
  { id: 'powerbank', name: 'Powerbank', ok: true, hint: 'Telefonun şarjı iletişim için kritiktir.' },
  { id: 'raincoat', name: 'Yağmurluk', ok: true, hint: 'Hafif ve katlanabilir; ıslanmayı önler.' },
  { id: 'perfume', name: 'Parfüm', ok: false, hint: 'Çantada yer kaplar ve önceliği yoktur.' },
  { id: 'vase', name: 'Porselen Vazo', ok: false, hint: 'Kırılgan ve ağırdır; afet çantasına girmez.' },
  { id: 'book', name: 'Ağır Kitap', ok: false, hint: 'Gereksiz ağırlık hareketi yavaşlatır.' },
]

export const BAG_REQUIRED = BAG_ITEMS.filter(i => i.ok).length

export const SCORE = {
  bagCorrect: 15,
  bagWrong: -10,
  bagWrongHealth: 5,
  firstClearBonus: 50,
  mask: 30,
  plan: 15,
  panel: 45,
  quakePerSafeSecond: 15,
  evacMax: 150,
  elevatorPenalty: -20,
} as const

export function bagPick(ok: boolean): { score: number; health: number } {
  return ok ? { score: SCORE.bagCorrect, health: 0 } : { score: SCORE.bagWrong, health: -SCORE.bagWrongHealth }
}

export function quakeBonus(safeSeconds: number): number {
  return Math.round(Math.max(0, safeSeconds) * SCORE.quakePerSafeSecond)
}

export function evacBonus(elapsedSeconds: number): number {
  return Math.max(0, SCORE.evacMax - Math.floor(Math.max(0, elapsedSeconds) / 2))
}

/** Deprem sırasındaki sağlık kaybı (saniyede). Güvenli pozisyonda sıfır. */
export function quakeDamagePerSecond(phase: 'P' | 'S' | 'idle', crouching: boolean, holding: boolean, underTable: boolean): number {
  if (phase !== 'S') return 0
  const safe = underTable && crouching && holding
  if (safe) return 0
  // Kısmen doğru davranış kaybı azaltır (Çök, Kapan, Tutun adımlarından her biri)
  const done = (underTable ? 1 : 0) + (crouching ? 1 : 0) + (holding ? 1 : 0)
  return 5 - done * 1.2
}

export function smokeDamagePerSecond(inSmokeLayer: boolean, crouching: boolean, powerOff: boolean, hasMask = false): number {
  if (!inSmokeLayer || powerOff) return 0
  const base = hasMask ? 1 : 5
  return crouching ? base * 0.3 : base
}

export function gasDamagePerSecond(inZone: boolean, hasMask: boolean): number {
  return inZone && !hasMask ? 8 : 0
}

export function grade(score: number): { letter: string; label: string } {
  if (score >= 520) return { letter: 'A', label: 'Mükemmel hazırlıklı' }
  if (score >= 400) return { letter: 'B', label: 'İyi hazırlıklı' }
  if (score >= 250) return { letter: 'C', label: 'Geliştirilmeli' }
  return { letter: 'D', label: 'Eğitimi tekrarlayın' }
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
