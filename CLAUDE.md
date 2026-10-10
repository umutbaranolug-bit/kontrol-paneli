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
| `manifest.json` | PWA manifesti: `standalone`, `portrait`, `start_url`/`scope` `./`, tema `#0F141B`. |
| `icon-192.png`, `icon-512.png` | PWA ikonları. |

Repo'da **olmayanlar:** Apps Script (`Code.gs`) kaynağı ve arayüzde atıf yapılan `KURULUM.md`. Sunucu tarafı yalnızca Google'da yaşıyor.

`index.html` içindeki kod `// ---------- Başlık ----------` yorumlarıyla bölümlenmiş; bir şeyi bulmak için fonksiyon adını grep'le. Yorumlar Türkçe ve çoğu "neden böyle" açıklıyor — aynı üslubu koru.

## Veri modeli

Her şey localStorage'da JSON olarak durur. Erişim üç fonksiyondan geçer:

- `sget(k, def)` — okur; varsayılanın tipi sözleşmedir (dizi beklenen yerde dizi değilse `def` döner). localStorage patlarsa bellekteki `mem`'e düşer.
- `sset(k, v)` — yazar **ve** `scheduleSync()` çağırır. Kullanıcı verisi için bunu kullan.
- `ssetRaw(k, v)` — sync tetiklemeden yazar. Sync'in kendi defter tutması ve uzaktan gelen veriyi uygulamak için.

Eşitlenen anahtarlar (`SYNC_KEYS`): `deadlines`, `schedule`, `prio`, `focusLog`, `reviews`, `mistakes`, `triage`, `chrono`, `tagLog`, `urgeLog`, `breakLog`, `sleepLog`, `modeLog`, `calibLog`, `tierLog`, `settings`, `lastExport`, `term`, `terms`, `courses`, `gpaBase`, `phoneLog`, `planLog` + dinamik `review-YYYY-Wnn` anahtarları.

Yalnızca cihazda kalanlar: `syncUrl`, `deviceId`, `deviceName`, `localRev`, `lastSeenRemoteRev`, `dataUpdatedAt`, `lastSync`.

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

## Sync: Google Apps Script + Sheets

Kurulum sekmesine girilen Web App URL'si (`syncUrl`) tek uç nokta. Sunucu kaynağı repo'da olmadığı için aşağıdaki, istemcinin beklediği sözleşmedir:

- **Push:** `POST`, `Content-Type: text/plain`, gövde `{updatedAt, rev, baseRev, deviceId, deviceName, data}`. `data` = `collectData()` (tüm `SYNC_KEYS` + `review-*`).
- **Pull:** `GET` → aynı zarfı JSON olarak döner; `data` yoksa "bulut boş" sayılıp ilk push yapılır.
- Apps Script hata verince çoğu zaman 200 + HTML döndüğü için `pushSync` gövdeye de bakar; `<` ile başlıyorsa hata sayar. Doğrulanmamış cevapta "eşitlendi" denmez.

Tetikleyiciler: her `sset` → 8 sn debounce ile push; sekme gizlenince bekleyen değişiklik hemen push; sekme görünür olunca ve açılışta otomatik pull.

**Cihaz kimliği ve sürüm sayacı**
- `deviceId`: `d-` + 8 rastgele karakter, tarayıcı başına bir kez üretilir. `deviceName` kullanıcı tarafından değiştirilebilir (varsayılan Telefon/Masaüstü).
- `localRev`: her push'ta bir artar (`bumpRev`; zorla push'ta artmaz). `lastSeenRemoteRev`: bu cihazın bulutta en son gördüğü/yazdığı sürüm.

**Çakışma tespiti** (tamamen istemcide, `pullSync`):
1. Uzak paket bu cihazdan geliyorsa **ya da** `remote.rev === lastSeenRemoteRev` ise çatal yok: yalnızca `updatedAt` yereldekinden yeniyse uygulanır.
2. Uzak sürüm farklı ama yerelde gönderilmemiş değişiklik yoksa (`!syncDirty && localRev === lastSeenRemoteRev`): uzak sürüm doğrudan alınır.
3. Aksi halde gerçek çatal: `showConflict` kartı çıkar, kullanıcı seçer. `resolveConflict` **kaybeden tarafı önce JSON dosyası olarak indirir**, sonra ya uzaktakini uygular ya da `pushSync(true)` ile yereli zorla yazar.

Bu akışa dokunan her değişiklikte "hiçbir şey sessizce ezilmez" garantisini koru.

`checkBackup()`: `lastExport` ve `lastSync`'in yenisi 7 günden eskiyse üstte uyarı gösterir.

## Sekmeler

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

\* zorunlu. Bilinmeyen `action` hata verir.

```json
[
  {"action":"add_deadline","title":"MATH 219 MT1","date":"2026-11-14","type":"exam"},
  {"action":"add_triage","deadline_title":"MATH 219 MT1","topic":"Integrating factor"},
  {"action":"add_review","topic":"Exact denklemler","course":"MATH 219"}
]
```

Şemanın değişmezleri — yeni action eklerken koru:
- **Hiçbir action veri silmez.** `add_*` yalnızca ekler; `add_course`/`set_grade`/`set_expect` yalnızca ders alanlarını günceller.
- Alanlar doğrulanır, serbest metin `esc()` üzerinden render edilir.
- Bu şema `ders-sistemi:panel-json-komut` skill'inde de sabit; burada bir action eklenir/değişirse skill de güncellenmeli.

Not: fonksiyonun üstündeki yorum hâlâ "dört eylem tipi" ve "hiçbir eylem var olan veriyi değiştirmez" diyor; ders action'ları eklendikten sonra güncellenmemiş.

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
