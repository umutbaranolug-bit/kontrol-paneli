# Kontrol Paneli

Umut'un kişisel çalışma paneli: günlük öncelikler, deadline geri sayımı, D-14 sınav triyajı, aralıklı tekrar, hata defteri, odak kronometresi, haftalık review. Tek kullanıcılı, build adımı olmayan statik bir PWA.

- **Canlı:** https://umutbaranolug-bit.github.io/kontrol-paneli/ (GitHub Pages, `main` dalı, kök `/`)
- **Deploy = `main`'e push.** Ayrı bir build/CI yok; push edilen şey birkaç dakika içinde telefonda ve masaüstünde çalışan sürümdür.
- **Repo public.** Apps Script URL'si, kişisel veri veya yedek JSON'ları asla commit'leme.
- Yerel kopya `C:\dev\kontrol-paneli` altında durur (Google Drive `.git`'i senkronlamasın diye Documents'ta değil).

## Kurallar

1. **Değişiklikten önce testleri çalıştır.** Şu an repo'da otomatik test yok (bkz. [Testler](#testler)); test eklenene kadar bu kural oradaki elle kontrol listesi demektir — hem değişiklikten önce (temel durum) hem sonra.
2. **Her deploy'da `sw.js` içindeki `CACHE` sürümünü artır** (`kp-v3` → `kp-v4` …). Yeni bir dosya eklendiyse `SHELL` listesine de ekle.
3. **Kullanıcı verisini silen hiçbir migration yapma.** localStorage anahtarını yeniden adlandırma, kaldırma, şeklini geriye uyumsuz değiştirme yok. Yeni alan eklenir, eksik alan okurken varsayılanla doldurulur (`normPlan`, `sget` tip koruması, `Object.assign({}, SET0, …)` örnekleri gibi). Eski veri her zaman okunabilir kalmalı.
4. **Push öncesi Umut'a diff özetini göster** ve onayını bekle. Onaysız push yok.

## Dosya yapısı

| Dosya | İçerik |
|---|---|
| `index.html` | Uygulamanın tamamı (~3075 satır): CSS (1–~330), sekme çubuğu + 8 `<section>` (335–702), tek `<script>` bloğu (716–3075). Framework, bundler, modül yok. |
| `analiz.html` | Salt okunur analiz paneli (ısı haritası, haftalık trend, ders↔kredi, dürtü/uyku/telefon/kalibrasyon grafikleri). localStorage'dan okur, hiçbir anahtara yazmaz, sync'e karışmaz. Kendi `get()` ve `esc()` kopyası var. |
| `sw.js` | Service worker (aşağıda). |
| `manifest.json` | PWA manifesti: `standalone`, `portrait`, `start_url`/`scope` `./`, tema `#F3F1EC` (v2 açık tema). |
| `icon-192.png`, `icon-512.png` | PWA ikonları. |
| `apps-script/Code.gs` | Sync backend'inin (Google Apps Script) **referans kopyası**. Push ile deploy olmaz; çalışan sürüm Google'daki Apps Script projesidir (bkz. [Sync](#sync-google-apps-script--drive)). Uygulamanın parçası değil, `SHELL`'e eklenmez. |

Repo'da **olmayan:** arayüzde atıf yapılan `KURULUM.md`.

`index.html` içindeki kod `// ---------- Başlık ----------` yorumlarıyla bölümlenmiş; bir şeyi bulmak için fonksiyon adını grep'le. Yorumlar Türkçe ve çoğu "neden böyle" açıklıyor — aynı üslubu koru.

## Veri modeli

Her şey localStorage'da JSON olarak durur. Erişim üç fonksiyondan geçer:

- `sget(k, def)` — okur; varsayılanın tipi sözleşmedir (dizi beklenen yerde dizi değilse `def` döner). localStorage patlarsa bellekteki `mem`'e düşer.
- `sset(k, v)` — yazar **ve** `scheduleSync()` çağırır. Kullanıcı verisi için bunu kullan.
- `ssetRaw(k, v)` — sync tetiklemeden yazar. Sync'in kendi defter tutması ve uzaktan gelen veriyi uygulamak için.

Eşitlenen anahtarlar (`SYNC_KEYS`): `deadlines`, `schedule`, `prio`, `focusLog`, `reviews`, `mistakes`, `triage`, `chrono`, `tagLog`, `urgeLog`, `breakLog`, `pauseLog` (v2: günlük toplam mola, saniye), `telLog` (27 Kas: "Telefona baktım" molaları, saniye; pauseLog'a da dahil), `sleepLog`, `modeLog`, `calibLog`, `tierLog`, `settings`, `lastExport`, `term`, `terms`, `courses`, `gpaBase`, `phoneLog`, `planLog` + dinamik `review-YYYY-Wnn` anahtarları.

Yalnızca cihazda kalanlar: `syncUrl`, `deviceId`, `deviceName`, `localRev`, `lastSeenRemoteRev`, `dataUpdatedAt`, `lastSync`, `syncBase` (v3: son eşitlenen veri, birleştirme tabanı).

**Yeni bir veri anahtarı eklerken dört yeri birlikte güncelle**, yoksa veri sessizce eşitlenmez/yedeklenmez:
1. `SYNC_KEYS`
2. `exportData()` içindeki `keys` listesi
3. `applyRemote()` ve `importData()` içindeki bellek değişkenlerini yeniden yükleyen satırlar
4. Analizde kullanılacaksa `analiz.html` → `load()`

Kullanıcı metni `innerHTML`'e girmeden önce mutlaka `esc()`'ten geçer.

## PWA / service worker

- Kayıt `index.html` sonunda, yalnızca `https:` altında (`file://` ile açınca SW çalışmaz).
- **Network-first:** önce ağ, başarılıysa cache'e kopyalar; ağ yoksa cache, o da yoksa `./index.html`. Bilerek böyle — cache-first olsaydı yeni sürüm telefonda takılı kalırdı.
- `install`: `skipWaiting()` + `SHELL` dosyaları tek tek eklenir (biri eksikse kurulum yine tamamlanır). `activate`: adı `CACHE`'e eşit olmayan tüm cache'ler silinir + `clients.claim()`.
- Farklı origin'e giden istekler (Apps Script sync) ve GET olmayanlar SW'den geçmez.
- SW'nin ikinci işi bildirim: Android Chrome'da `new Notification()` yasak, mola bildirimi `registration.showNotification()` ile çıkıyor. `notificationclick` açık paneli öne getirir, yoksa açar.

## Sync: Google Apps Script + Drive

Kurulum sekmesine girilen Web App URL'si (`syncUrl`) tek uç nokta. İstemci ile sunucu arasındaki sözleşme:

- **Push:** `POST`, `Content-Type: text/plain`, gövde `{updatedAt, rev, baseRev, deviceId, deviceName, data}`. `data` = `collectData()` (tüm `SYNC_KEYS` + `review-*`).
- **Pull:** `GET` → aynı zarfı JSON olarak döner; `data` yoksa "bulut boş" sayılıp ilk push yapılır.
- Apps Script hata verince çoğu zaman 200 + HTML döndüğü için `pushSync` gövdeye de bakar; `<` ile başlıyorsa hata sayar. Doğrulanmamış cevapta "eşitlendi" denmez.
- Cevapta `error` alanı varsa (`{"error":"..."}`, HTTP 200) hem `pushSync` hem `pullSync` bunu hata sayar. Pull tarafı özellikle önemli: hata cevabında da `data` yok, "bulut boş" sayılsaydı yerel veri çakışma kontrolü olmadan buluta yazılırdı.

**Sunucu tarafı (`apps-script/Code.gs`)**

Bilerek aptal bir depo: gelen gövdeyi saklar, aynen geri verir. Zarfın içine bakmaz; `rev`/`baseRev`/`deviceId` sunucuda hiç okunmaz.

- **Depolama:** script sahibinin Drive'ında `kontrol-paneli-sync.json` dosyası (`DriveApp`) — tüm zarf tek bir JSON string. Dosya ID'si Script Properties'te (`SYNC_FILE_ID`) durur, kodda değil; dosya adla aranmaz. Web App URL'si de kodda değil, yalnızca cihazlardaki `syncUrl`'de. İkisi de repo'ya girmez.
- **Taşıma (`migrate_`):** `SYNC_FILE_ID` yoksa ilk GET/POST isteğinde çalışır: eski deponun (bağlı Spreadsheet, `sync!A1`) içeriğini Drive dosyasına kopyalar, geri okuyup doğrular, sonra ID'yi kaydeder. `A1` silinmez — taşıma anındaki hali yedek olarak kalır, hücreye yalnızca bir not düşülür. Script hâlâ container-bound, ama Spreadsheet taşımadan sonra okunmaz.
- **`doGet`:** dosyayı JSON MIME tipiyle aynen döner; boşsa `{}` (istemci bunu "bulut boş" sayar). Hata **yakalanmaz**: Apps Script HTML hata sayfası döner, istemcinin her sürümü bunu hata sayar.
- **`doPost`:** gövdeyi `JSON.parse` ile dener. Geçersizse dosyaya dokunmaz, `{"error":"invalid json"}` döner; geçerliyse dosyanın üzerine yazar ve `{"ok":true}` döner. Yazma hatası (Drive, kilit zaman aşımı) `{"error":"<mesaj>"}` olarak döner. Hepsi HTTP 200.
- **Dosya kaybolursa yenisi oluşturulmaz**, hata verilir (çöp kutusundaysa da). Bilerek: boş dosya "bulut boş" demek, o da ilk bağlanan cihazın verisini kontrolsüz buluta yazması demek. Dosya gerçekten gittiyse `SYNC_FILE_ID` özelliği elle silinir, sonraki istek yeniden kurar.
- **Son yazan kazanır.** Sunucuda sürüm kontrolü veya geçmiş yok; her POST öncekini ezer. `LockService` yalnızca taşıma ile okuma/yazmanın iç içe girmesini engeller, çakışma çözmez. "Hiçbir şey sessizce ezilmez" garantisi tamamen istemcideki pull-önce-push akışına ve çakışma kartına dayanır — iki cihaz pull yapmadan art arda push ederse sunucu bunu durdurmaz.
- **Bilinen sınırlar:**
  - `File.setContent` en fazla 10 MB alır (eski hücre limiti 50.000 karakterdi). Aşılırsa `doPost` `{"error":...}` döner, istemci "EŞİTLENMEDİ" gösterir.
  - `DriveApp` tam Drive kapsamı (`auth/drive`) ister; script sahibinin tüm Drive'ına erişim yetkisi vardır, kod yalnızca kendi dosyasına dokunur.
- **Editörden elle çalışan yardımcılar:** `yetkiVer()` (yalnızca izin ister, taşıma yapmaz) ve `durum()` (dosya URL'si + boyutları loglar).
- **Dağıtım:** Apps Script editöründe Web App olarak yayınlanır; istemci kimlik bilgisi göndermediği için erişim "Anyone" olmalı — URL'yi bilen herkes veriyi okuyup yazabilir, URL'yi gizli tut. `Code.gs`'i değiştirmek için repo'daki kopyayı düzenlemek yetmez: kodu editöre yapıştırıp **yeni sürüm olarak yeniden dağıtmak** gerekir (mevcut dağıtımı güncelle ki URL değişmesin). Repo kopyası ile canlı script'i elle eş tut.

Tetikleyiciler: her `sset` → 8 sn debounce ile push; sekme gizlenince bekleyen değişiklik hemen push; sekme görünür olunca ve açılışta otomatik pull.

**Cihaz kimliği ve sürüm sayacı**
- `deviceId`: `d-` + 8 rastgele karakter, tarayıcı başına bir kez üretilir. `deviceName` kullanıcı tarafından değiştirilebilir (varsayılan Telefon/Masaüstü).
- `localRev`: her push'ta bir artar (`bumpRev`; zorla push'ta artmaz). `lastSeenRemoteRev`: bu cihazın bulutta en son gördüğü/yazdığı sürüm.

**Birleştirme (v3, 26 Kas 2026)** — eski "iki taraftan birini seç" çakışma kartının yerine. Eski akışta açılışta otomatik bir `sset` (kronometre gün sıfırlaması vb.) cihazı "değişmiş" yapıyordu ve sekme kapanırken pull beklemeden push ediliyordu; 18–22 Kasım verisi eski kopyalı telefonun buluta yazmasıyla gitti.
1. Her cihaz son eşitlediği hali `syncBase`'de (yalnızca cihazda) tutar.
2. `pushSync` kör yazmaz: önce GET; uzak paket başka cihazdan ve `rev` farklıysa önce `mergeRemote`, sonra POST. Aynı anda tek eşitleme çalışır (`syncBusy`).
3. `merge3(taban, yerel, uzak)`: yalnızca bir tarafın değiştirdiği alan o taraftan alınır; ikisi de değiştirdiyse sözlükler anahtar anahtar, `id`/`t` alanlı listeler kayıt kayıt birleşir (tabanda olup bir tarafta silinen, öteki dokunmadıysa silinmiş kalır), sayılarda büyük olan, diğer değerlerde bu cihazdaki kalır.
4. Taban yoksa (v3'e ilk geçiş) birleştirme birleşim yapar: hiçbir şey silinmez, en kötü ihtimalle silinmiş bir kayıt geri gelir.
`showConflict`/`resolveConflict` kodda duruyor ama artık çağrılmıyor. Test: `merge3` senaryoları iki tarayıcı bağlamı + sahte Apps Script ile denendi (eski kopyalı telefonun push'u, eşzamanlı ekleme, silmenin yayılması).

Bu akışa dokunan her değişiklikte "hiçbir şey sessizce ezilmez" garantisini koru.

`checkBackup()`: `lastExport` ve `lastSync`'in yenisi 7 günden eskiyse üstte uyarı gösterir.

## Sekmeler

**v2 (Kasım 2026):** arayüz 4 sekmeye indi, açık temaya geçti. 8 `<section>` DOM'da duruyor ama `dersler`, `tekrar`, `review` sekmelerinin butonları `hidden`; `TAB_ALIAS` eski bağlantıları yeni yere yönlendirir (`tekrar` → Notlar, `dersler` → Ayarlar, `review` → Bugün). Kronometre 26 Kas'tan beri yine görünür ("Sayaç"). Klavye `1`–`5`.

| Buton | `section` id | İçerik |
|---|---|---|
| Bugün | `today` | Gün + Dönem akış şeritleri, sıradaki sınav kartı (plan şeridi, bugünün bloğu, Başlat), zincir + son 7 gün, tekrar (en fazla `RV_CAP` = 5), yaklaşan deadlineler. Eski kartlar (`quickStart`, `prioBox`, `todayWindow`, uyku…) `.v2-legacy` içinde gizli; render fonksiyonları çalışmaya devam eder. |
| Sınavlar | `deadlines` | `#examView`: yaklaşan sınav listesi + seçili sınavın triyajı (tek buton Yok/Yarım/Hazır = `cycleTri`) + o dersin son 3 hatası. Altında tüm deadline'lar; tamamlananlar kapalı `<details>` içinde. |
| Notlar | `hatadefteri` | Hata defteri (ilk 30, "Tümünü göster") + tekrar (Aktif / Uyuyor / Arşiv). |
| Ayarlar | `kurulum` | Ders programı ızgarası, dersler + GPA, çalışma, senkron, Claude, veri; yoğun dönem ve akşam penceresi "Diğer" altında. |

**Sayaç:** Mola limiti aşılınca kart kırmızıya döner, limit + `BREAK_NAG` (10) dk'da ikinci bildirim gelir. Kesintisiz `STUDY_CHECK` (180) dk çalışmada "hâlâ çalışıyor musun?" sorulur (`ch.ack`, `chFinishAs`). Kronometre v2'de yine görünür sekme (`5`, "Sayaç"). Bugün'deki çalışma/mola kartı (`renderSessCard`) bugünü `chrono`'dan canlı, son 7 günü `focusLog` + `pauseLog`'dan çizer; `pauseLog` öncesi günlerde yalnızca limiti aşan molalar (`breakLog.tot`) bilindiği için taralı gösterilir.

**Mola önerisi:** `recBreak(ch.run)`. `ch.run` son gerçek moladan beri toplam çalışmadır; `MICRO_BREAK` (180 sn) veya daha kısa mola bloğu bölmez (40 dk + 2 dk telefon + 20 dk → 60 dk'lık blok, 15 dk mola). `ch.nb` gerçek mola sayısı ("4. blok" bonusu). İkisi de opsiyonel, eksikse 0.

**Telefona baktım (`chPhone`, `T`):** çalışırken kısa telefon molası; `ch.kind='tel'`, sınır `MICRO_BREAK` (3 dk; asıl limit `ch.blSave`'de bekler, `chEndTel` geri koyar). Mola gibi sayılır, ayrıca `ch.tm` + `telLog`'a yazılır; 3 dk'yı aşmazsa blok bölünmez.

**Yüzen sayaç (27 Kas):** `openFloat`/`closeFloat`/`renderFloat`. Masaüstü Chrome/Edge'de Document Picture-in-Picture (her uygulamanın üstünde duran küçük pencere, Mola/Devam düğmeli); desteklemeyen tarayıcıda (Android Chrome) canvas → video PiP (düğmesiz, yalnızca süre). İkisi de yalnızca dokunuşla açılır: Başlat'a basınca kendiliğinden (`settings.floatAuto`, varsayılan açık) ya da çalışma kartı/Sayaç'taki "Yüzen sayaç". `chRender` her saniye günceller.

**Claude'dan yapıştır her yerde:** üst çubukta ve Sayaç'ta düğme → `#pasteDlg`. "Panodan uygula" panoyu okur; uygulama yine `applyClaudeAction()` (Ayarlar'daki kutuya yazıp çağırır).

**Tekrar kapısı (`rvState`):** kart dersinin sıradaki sınavına `RV_WAKE` (14) günden fazla varsa "uyur", kalınca açılır; sınavı bilinmeyen ders her zaman aktif. Durum her seferinde `deadlines`'tan hesaplanır, saklanmaz. Kartta yalnızca kullanıcı arşivlerse `archived:true` olur (mistakes için de aynı alan).

**Sınav haftası (`weekCluster` / `weekPlan`):** 14 gün içinde 2+ sınav varsa Bugün kartı günleri sınavlar arasında paylaştırır. Puan = not ağırlığı × ders önceliği × hazır olmayan konu ÷ kalan gün^0,7; sınavdan önceki gün o derse ayrılır, aynı ders üst üste ikiden fazla gelmez. Elle ayar iki yeni opsiyonel alanda durur (eksikse varsayılan): `courses[i].pri` (0,6 / 1 / 1,6 — Ayarlar → Çalışma) ve `settings.planOv = {tarih: deadlineId}` (plan şeridinde güne dokunarak; geçmiş tarihler yazarken budanır).

Aşağıdaki tablo v2 öncesi sekme düzenidir; veri şekilleri hâlâ geçerli.

Klavye: `1`–`8` sekme, `S` başlat/mola/devam, `D` dürtü kaydı (çalışırken), `N` yeni hata kaydı. `index.html#review` gibi hash ile doğrudan sekme açılır.

| # | Sekme (`section` id) | Ne yapar |
|---|---|---|
| 1 | **Bugün** (`today`) | Günaydın kartı, tek dokunuşla başlat, 3 öncelik (`prio`), gün çubuğu, zincir + günlük minimum (`settings.minDay`), akşam penceresi, yaklaşan deadlineler, bugün düşen tekrarlar, haftalık grafik, uyku kaydı, **Bugünün bloğu**. |
| 2 | **Deadlineler** (`deadlines`) | `{id,title,date,type,done,plan?}`; tip `exam`/`hw`/`lab`/`other`. Her deadline'a çok günlük çalışma planı eklenebilir (`plan: {total,days,perDay,start,log}`). **D-14 triyaj:** sınav tipindeki her açık deadline'ın altında konu çipleri — `triage[deadlineId] = [{id,topic,color}]`, renk `r` → `y` → `g` (çalışılmadı → kısmen → oturdu), hepsi kırmızı başlar. Sınava ≤14 gün kalınca Bugün ve Claude özetinde öne çıkar. |
| 3 | **Dersler** (`dersler`) | `courses`: kod, kredi, bileşenler (`comps: [{n,w,date,s}]`), beklenen/hedef harf, tekrar notu; GPA simülatörü (`gpaBase`, `LETTER`). |
| 4 | **Tekrar** (`tekrar`) | Aralıklı tekrar: `LADDER = [1,3,7,14,30,60]` gün. Kart `{id,topic,course,level,due,count}`. Zor → bir basamak geri, Orta → bir ileri, Kolay → bir ileri (2+ başarılı tekrardan sonra iki). Değerlendirmeden önce verilen tahmin (JOL) `calibLog`'a yazılır → bias + Brier. |
| 5 | **Hata Defteri** (`hatadefteri`) | `mistakes`: `{id,course,note,se,date}` (`se` = neden). Kayıt tekrar kartına çevrilebilir. Problem kalibrasyonu ve kademe kutusu (`tierLog`, `TIER_NAMES`). |
| 6 | **Kronometre** (`kronometre`) | Odak/mola durum makinesi (`chrono`, faz `idle`/`study`/`break`), aktif/pasif mod (`modeLog`), ders etiketi (`tagLog`), dürtü kaydı (`urgeLog`), mola limiti + aşım sebebi (`breakLog`), telefon taahhüdü (`phoneLog`), mola bildirimi. Süre `focusLog`'a işlenir. |
| 7 | **Haftalık Review** (`review`) | "Bu haftanın verisi" özeti (`weekPatterns`) + 8 maddelik kontrol listesi + not. `review-YYYY-Wnn` anahtarında saklanır. |
| 8 | **Kurulum** (`kurulum`) | Ders programı, yoğun dönem blokları (tarih aralıklı, bitince kendiliğinden düşer), günlük minimum, akşam penceresi ayarları, yeni dönem, Analiz linki, Claude özeti, **Claude'dan yapıştır**, sync, yedek dışa/içe aktarma. |

**Bugünün bloğu / haftalık plan:** `PLAN` dizisi ve konu takvimleri (`T_MATH`, `T_ES`, `T_PETE`, `T_CHEM`, `T_GEOE`) **kodda sabittir** ve döneme özeldir; plan değişikliği kod değişikliğidir. Yalnızca işaretler saklanır: `planLog[tarih][blokId] = {s:[adım anahtarları], skip:sebep}`. `PLAN_START` öncesi "kaçan blok" sayılmaz.

**Yeni dönem (`newTerm`)** uygulamadaki tek toplu temizliktir: önce tam yedek indirir, özeti `terms`'e arşivler, sonra programı, geçmiş/tamamlanmış deadlineleri, onların triyajını ve `courses`'u temizler. Hata defteri, tekrar kartları ve tarih anahtarlı loglar kalır. Kullanıcı onayıyla çalışır; kod tarafında buna benzer otomatik bir temizlik ekleme (Kural 3).

## Claude ↔ panel

**Panel → Claude:** Kurulum → "Özeti kopyala" (`buildClaudeSummary`) güncel durumu okunur Türkçe metin olarak panoya koyar.

**Claude → panel:** Kurulum → "Claude'dan yapıştır" kutusuna JSON yapıştırılır, `applyClaudeAction()` uygular. Tek nesne ya da nesne dizisi kabul eder; her eleman bağımsız işlenir (biri hata verirse diğerleri yine uygulanır, hatalar durum satırında listelenir).

| `action` | Alanlar | Davranış |
|---|---|---|
| `add_deadline` | `title`*, `date`* (`YYYY-MM-DD`), `type` (`exam`\|`hw`\|`lab`\|`other`; geçersizse `other`) | Deadline ekler. |
| `add_triage` | `deadline_title`*, `topic`* | Başlığı **tam eşleşen** (büyük/küçük harf duyarsız), tamamlanmamış deadline'a kırmızı konu ekler. Deadline yoksa hata. |
| `add_mistake` | `note`*, `course`, `why` | Hata defterinin başına ekler (`why` → `se`, tarih bugün). |
| `add_review` | `topic`*, `course` | Seviye 0, yarın vadeli tekrar kartı. |
| `add_course` | `code`*, `name`, `credit`, `retake`, `target`, `expect`, `note`, `comps: [{n, w, date}]` | `upsertCourse`: kod eşleşirse günceller, yoksa ekler. Tarihli her bileşen için `"KOD BİLEŞEN"` başlıklı deadline da açar (adında "lab" geçiyorsa `lab`, değilse `exam`; aynı başlık zaten varsa atlar). |
| `set_grade` | `course`*, `comp`*, `score`* (0–100'e kırpılır) | Var olan dersin var olan bileşenine not yazar. |
| `set_expect` | `course`*, `letter`* (`AA`…`FF`) | Beklenen harfi ayarlar. |
| `archive_review` | `ids`* | Tekrar kartlarına `archived:true` koyar (Notlar → Arşiv'den geri alınır). |
| `archive_mistakes` | `course`* | O dersin hata kayıtlarına `archived:true` koyar. |
| `rename_course` | `from`*, `to`* | Tekrar ve hata kayıtlarında ders adını birleştirir. |
| `remove_triage` | `deadline_title`*, `ids`* | Yalnızca verilen id'li triyaj konularını siler (çift içe aktarma temizliği). |

\* zorunlu. Bilinmeyen `action` hata verir.

```json
[
  {"action":"add_deadline","title":"MATH 219 MT1","date":"2026-11-14","type":"exam"},
  {"action":"add_triage","deadline_title":"MATH 219 MT1","topic":"Integrating factor"},
  {"action":"add_review","topic":"Exact denklemler","course":"MATH 219"}
]
```

Şemanın değişmezleri — yeni action eklerken koru:
- **Action'lar veri silmez; tek istisna `remove_triage`** — o da yalnızca açıkça verilen id'leri. `add_*` yalnızca ekler; `add_course`/`set_grade`/`set_expect` yalnızca ders alanlarını günceller; `archive_*` bayrak koyar, `rename_course` ders adını değiştirir.
- Alanlar doğrulanır, serbest metin `esc()` üzerinden render edilir.
- Bu şema `ders-sistemi:panel-json-komut` skill'inde de sabit; burada bir action eklenir/değişirse skill de güncellenmeli.


## Testler

**Şu an repo'da otomatik test, test çatısı, linter veya `package.json` yok.** Doğrulama elle yapılır:

1. `index.html`'i tarayıcıda aç. Bu makinede Node ve Python kurulu değil, yani yerel sunucu yok; dosyayı doğrudan (`file://`) açmak arayüz ve localStorage akışları için yeterli. SW kaydı `https:` şartına bağlı olduğundan yerelde devreye girmez — SW ve bildirim davranışı ancak Pages'te doğrulanır.
2. DevTools konsolu hatasız açılmalı; 8 sekmenin hepsi render olmalı.
3. Dokunduğun alanın akışını uçtan uca dene; veri yenilemeden sonra duruyor mu bak.
4. Veri şekline dokunduysan: eski bir yedeği "Yedekten geri yükle" ile içe aktar, hiçbir sekme boş/bozuk kalmamalı.
5. Sync'e dokunduysan: iki farklı tarayıcı profiliyle çatal senaryosunu dene, kaybeden tarafın yedek dosyası iniyor mu bak.
6. `analiz.html` hâlâ açılıyor mu kontrol et (aynı anahtarları okur).

Test eklenirse bu bölümü komutlarıyla birlikte güncelle. İlk adaylar DOM'a bağlı olmayan saf mantık: `pullSync` çakışma kararı, `rateReview` basamak hesabı, `applyClaudeAction` doğrulaması, `normPlan`.

## Deploy kontrol listesi

1. Elle kontrol listesi geçti.
2. `sw.js` → `CACHE` artırıldı; yeni dosya varsa `SHELL`'e eklendi.
3. Diff özeti Umut'a gösterildi, onay alındı.
4. `main`'e push → birkaç dakika sonra canlı sayfada doğrula.
