// Geliştirme sırasında görsel/işlevsel doğrulama: node scripts/play.mjs <senaryo>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = process.env.SHOTS_DIR ?? '/home/ubuntu/shots'
mkdirSync(out, { recursive: true })
const url = process.env.URL ?? 'http://localhost:3000/?debug'
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`) })
page.on('pageerror', e => errors.push('PAGEERR ' + String(e)))
await page.goto(url)
await page.waitForSelector('#screenStart:not(.hidden)', { timeout: 180_000 })
await page.screenshot({ path: `${out}/00-start.png` })
await page.click('#btnStart')
await page.waitForTimeout(1500)
const steps = JSON.parse(process.env.STEPS ?? '[]')
const g = () => page.evaluate(() => JSON.stringify(window.__game.state()))
console.log('state', await g())
for (const s of steps) {
  if (s.tp) await page.evaluate(([k]) => window.__game.teleport(k), [s.tp])
  if (s.pos) await page.evaluate(a => window.__game.setPos(...a), s.pos)
  if (s.keys) for (const k of s.keys) { await page.keyboard.down(k); await page.waitForTimeout(s.hold ?? 300); await page.keyboard.up(k) }
  if (s.press) for (const k of s.press) { await page.keyboard.press(k); await page.waitForTimeout(150) }
  if (s.eval) console.log('eval', await page.evaluate(s.eval))
  await page.waitForTimeout(s.wait ?? 1200)
  if (s.shot) await page.screenshot({ path: `${out}/${s.shot}.png` })
  if (s.log) console.log(s.shot ?? '', await g())
}
console.log('errors:', errors.slice(0, 20).join('\n') || 'none')
await browser.close()
