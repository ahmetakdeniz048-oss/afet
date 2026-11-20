import type { ModalButton } from './hud'
import { familyPlanSummary, loadFamilyPlan, resetFamilyPlan, saveFamilyPlan, type FamilyPlan } from './family-plan'
import { compressTimelinePhoto, TIMELINE_LIMIT, type TimelinePoint, TimelineStore } from './timeline'

export type PanelSpec = { html: string; buttons: ModalButton[]; onShow?: (card: HTMLElement) => void }

export function timelineEditorPanel(store: TimelineStore, refresh: (items: TimelinePoint[]) => void): PanelSpec {
  const items = store.load()
  let saveTimer = 0
  let saveNow = () => {}
  return {
    html: `<h2 class="modal-title">Tarihsel Zaman Tüneli</h2>
      <div class="modal-sub">Kronolojik pano metinlerini ve fotoğrafları düzenleyin. Değişiklikler bu tarayıcıda saklanır; JSON dosyası başka cihaza aktarılabilir.</div>
      <div class="modal-body">
        <div class="modal-tools"><button id="timelineAdd" class="media-action" type="button">+ Yeni zaman noktası</button><button id="timelineExport" class="media-action" type="button">JSON dışa aktar</button><label class="media-action">JSON içe aktar<input id="timelineImport" type="file" accept="application/json,.json" hidden></label></div>
        <div id="timelineStatus" role="status" aria-live="polite">En çok ${TIMELINE_LIMIT} pano desteklenir.</div>
        <div id="timelineEntries" class="timeline-list"></div>
      </div>`,
    buttons: [{ label: 'Kaydet ve kapat', primary: true, onClick: () => { window.clearTimeout(saveTimer); saveNow() } }],
    onShow: card => {
      const list = card.querySelector<HTMLElement>('#timelineEntries')!
      const status = card.querySelector<HTMLElement>('#timelineStatus')!
      const persist = () => {
        try { store.save(items); refresh(items); status.textContent = 'Değişiklikler bu cihazda kaydedildi.' }
        catch (error) { status.textContent = error instanceof Error ? error.message : 'Yerel kayıt yapılamadı.' }
      }
      saveNow = persist
      const schedulePersist = () => {
        status.textContent = 'Kaydediliyor…'
        window.clearTimeout(saveTimer)
        saveTimer = window.setTimeout(persist, 350)
        refresh(items)
      }
      const render = () => {
        list.replaceChildren()
        items.forEach((point, index) => list.append(makeTimelineEntry(point, index, items.length, schedulePersist, async file => {
          status.textContent = 'Fotoğraf küçültülüp sıkıştırılıyor…'
          try { point.photo = await compressTimelinePhoto(file); persist(); render() }
          catch (error) { status.textContent = error instanceof Error ? error.message : 'Fotoğraf eklenemedi.' }
        })))
        const add = card.querySelector<HTMLButtonElement>('#timelineAdd')!
        add.disabled = items.length >= TIMELINE_LIMIT
        status.dataset.count = `${items.length}/${TIMELINE_LIMIT}`
      }
      render()
      card.querySelector<HTMLButtonElement>('#timelineAdd')!.addEventListener('click', () => {
        if (items.length >= TIMELINE_LIMIT) return
        items.push({ id: globalThis.crypto?.randomUUID?.() ?? `time-${Date.now()}`, date: 'Yeni dönem', title: 'Yeni olay', description: '' })
        persist(); render()
      })
      card.querySelector<HTMLButtonElement>('#timelineExport')!.addEventListener('click', () => {
        try {
          const blob = new Blob([store.export(items)], { type: 'application/json;charset=utf-8' })
          const url = URL.createObjectURL(blob), link = document.createElement('a')
          link.href = url; link.download = 'afetlab-zaman-tuneli.json'; link.click(); URL.revokeObjectURL(url)
          status.textContent = 'Zaman tüneli JSON dosyası indirildi.'
        } catch (error) { status.textContent = error instanceof Error ? error.message : 'JSON dışa aktarılamadı.' }
      })
      card.querySelector<HTMLInputElement>('#timelineImport')!.addEventListener('change', async event => {
        const input = event.currentTarget as HTMLInputElement, file = input.files?.[0]
        if (!file) return
        try {
          const imported = store.import(await file.text())
          items.splice(0, items.length, ...imported)
          persist(); render(); status.textContent = `${items.length} pano JSON dosyasından aktarıldı.`
        } catch (error) { status.textContent = error instanceof Error ? error.message : 'JSON içe aktarılamadı.' }
        input.value = ''
      })
      list.onclick = event => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-timeline-action]')
        if (!button) return
        const idx = Number(button.dataset.index), action = button.dataset.timelineAction
        if (action === 'up' && idx > 0) [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]
        else if (action === 'down' && idx < items.length - 1) [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]]
        else if (action === 'remove' && items.length > 1) items.splice(idx, 1)
        else return
        persist(); render()
      }
    },
  }
}

function makeTimelineEntry(point: TimelinePoint, index: number, count: number, onEdit: () => void, onPhoto: (file: File) => void): HTMLElement {
  const article = document.createElement('article'); article.className = 'timeline-entry'
  const fields = document.createElement('div'); fields.className = 'timeline-fields'
  const date = timelineField('Tarih / dönem', 'date', point.date, 40, value => { point.date = value; onEdit() })
  const title = timelineField('Başlık', 'title', point.title, 100, value => { point.title = value; onEdit() })
  const description = timelineField('Kısa açıklama', 'description', point.description, 500, value => { point.description = value; onEdit() }, true)
  fields.append(date, title, description)
  const photo = document.createElement('div'); photo.className = 'timeline-photo'
  if (point.photo) { const img = document.createElement('img'); img.alt = `${point.date} ${point.title} fotoğraf önizlemesi`; img.src = point.photo; photo.append(img) }
  const photoLabel = document.createElement('label'); photoLabel.textContent = point.photo ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.setAttribute('aria-label', `${point.date || 'Yeni'} panosu için fotoğraf yükle`)
  file.addEventListener('change', () => { const selected = file.files?.[0]; if (selected) onPhoto(selected) })
  photoLabel.append(file); photo.append(photoLabel)
  const note = document.createElement('span'); note.className = 'note'; note.textContent = 'En çok 12 MB; yüklenirken JPEG olarak sıkıştırılır.'; photo.append(note)
  fields.append(photo)
  const actions = document.createElement('div'); actions.className = 'timeline-actions'
  for (const [action, label, disabled] of [['up', '↑', index === 0], ['down', '↓', index === count - 1], ['remove', 'Sil', count <= 1]] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'media-action'; button.textContent = label
    button.title = action === 'up' ? 'Panoyu yukarı taşı' : action === 'down' ? 'Panoyu aşağı taşı' : 'Panoyu sil'
    button.setAttribute('aria-label', button.title); button.dataset.timelineAction = action; button.dataset.index = String(index); button.disabled = disabled
    actions.append(button)
  }
  article.append(fields, actions)
  return article
}

function timelineField(labelText: string, name: 'date' | 'title' | 'description', value: string, max: number, onEdit: (value: string) => void, long = false): HTMLLabelElement {
  const label = document.createElement('label'); if (long) label.className = 'description'; label.append(document.createTextNode(labelText))
  const input = long ? document.createElement('textarea') : document.createElement('input')
  if (input instanceof HTMLInputElement) input.type = 'text'
  input.name = name; input.value = value; input.maxLength = max; input.dataset.field = name
  input.setAttribute('aria-label', labelText); input.addEventListener('input', () => onEdit(input.value))
  label.append(input)
  return label
}

export function familyPlanPanel(): PanelSpec {
  let plan: FamilyPlan = loadFamilyPlan()
  let saveNow = () => {}
  return {
    html: `<h2 class="modal-title">Afet Aile Planı</h2>
      <div class="modal-sub">Plan bilgileri yalnızca bu tarayıcıda saklanır. Birlikte doldurun ve tatbikatlarda güncel tutun.</div>
      <div class="modal-body family-list">
        <div class="family-grid">
          <section class="family-section"><h3>Mahalle içi buluşma noktası</h3><label>Adres / yer<input id="localAddress" maxlength="300" autocomplete="street-address"></label><label>Tarif ve buluşma notu<textarea id="localNote" maxlength="500"></textarea></label></section>
          <section class="family-section"><h3>İlçe / şehir dışı buluşma noktası</h3><label>Adres / yer<input id="regionalAddress" maxlength="300"></label><label>Tarif ve buluşma notu<textarea id="regionalNote" maxlength="500"></textarea></label></section>
          <section class="family-section wide"><h3>Görev ve sorumluluklar</h3><div id="familyAssignments"></div><button id="addAssignment" class="media-action" type="button">+ Görev ekle</button></section>
          <section class="family-section"><h3>Aile üyeleri ve telefonları</h3><div id="familyContacts"></div><button id="addContact" class="media-action" type="button">+ Kişi ekle</button></section>
          <section class="family-section"><h3>Şehir dışı irtibat ve acil hatlar</h3><label>İrtibat kişisi<input id="externalName" maxlength="80"></label><label>Telefon<input id="externalPhone" maxlength="50" type="tel"></label><label>Acil numaralar<input id="emergencyNumbers" maxlength="200"></label></section>
        </div>
        <section id="familySummarySection" class="family-section"><h3>Özet kart</h3><pre id="familySummary" class="family-summary"></pre><div class="modal-tools"><button id="familyCopy" class="media-action" type="button">Özeti kopyala</button><button id="familyPrint" class="media-action" type="button">Yazdır</button><button id="familyReset" class="media-action" type="button">Planı sıfırla</button></div><div id="familyStatus" role="status" aria-live="polite"></div></section>
      </div>`,
    buttons: [{ label: 'Kaydet ve kapat', primary: true, onClick: () => saveNow() }],
    onShow: card => {
      const status = card.querySelector<HTMLElement>('#familyStatus')!
      const summary = card.querySelector<HTMLElement>('#familySummary')!
      const assignmentList = card.querySelector<HTMLElement>('#familyAssignments')!
      const contactList = card.querySelector<HTMLElement>('#familyContacts')!
      const persist = () => {
        try { saveFamilyPlan(plan); status.textContent = 'Aile planı bu cihazda kaydedildi.' }
        catch (error) { status.textContent = error instanceof Error ? error.message : 'Aile planı kaydedilemedi.' }
        summary.textContent = familyPlanSummary(plan)
      }
      saveNow = persist
      const id = () => globalThis.crypto?.randomUUID?.() ?? `family-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const bind = (selector: string, get: () => string, set: (v: string) => void) => {
        const input = card.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!
        input.value = get()
        input.addEventListener('input', () => { set(input.value); persist() })
      }
      const renderAssignments = () => {
        assignmentList.replaceChildren()
        plan.assignments.forEach((item, index) => {
          const row = document.createElement('div'); row.className = 'family-row'
          row.append(makeTextInput('Aile üyesi', item.person, value => { item.person = value; persist() }, 80), makeTextInput('Görevi', item.task, value => { item.task = value; persist() }, 240))
          row.append(removeRowButton(() => { plan.assignments.splice(index, 1); renderAssignments(); persist() }, 'Görevi sil'))
          assignmentList.append(row)
        })
      }
      const renderContacts = () => {
        contactList.replaceChildren()
        plan.contacts.forEach((item, index) => {
          const row = document.createElement('div'); row.className = 'family-row contact'
          row.append(makeTextInput('Aile üyesi', item.person, value => { item.person = value; persist() }, 80), makeTextInput('Telefon', item.phone, value => { item.phone = value; persist() }, 50, 'tel'))
          row.append(removeRowButton(() => { plan.contacts.splice(index, 1); renderContacts(); persist() }, 'Kişiyi sil'))
          contactList.append(row)
        })
      }
      const populate = () => {
        bind('#localAddress', () => plan.localMeeting.address, v => { plan.localMeeting.address = v })
        bind('#localNote', () => plan.localMeeting.note, v => { plan.localMeeting.note = v })
        bind('#regionalAddress', () => plan.regionalMeeting.address, v => { plan.regionalMeeting.address = v })
        bind('#regionalNote', () => plan.regionalMeeting.note, v => { plan.regionalMeeting.note = v })
        bind('#externalName', () => plan.outOfAreaContact.name, v => { plan.outOfAreaContact.name = v })
        bind('#externalPhone', () => plan.outOfAreaContact.phone, v => { plan.outOfAreaContact.phone = v })
        bind('#emergencyNumbers', () => plan.emergencyNumbers, v => { plan.emergencyNumbers = v })
        renderCurrentValues()
      }
      const renderCurrentValues = () => {
        card.querySelector<HTMLInputElement>('#localAddress')!.value = plan.localMeeting.address
        card.querySelector<HTMLTextAreaElement>('#localNote')!.value = plan.localMeeting.note
        card.querySelector<HTMLInputElement>('#regionalAddress')!.value = plan.regionalMeeting.address
        card.querySelector<HTMLTextAreaElement>('#regionalNote')!.value = plan.regionalMeeting.note
        card.querySelector<HTMLInputElement>('#externalName')!.value = plan.outOfAreaContact.name
        card.querySelector<HTMLInputElement>('#externalPhone')!.value = plan.outOfAreaContact.phone
        card.querySelector<HTMLInputElement>('#emergencyNumbers')!.value = plan.emergencyNumbers
        renderAssignments(); renderContacts(); summary.textContent = familyPlanSummary(plan)
      }
      populate()
      card.querySelector<HTMLButtonElement>('#addAssignment')!.addEventListener('click', () => { plan.assignments.push({ id: id(), person: '', task: '' }); renderAssignments(); persist() })
      card.querySelector<HTMLButtonElement>('#addContact')!.addEventListener('click', () => { plan.contacts.push({ id: id(), person: '', phone: '' }); renderContacts(); persist() })
      card.querySelector<HTMLButtonElement>('#familyCopy')!.addEventListener('click', async () => {
        const text = familyPlanSummary(plan)
        try { await navigator.clipboard.writeText(text); status.textContent = 'Aile planı özeti panoya kopyalandı.' }
        catch {
          const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.append(textarea); textarea.select()
          const ok = document.execCommand('copy'); textarea.remove(); status.textContent = ok ? 'Aile planı özeti panoya kopyalandı.' : 'Kopyalama engellendi; özeti seçip kopyalayabilirsiniz.'
        }
      })
      card.querySelector<HTMLButtonElement>('#familyPrint')!.addEventListener('click', () => {
        const cleanup = () => document.body.classList.remove('print-family')
        document.body.classList.add('print-family'); window.addEventListener('afterprint', cleanup, { once: true }); window.print(); window.setTimeout(cleanup, 1500)
      })
      card.querySelector<HTMLButtonElement>('#familyReset')!.addEventListener('click', () => {
        if (!window.confirm('Bu cihazda kayıtlı aile planı sıfırlansın mı?')) return
        plan = resetFamilyPlan(); renderCurrentValues(); persist(); status.textContent = 'Aile planı varsayılan boş hâline döndürüldü.'
      })
    },
  }
}

function makeTextInput(labelText: string, value: string, onValue: (value: string) => void, maxLength: number, type = 'text'): HTMLLabelElement {
  const label = document.createElement('label'); label.append(document.createTextNode(labelText))
  const input = document.createElement('input'); input.type = type; input.value = value; input.maxLength = maxLength; input.setAttribute('aria-label', labelText)
  input.addEventListener('input', () => onValue(input.value)); label.append(input); return label
}
function removeRowButton(remove: () => void, label: string): HTMLButtonElement {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'media-action'; button.textContent = 'Sil'; button.setAttribute('aria-label', label); button.addEventListener('click', remove); return button
}
