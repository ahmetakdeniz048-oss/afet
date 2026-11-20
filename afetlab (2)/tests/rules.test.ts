import { describe, expect, it } from 'vitest'
import { BAG_ITEMS, BAG_REQUIRED, bagPick, evacBonus, formatTime, gasDamagePerSecond, grade, quakeBonus, quakeDamagePerSecond, smokeDamagePerSecond } from '../src/game/rules'

describe('afet çantası', () => {
  it('12 doğru ve 3 yanlış eşya içerir', () => {
    expect(BAG_REQUIRED).toBe(12)
    expect(BAG_ITEMS.filter(i => !i.ok)).toHaveLength(3)
    expect(new Set(BAG_ITEMS.map(i => i.id)).size).toBe(BAG_ITEMS.length)
  })
  it('doğru seçim puan verir, yanlış seçim puan ve sağlık düşürür', () => {
    expect(bagPick(true)).toEqual({ score: 15, health: 0 })
    expect(bagPick(false)).toEqual({ score: -10, health: -5 })
  })
})

describe('deprem', () => {
  it('yalnızca S dalgasında ve güvenli değilken hasar verir', () => {
    expect(quakeDamagePerSecond('P', false, false, false)).toBe(0)
    expect(quakeDamagePerSecond('S', true, true, true)).toBe(0)
    expect(quakeDamagePerSecond('S', false, false, false)).toBeGreaterThan(quakeDamagePerSecond('S', true, false, true))
  })
  it('güvende kalma süresi bonus verir', () => {
    expect(quakeBonus(6)).toBe(90)
    expect(quakeBonus(-3)).toBe(0)
  })
})

describe('tahliye ve tehlikeli madde', () => {
  it('süre bonusu zamanla azalır, sıfırın altına inmez', () => {
    expect(evacBonus(0)).toBe(150)
    expect(evacBonus(60)).toBe(120)
    expect(evacBonus(10_000)).toBe(0)
  })
  it('çömelmek duman hasarını azaltır, elektrik kesmek sıfırlar', () => {
    expect(smokeDamagePerSecond(true, true, false)).toBeLessThan(smokeDamagePerSecond(true, false, false))
    expect(smokeDamagePerSecond(true, false, true)).toBe(0)
    expect(smokeDamagePerSecond(false, false, false)).toBe(0)
  })
  it('gaz maskesi gaz hasarını engeller', () => {
    expect(gasDamagePerSecond(true, false)).toBe(8)
    expect(gasDamagePerSecond(true, true)).toBe(0)
    expect(gasDamagePerSecond(false, false)).toBe(0)
  })
})

describe('biçim', () => {
  it('süreyi mm:ss yazar', () => { expect(formatTime(125)).toBe('02:05') })
  it('not harfi verir', () => { expect(grade(600).letter).toBe('A'); expect(grade(10).letter).toBe('D') })
})
