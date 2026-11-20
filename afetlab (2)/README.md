# Afet Eğitim Merkezi: Saha Tatbikatı

Türkçe, tek oyunculu birinci şahıs 3B afet eğitim simülasyonu. Ana salondan deprem, afet çantası, tehlikeli madde ve üç katlı bina tahliye eğitimlerine geçin.

## Geliştirme

```bash
pnpm install
PORT=3000 HOST=0.0.0.0 pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

`pnpm dev` ve `pnpm build` öncesinde kayıtlı oyun modellerini proje Storage'ından geri yükler. Build; TypeScript kontrolü, Vite paketlemesi ve dosya boyutu raporunu da çalıştırır.

## Kontroller

**Klavye/fare:** WASD ile hareket; fareyle bakış; E ile yakındaki nesne/kapı/terminalle etkileşim; C ile çömelme; T basılıyken masaya tutunma; Shift ile koşma; V ile kamera; 1–5 ile alan seçimi; Esc ile duraklatma.

**Dokunmatik cihaz:** Ekran altındaki sol joystick hareket içindir. Sağ tarafta sürükleyerek bakın; alttaki Etkileş, Çök/Kalk, Tutun, Koş, Zıpla ve Duraklat düğmelerini kullanın. Kontroller dokunmatik ekranlarda otomatik görünür.

## Eğitim alanları

- **Deprem:** P ve S dalgaları, sismik gösterge, masa altında Çök–Kapan–Tutun.
- **Afet çantası:** Gerekli/gereksiz eşyaları seçme ve geri bildirim.
- **Tehlikeli madde:** Gaz dedektörü, sızıntı, maske ve vana.
- **Tahliye binası:** Altı odalı uzun koridor, koridorda kullanım dışı asansörler, bağımsız yangın merdiveni, panik barlı kapılar, kat planı, elektrik panosu ve dış toplanma noktası. Alarm sırasında asansör kullanılmaz; giriş masasının konumu başlangıç terminaline E ile yaklaşmayı engellemez.

## Sergi medyası

Ana sergi salonundaki medya terminalinden fotoğraf ve video ekleyin, listeleyin, sergi ekranında gösterin veya silin. Dosyalar yalnızca tarayıcının IndexedDB alanında bu cihazda tutulur; oyun sunucusuna yüklenmez. Tarayıcı depolamasını temizlemek kaydedilmiş medya dosyalarını kaldırabilir.

## Teknik yapı

- `src/game/`: sahne, eğitim alanları, oyuncu, HUD, medya arşivi ve oyun kuralları.
- `src/engine/`: giriş, çarpışma ve sabit adımlı oyun döngüsü.
- `assets.lock.json` ve `scripts/manus-game-assets/`: kayıtlı Three.js modelleri için Storage kilidi ve kurtarma.
- `src/game/tuning.ts` ile `scripts/manus-tuning/`: oyun parametreleri ve yalnızca geliştirmede kullanılan Tweak köprüsü.

Oyun çevrim içi skor tablosu, giriş veya kullanıcı hesabı gerektirmez. **Bu WebDev projesinde `publishing.auto_publish` etkindir:** `main` dalındaki kabul edilen değişiklikler otomatik yayın isteği oluşturabilir. Preview bağlantısı geçici geliştirme önizlemesidir; herkese açık yayının tamamlandığını tek başına kanıtlamaz.
