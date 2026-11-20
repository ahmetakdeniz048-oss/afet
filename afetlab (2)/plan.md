# Afet Eğitim Merkezi — Galeri, Zaman Tüneli ve Aile Afet Planı Güncellemesi

## Kapsam ve kararlar

Mevcut Türkçe Three.js/Vite afet eğitim oyununu ve kararlı tahliye/eğitim akışlarını koru. Ana galeride gereksiz iç kolonları kaldır; duvar kenarlarında engelsiz ziyaretçi akışına sahip fotoğraflı tarih tüneli oluştur. Tüneli modal düzenleyiciyle yıl/dönem, başlık, açıklama ve fotoğraf bakımından düzenlet; sıralamayı değiştir, yeni nokta ekle/sil, JSON dışa/içe aktar. Fotoğrafları cihaz içinde küçültüp sıkıştır ve yerel depoda tut. Açık galeride afet aile planı tabletli masasını kur; toplantı noktaları, görevler, kişiler/telefonlar ve acil hatları düzenleyip kalıcı sakla, özetini kopyalayıp yazdır ve sıfırlat. Etkileşimler en yakın ve bakılan hedefe bağlansın; HUD açılacak hedefi söylesin. Mevcut eğitim modülleri, üç katlı tahliye binası, IndexedDB medya terminali, performans düzenlemeleri, sesler, Tweak entegrasyonu ve dokunmatik kumandalar korunur. Bu kapsam yeni 3B model/görsel üretimi istemez.

## Tasarım

Gerçekçi saha-eğitim merkezi estetiğini sürdür: beton, sıva, çelik ve karo; mevcut yeşil acil-çıkış renk kodu; az ve işlevsel vurgu ışığı. Sergi salonunun orta yürüyüş eksenini dikme, masa veya pano ile daraltma. Kronoloji panolarını kuzey duvarına sıfır, görüş hizasında monte et ve sınırlı spot ışıklarla aydınlat. Aile planı tabletini fizikî aile masasına koy; masa ve AABB çarpışması aynı geometriyi izlesin. Her etkileşim HUD'da nesne/eylem adını göstersin; yalnızca en yakın görünür ray-hedefi seçilsin, görüş kapatan engel geçiş sağlamasın. Mobil modal dar ekranda tek sütun ve kaydırılabilir olsun.

## Proje yapısı ve uygulanan kararlar

- `src/game/world.ts`: gereksiz dört iç kolonu ve kolon izlerini kaldır; sergi duvarındaki yürüyüş akışını aç. Güneydoğu bilgi masasını üstünde fizikî afet planı/tableti ve E etkileşimi bulunan aile planı masasına dönüştür. Masa görseli ve AABB çarpıştırıcısını ortak Builder geometrisiyle birlikte kur.
- `src/game/timeline.ts` ve `src/game/exhibit-media.ts`: altı başlangıç dönemini kuzey ana duvar boyunca fotoğraf yuvalı panolar olarak göster; en çok sekiz panoyu destekle. Veriyi localStorage'da tut; görseli tarayıcı canvas'ında küçült/sıkıştır; düzenleyiciden sıralama, ekleme/silme ve JSON içe/dışa aktarımı sağla.
- `src/game/family-plan.ts` ve `src/game/game.ts`: iki buluşma yeri, aile görevleri, kişi telefonları, şehir dışı irtibat ve acil hatları yerel saklayan paneli; yazdırma/kopyalama/sıfırlama özet kartını oluştur. HUD düğmesi ve çakışmayan kısayol zaman tünelini; masa E etkileşimi aile planını açar.
- `src/game/game.ts` ve `src/game/hud.ts`: en yakın ray isabetini engel görüş hattı filtresiyle seç; HUD'da hem hedef adını hem açılacak eylemi göster. Klavye ve dokunmatik E akışını, medya arşivini koru.
- `src/style.css`, `index.html`: Türkçe düzenleyici buton/form metinlerini, modal taşma ve mobil dokunma erişimini, yazdırma görünümünü tanımla.
- `tests/` ve `scripts/smoke.mjs`: veri sınırları, editor/JSON, aile planı özeti/kaydı, aile masası ve galeri yürüyüş açıklığını, mobil modal erişimini doğrula.

- `src/game/evac-building.ts`: Lobi masasını giriş/terminal yaklaşım hattından yana taşı; çarpıştırıcısını yeni konumla eşleştir. Başlangıç terminalini giriş tarafından görülecek yöne çevir. Kritik tahliye kat planı ve lobi bilgi panolarını duvar yüzeyi/normaline hizala.
- `src/game/game.ts`: E hedefini ve görüş hattı sorgusunu 30 Hz'de güncelle; gereksiz geçici dizi tahsislerini kaldır. Açılıştaki uzun karşılama toast'ını kaldır ama sesli selamlamayı koru. E istemini mobilya arkasından seçme kuralı değiştirilmez; mobilde daha hafif kalite seçimi kullanılır.
- `src/engine/loop.ts` ve `tests/loop.test.ts`: uzun kare duraklamasından sonra biriken adımların takılmayı büyütmesini önlemek için kare/telafi üst sınırını uygula ve sınırı birim testinde doğrula.
- `src/game/player.ts` ve `src/engine/collision.ts`: mevcut AABB, eksen-ayrık hareket, yerçekimi ve güvenli merdiven çarpışmaları korunur; bu turda tüm çarpışma motorunu değiştirmek yerine girişteki gerçek yerleşim engeli giderilir.
- `scripts/smoke.mjs`: gerçek E terminal başlangıcı, açık giriş rotası, duvara hizalı plan panosu, kapılar, switchback merdivenler, şalter/acil yönlendirme ve mobil kontrolleri doğrula.

## Sunum ve kayıt

Mevcut statik oyun derlemesini, doğrulanmış paylaşım görsellerini/metadata'sını ve yerel medya yaklaşımını koru. `webdev.config` içinde `publishing.auto_publish` etkindir; kabul edilen `main` güncellemesi otomatik yayın isteği doğurabilir. Bu ayar değiştirilmez; Preview, checkpoint ve herkese açık yayın sonucu birbirinden ayrı raporlanır. Önizleme portu 3000 olarak kalır.
