import './style.css'
import { Game } from './game/game'

const canvas = document.getElementById('game') as HTMLCanvasElement
const fill = document.getElementById('loadFill')!
const text = document.getElementById('loadText')!

async function main(): Promise<void> {
  const game = new Game(canvas)
  if (location.search.includes('debug')) (window as unknown as { __game: unknown }).__game = game.debug()
  if (import.meta.env.DEV) {
    try {
      const [{ registerGameTuning }, { tuning }] = await Promise.all([import('../scripts/manus-tuning/adapter.js'), import('./game/tuning')])
      await registerGameTuning(tuning)
    } catch (e) { console.warn('Tweak kaydı yapılamadı', e) }
  }
  await game.boot((f, label) => { fill.style.width = `${Math.round(f * 100)}%`; text.textContent = label })
  document.getElementById('screenLoading')!.classList.add('hidden')
  document.getElementById('screenStart')!.classList.remove('hidden')
}

main().catch(err => {
  console.error(err)
  text.textContent = 'Yükleme hatası: ' + (err instanceof Error ? err.message : String(err))
})
