import { beforeEach, describe, expect, it } from 'vitest'
import { familyPlanSummary, loadFamilyPlan, normalizeFamilyPlan, resetFamilyPlan, saveFamilyPlan } from '../src/game/family-plan'
import { normalizeTimeline, starterTimeline, TimelineStore } from '../src/game/timeline'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
  },
})

beforeEach(() => storage.clear())

describe('tarihsel zaman tüneli verisi', () => {
  it('altı kronolojik başlangıç panosunu üretir ve saklanan düzenlemeyi yenilemede korur', () => {
    const store = new TimelineStore()
    const entries = store.load()
    expect(entries).toHaveLength(6)
    expect(entries[0].date).toBe('1939')
    entries[0].title = 'Güncellenen başlık'
    store.save(entries)
    expect(new TimelineStore().load()[0].title).toBe('Güncellenen başlık')
  })

  it('sıra, fotoğraf ve metin alanlarını JSON olarak dışa/içe aktarır', () => {
    const store = new TimelineStore()
    const entries = starterTimeline().reverse()
    entries[0] = { ...entries[0], date: 'Özel dönem', title: 'Başlık', description: 'Kısa açıklama', photo: 'data:image/jpeg;base64,AA==' }
    expect(store.import(store.export(entries))).toEqual(entries)
  })

  it('boş, aşırı uzun veya hatalı fotoğraflı pano listelerini reddeder', () => {
    expect(() => normalizeTimeline([])).toThrow()
    expect(() => normalizeTimeline(Array.from({ length: 9 }, (_, i) => ({ id: String(i), date: '', title: '', description: '' })))).toThrow()
    expect(() => normalizeTimeline([{ id: 'x', date: '', title: '', description: '', photo: 'https://example.com/x.jpg' }])).toThrow()
  })
})

describe('afet aile planı verisi', () => {
  it('kayıt, yenileme, sınırlandırma ve sıfırlamayı uygular', () => {
    const plan = loadFamilyPlan()
    plan.localMeeting.address = 'Cumhuriyet Parkı'
    plan.contacts[0].phone = '0500 000 00 00'
    saveFamilyPlan(plan)
    expect(loadFamilyPlan().localMeeting.address).toBe('Cumhuriyet Parkı')
    expect(normalizeFamilyPlan({ ...plan, assignments: Array.from({ length: 25 }, () => ({ person: 'A', task: 'B' })) }).assignments).toHaveLength(20)
    expect(resetFamilyPlan().localMeeting.address).toBe('')
    expect(loadFamilyPlan().contacts[0].phone).toBe('')
  })

  it('tek ekranda buluşma yerlerini, görevleri, iletişimi ve 112 özetler', () => {
    const plan = loadFamilyPlan()
    plan.localMeeting.address = 'Mahalle parkı'
    plan.assignments[0] = { id: 'task', person: 'Ayşe', task: 'Acil çantayı al' }
    const summary = familyPlanSummary(plan)
    expect(summary).toContain('Mahalle parkı')
    expect(summary).toContain('Ayşe: Acil çantayı al')
    expect(summary).toContain('112 Acil Çağrı Merkezi')
  })
})
