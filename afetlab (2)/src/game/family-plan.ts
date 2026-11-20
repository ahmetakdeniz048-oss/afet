export type MeetingPoint = { address: string; note: string }
export type FamilyAssignment = { id: string; person: string; task: string }
export type FamilyContact = { id: string; person: string; phone: string }
export type FamilyPlan = {
  localMeeting: MeetingPoint
  regionalMeeting: MeetingPoint
  assignments: FamilyAssignment[]
  contacts: FamilyContact[]
  outOfAreaContact: { name: string; phone: string }
  emergencyNumbers: string
}

const STORAGE_KEY = 'afet.family-plan.v1'
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `member-${Math.random().toString(36).slice(2, 11)}`

export function defaultFamilyPlan(): FamilyPlan {
  return {
    localMeeting: { address: '', note: '' },
    regionalMeeting: { address: '', note: '' },
    assignments: [{ id: makeId(), person: '', task: 'Afet çantasını almak' }],
    contacts: [{ id: makeId(), person: '', phone: '' }],
    outOfAreaContact: { name: '', phone: '' },
    emergencyNumbers: '112 Acil Çağrı Merkezi',
  }
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanMeeting(value: unknown): MeetingPoint {
  const o = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { address: boundedText(o.address, 300), note: boundedText(o.note, 500) }
}

export function normalizeFamilyPlan(value: unknown): FamilyPlan {
  const o = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const assignments = Array.isArray(o.assignments) ? o.assignments.slice(0, 20).map((raw, i) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    return { id: boundedText(item.id, 60) || `task-${i}`, person: boundedText(item.person, 80), task: boundedText(item.task, 240) }
  }) : []
  const contacts = Array.isArray(o.contacts) ? o.contacts.slice(0, 15).map((raw, i) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    return { id: boundedText(item.id, 60) || `contact-${i}`, person: boundedText(item.person, 80), phone: boundedText(item.phone, 50) }
  }) : []
  const external = o.outOfAreaContact && typeof o.outOfAreaContact === 'object' ? o.outOfAreaContact as Record<string, unknown> : {}
  return {
    localMeeting: cleanMeeting(o.localMeeting),
    regionalMeeting: cleanMeeting(o.regionalMeeting),
    assignments,
    contacts,
    outOfAreaContact: { name: boundedText(external.name, 80), phone: boundedText(external.phone, 50) },
    emergencyNumbers: boundedText(o.emergencyNumbers, 200),
  }
}

export function loadFamilyPlan(): FamilyPlan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeFamilyPlan(JSON.parse(raw)) : defaultFamilyPlan()
  } catch { return defaultFamilyPlan() }
}

export function saveFamilyPlan(value: FamilyPlan): void {
  const normalized = normalizeFamilyPlan(value)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)) }
  catch { throw new Error('Aile planı bu cihazın yerel depolama alanına kaydedilemedi. Depolama alanında yer açıp yeniden deneyin.') }
}

export function resetFamilyPlan(): FamilyPlan {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* no storage: return a fresh editable plan */ }
  return defaultFamilyPlan()
}

export function familyPlanSummary(plan: FamilyPlan): string {
  const p = normalizeFamilyPlan(plan)
  const meeting = (title: string, item: MeetingPoint) => `${title}: ${item.address || 'Belirlenmedi'}${item.note ? ` — ${item.note}` : ''}`
  const assignments = p.assignments.filter(x => x.person || x.task).map(x => `• ${x.person || 'Aile üyesi'}: ${x.task || 'Görev belirtilmedi'}`)
  const contacts = p.contacts.filter(x => x.person || x.phone).map(x => `• ${x.person || 'Aile üyesi'}${x.phone ? ` — ${x.phone}` : ''}`)
  return [
    'AFET AİLE PLANI',
    meeting('Mahalle içi buluşma noktası', p.localMeeting),
    meeting('İlçe/şehir dışı buluşma noktası', p.regionalMeeting),
    '', 'GÖREV VE SORUMLULUKLAR', ...(assignments.length ? assignments : ['• Henüz görev eklenmedi']),
    '', 'AİLE İLETİŞİMİ', ...(contacts.length ? contacts : ['• Henüz kişi eklenmedi']),
    `Şehir dışı irtibat: ${p.outOfAreaContact.name || 'Belirlenmedi'}${p.outOfAreaContact.phone ? ` — ${p.outOfAreaContact.phone}` : ''}`,
    `Acil numaralar: ${p.emergencyNumbers || 'Belirtilmedi'}`,
  ].join('\n')
}
