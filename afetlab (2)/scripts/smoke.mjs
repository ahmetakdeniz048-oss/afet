// End-to-end smoke test for Afet Eğitim Merkezi. Run after `pnpm build`.
// Sends real browser key events and advances the game in fixed simulation steps for deterministic CI.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const baseUrl = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => { throw new Error('smoke test timed out') }, 240_000)
const assert = (condition, message) => { if (!condition) throw new Error(message) }

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(baseUrl)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}

async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => response.status() >= 400 && errors.push(`HTTP ${response.status()} ${response.url()}`))
  await page.goto(`${baseUrl}?debug`)
  await page.waitForSelector('#screenStart:not(.hidden)', { timeout: 60_000 })
  await page.waitForFunction(() => typeof window.__game?.state === 'function')
  return page
}

const state = page => page.evaluate(() => ({ ...window.__game.state(), grounded: window.__game.game.player.grounded }))
const setPos = (page, x, y, z, yaw = 0) => page.evaluate(args => window.__game.setPos(...args), [x, y, z, yaw])
async function input(page, code, frames = 1, idleFrames = 12) {
  await page.keyboard.down(code)
  await page.evaluate(({ frames }) => {
    for (let i = 0; i < frames; i += 1) window.__game.step(1 / 60)
  }, { frames })
  await page.keyboard.up(code)
  await page.evaluate(({ idleFrames }) => {
    for (let i = 0; i < idleFrames; i += 1) window.__game.step(1 / 60)
  }, { idleFrames })
}
async function walk(page, code, frames) { await input(page, code, frames, 12) }
async function press(page, code, animationFrames = 8) { await input(page, code, 1, animationFrames) }

try {
  await waitForServer()
  const launchArgs = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
  browser = await chromium.launch({ args: launchArgs }).catch(() => chromium.launch({ executablePath: '/usr/bin/chromium', args: launchArgs }))
  const errors = []

  const desktop = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })
  const page = await openGame(desktop, errors)
  await page.screenshot({ path: `${out}/01-title.png` })
  await page.click('#btnStart')
  await page.waitForSelector('#hud:not(.hidden)')
  console.log('smoke: timeline editor')

  // Edit the timeline, verify local persistence and its JSON interchange from the real HUD control.
  const timelineButtonHit = await page.evaluate(() => { const button = document.querySelector('#btnTimelineEditor'), r = button.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button })
  assert(timelineButtonHit, 'timeline HUD button is not the topmost hit target')
  await page.locator('#btnTimelineEditor').evaluate(button => button.click())
  await page.waitForSelector('#timelineEntries .timeline-entry')
  assert(await page.locator('#timelineEntries .timeline-entry').count() === 6, 'timeline should start with six historical points')
  await page.click('#timelineAdd')
  let lastTimeline = page.locator('#timelineEntries .timeline-entry').last()
  await lastTimeline.locator('[data-field="date"]').fill('Smoke dönemi')
  await lastTimeline.locator('[data-field="title"]').fill('Smoke testi')
  await lastTimeline.locator('[data-field="description"]').fill('Kaydedilen kısa açıklama')
  await lastTimeline.locator('button[data-timeline-action="up"]').click()
  let timelineSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('afet.timeline.v1')).entries)
  assert(timelineSaved.length === 7 && timelineSaved[5].title === 'Smoke testi', 'timeline add/edit/reorder did not persist in localStorage')
  await page.locator('#timelineEntries .timeline-entry').nth(5).locator('button[data-timeline-action="remove"]').click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('afet.timeline.v1')).entries.length === 6)
  const [timelineDownload] = await Promise.all([page.waitForEvent('download'), page.click('#timelineExport')])
  assert(timelineDownload.suggestedFilename() === 'afetlab-zaman-tuneli.json', 'timeline JSON export did not download the expected file')
  await page.locator('#timelineImport').setInputFiles({ name: 'afetlab-smoke.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, entries: [{ id: 'imported', date: 'İçe aktarıldı', title: 'Aktarım testi', description: 'JSON doğrulaması' }] })) })
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('afet.timeline.v1')).entries[0].id === 'imported')
  const tinyPngDataUrl = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24; const context = canvas.getContext('2d'); context.fillStyle = '#0e7490'; context.fillRect(0, 0, 32, 24); return canvas.toDataURL('image/png') })
  const tinyPng = Buffer.from(tinyPngDataUrl.split(',')[1], 'base64')
  await page.locator('#timelineEntries input[type="file"]').setInputFiles({ name: 'afetlab-smoke.png', mimeType: 'image/png', buffer: tinyPng })
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('afet.timeline.v1')).entries[0].photo?.startsWith('data:image/jpeg;base64,'), null, { timeout: 10_000 })
  await page.locator('#modalCard .btns button').first().click()

  // Walk up to the actual family-plan tablet, ensure its named E prompt wins, and open it with E.
  console.log('smoke: family plan table')
  await setPos(page, 12.2, 0, 13, 0)
  await page.evaluate(() => { window.__game.game.player.pitch = -0.2; for (let i = 0; i < 8; i += 1) window.__game.step(1 / 60) })
  await page.waitForFunction(() => { const prompt = document.getElementById('prompt'); return prompt && !prompt.classList.contains('hidden') && prompt.textContent.includes('Afet Aile Planı masası') && prompt.textContent.includes('Afet Aile Planını aç') }, null, { timeout: 5_000 })
  await press(page, 'KeyE', 30)
  await page.waitForSelector('#familySummary')
  await page.locator('#localAddress').fill('Smoke Parkı, Ana Kapı')
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('afet.family-plan.v1')).localMeeting.address) === 'Smoke Parkı, Ana Kapı', 'family plan did not save edits locally')
  await page.click('#familyCopy')
  await page.waitForFunction(() => document.getElementById('familyStatus').textContent.includes('kopyalandı') || document.getElementById('familyStatus').textContent.includes('Kopyalama engellendi'))
  await page.evaluate(() => document.body.classList.add('print-family'))
  await page.emulateMedia({ media: 'print' })
  const printLayout = await page.evaluate(() => ({ summary: getComputedStyle(document.querySelector('#familySummarySection')).display, body: getComputedStyle(document.querySelector('#modalCard > .modal-body')).display, form: getComputedStyle(document.querySelector('.family-grid')).display }))
  assert(printLayout.summary !== 'none' && printLayout.body !== 'none' && printLayout.form === 'none', 'family-plan print view does not isolate the readable summary')
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => document.body.classList.remove('print-family'))
  page.once('dialog', dialog => dialog.accept())
  await page.click('#familyReset')
  assert(await page.locator('#localAddress').inputValue() === '' && await page.locator('#emergencyNumbers').inputValue() === '112 Acil Çağrı Merkezi', 'family reset did not restore the safe default template')
  await page.locator('#modalCard .btns button').first().click()

  // Walk through the entrance lane and start the drill from the actual reception terminal.
  console.log('smoke: evacuation course')
  await setPos(page, 24.5, 0, 0.8, -Math.PI / 2)
  await walk(page, 'KeyW', 22)
  let lobby = await state(page)
  assert(lobby.pos[0] > 25.0, `reception furniture obstructed the clear entry lane (x=${lobby.pos[0].toFixed(2)})`)
  await input(page, 'ArrowDown', 12, 12)
  await page.waitForFunction(() => {
    const prompt = document.getElementById('prompt')
    return !!prompt && !prompt.classList.contains('hidden') && prompt.textContent.includes('Tahliye tatbikatını başlat')
  }, null, { timeout: 10_000 })
  await page.screenshot({ path: `${out}/02-lobby-entry.png` })
  await press(page, 'KeyE', 30)
  await page.waitForFunction(() => window.__game.game.building.drillActive === true, null, { timeout: 5_000 })

  // The third-floor plan should face into the corridor and sit flush to its wall.
  await setPos(page, 47.6, 7.2, -1.0, 0)
  const planMount = await page.evaluate(() => ({ yaw: window.__game.game.building.planObj.rotation.y, z: window.__game.game.building.planObj.position.z }))
  assert(Math.abs(planMount.yaw) < 0.001 && Math.abs(planMount.z + 1.88) < 0.01, 'third-floor map panel is rotated away from the corridor or floating off its wall')
  await input(page, 'ArrowDown', 1, 12)
  await page.waitForFunction(() => {
    const prompt = document.getElementById('prompt')
    return !!prompt && !prompt.classList.contains('hidden') && prompt.textContent.includes('Tahliye planını incele')
  }, null, { timeout: 10_000 })
  await page.screenshot({ path: `${out}/03-floor-plan.png` })

  // Open the third-floor panic-bar door through E and confirm its hinged swing clears the doorway.
  await setPos(page, 52.5, 7.2, -1.05, 0)
  await press(page, 'KeyE', 70)
  const topDoor = (await state(page)).evacuation.stairDoors.find(door => door.floor === 2)
  assert(topDoor?.opened && topDoor.angle > 1.5 && !topDoor.colliderEnabled, 'third-floor panic-bar door did not open naturally from its hinge')

  // Walk down the first flight to the protected switchback landing. Continuing forward must meet the guardrail, not fall.
  await setPos(page, 54.35, 7.2, -5.15, 0)
  await walk(page, 'KeyW', 120)
  const landing = await state(page)
  assert(landing.pos[1] >= 5.25 && landing.pos[1] <= 5.55 && landing.grounded, `upper flight failed to settle on the protected landing (y=${landing.pos[1].toFixed(2)}, grounded=${landing.grounded})`)
  assert(landing.pos[2] >= -9.0 && landing.pos[2] <= -8.0, `backstop did not keep the player on the landing (z=${landing.pos[2].toFixed(2)})`)

  // Follow the left-turn landing, then descend the second flight to floor 2 without leaving the stair core.
  await walk(page, 'KeyA', 76)
  await walk(page, 'KeyS', 75)
  await walk(page, 'KeyS', 80)
  const secondFloor = await state(page)
  assert(secondFloor.reachedMid && secondFloor.pos[1] >= 3.3 && secondFloor.pos[1] <= 3.9 && secondFloor.grounded, `did not descend the switchback safely to floor 2 (y=${secondFloor.pos[1].toFixed(2)})`)

  // Cut the actual main switch. Backup lights, illuminated signs, and floor arrows must appear immediately.
  await setPos(page, 49.0, 3.6, 1.0, Math.PI)
  await press(page, 'KeyE')
  const emergency = await state(page)
  assert(emergency.evacuation.powerOff && emergency.evacuation.emergencyMode, 'main switch did not engage emergency mode')
  assert(emergency.evacuation.visibleSigns > 0 && emergency.evacuation.visibleArrows > 0 && emergency.evacuation.emergencyLampsOn > 0, 'emergency lights or exit wayfinding did not appear after power cut')
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${out}/04-emergency-mode.png` })

  // Capture the illuminated route from inside the clear corridor, not behind a wall or panel.
  await setPos(page, 46.0, 3.6, 0.55, -Math.PI / 2)
  await input(page, 'ArrowDown', 16, 12)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/05-emergency-wayfinding.png` })

  // Open the second-floor fire door with its panic bar and descend the second-to-ground-floor switchback.
  await setPos(page, 52.5, 3.6, -1.05, 0)
  await press(page, 'KeyE', 70)
  const floorTwoDoor = (await state(page)).evacuation.stairDoors.find(door => door.floor === 1)
  assert(floorTwoDoor?.opened && floorTwoDoor.angle > 1.5 && !floorTwoDoor.colliderEnabled, 'second-floor fire door did not clear its doorway')
  await setPos(page, 54.35, 3.6, -5.15, 0)
  await walk(page, 'KeyW', 120)
  const lowerLanding = await state(page)
  assert(lowerLanding.pos[1] >= 1.65 && lowerLanding.pos[1] <= 1.95 && lowerLanding.grounded, `lower flight failed to settle on its protected landing (y=${lowerLanding.pos[1].toFixed(2)})`)
  await walk(page, 'KeyA', 76)
  await walk(page, 'KeyS', 75)
  await walk(page, 'KeyS', 80)
  const ground = await state(page)
  assert(ground.reachedGround && ground.pos[1] >= -0.05 && ground.pos[1] <= 0.25 && ground.grounded, `second-floor-to-ground evacuation failed (y=${ground.pos[1].toFixed(2)})`)
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${out}/05-ground-floor.png` })
  assert(errors.length === 0, `desktop browser errors:\n  ${errors.join('\n  ')}`)
  await desktop.close()

  // Verify the bottom controls are visible in a touch-capable phone-sized browser.
  console.log('smoke: mobile controls and editor')
  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const phonePage = await openGame(phone, errors)
  await phonePage.tap('#btnStart')
  await phonePage.waitForSelector('#hud:not(.hidden)')
  await phonePage.waitForSelector('#touchControls.touch-enabled', { timeout: 5_000 })
  const mobileControls = await phonePage.evaluate(() => {
    const stick = document.querySelector('#touchStick').getBoundingClientRect()
    const actions = document.querySelector('.touch-actions').getBoundingClientRect()
    return { stickVisible: stick.width > 0 && stick.height > 0, actionsVisible: actions.width > 0 && actions.height > 0, stickBottom: innerHeight - stick.bottom, actionsBottom: innerHeight - actions.bottom }
  })
  assert(mobileControls.stickVisible && mobileControls.actionsVisible, 'bottom mobile joystick or action controls are not visible')
  assert(mobileControls.stickBottom < 32 && mobileControls.actionsBottom < 32, 'mobile controls are not anchored at the bottom of the screen')
  const mobileButtonHit = await phonePage.evaluate(() => { const button = document.querySelector('#btnTimelineEditor'), r = button.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button })
  assert(mobileButtonHit, 'mobile timeline button is not the topmost hit target')
  await phonePage.locator('#btnTimelineEditor').evaluate(button => button.click())
  await phonePage.waitForSelector('#timelineEntries .timeline-entry')
  const mobileModal = await phonePage.evaluate(() => {
    const card = document.querySelector('#modalCard'), add = document.querySelector('#timelineAdd')
    const r = card.getBoundingClientRect(), b = add.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight, scrollHeight: card.scrollHeight, clientHeight: card.clientHeight, addVisible: b.width > 0 && b.height > 0 && b.left >= r.left && b.right <= r.right }
  })
  assert(mobileModal.left >= 0 && mobileModal.right <= mobileModal.width && mobileModal.top >= 0 && mobileModal.bottom <= mobileModal.height, 'mobile editor modal overflows the viewport')
  assert(mobileModal.addVisible && mobileModal.clientHeight <= mobileModal.height && mobileModal.scrollHeight > mobileModal.clientHeight, 'mobile editor actions are not reachable inside the scrollable modal')
  await phonePage.screenshot({ path: `${out}/04-mobile-controls.png` })
  assert(errors.length === 0, `browser errors:\n  ${errors.join('\n  ')}`)
  await phone.close()

  await browser.close()
  clearTimeout(guard)
  server.kill('SIGTERM')
  console.log(`smoke: OK — gallery lane, timeline edit/reorder/import/export/photo persistence, family-table E prompt/save/print, safe evacuation, emergency wayfinding, mobile controls/modal; screenshots in ${out}/`)
} catch (error) {
  await browser?.close().catch(() => {})
  clearTimeout(guard)
  server.kill('SIGTERM')
  console.error(`smoke: FAIL — ${error?.message ?? String(error)}`)
  process.exit(1)
}
