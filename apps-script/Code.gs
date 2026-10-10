// Kontrol Paneli — bulut senkronizasyon backend
// Tek işi var: POST ile gelen JSON'u sakla, GET ile aynen geri ver.
// Veri Drive'da tek bir dosyada duruyor — dashboard zaten kendi çakışma
// mantığını (rev/baseRev) client tarafında çözüyor, burada iş yok.
//
// Eskiden Sheets'te tek hücredeydi (sync!A1); hücre 50.000 karakterde
// doluyordu. İlk istekte A1'deki veri Drive dosyasına kopyalanır. A1'e
// dokunulmaz: taşıma anındaki hali yedek olarak orada kalır.

const FILE_NAME = 'kontrol-paneli-sync.json';
const PROP_FILE_ID = 'SYNC_FILE_ID';   // dosya ID'si Script Properties'te, kodda değil

// Eski depo — yalnızca taşıma sırasında okunur.
const SHEET_NAME = 'sync';
const CELL = 'A1';

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Taşıma ve yazma aynı anda iki istekte çalışmasın: iki dosya oluşması ya da
// yarım yazılmış dosyanın okunması buradan engelleniyor.
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Kilit altında çağrılır.
function getFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP_FILE_ID);
  if (id) {
    // Dosya bulunamazsa bilerek hata fırlatıyoruz, yenisini oluşturmuyoruz:
    // boş bir dosya "bulut boş" demek, o da ilk bağlanan cihazın verisini
    // çakışma kontrolü olmadan buluta yazması demek. Dosya gerçekten gittiyse
    // SYNC_FILE_ID özelliğini elle sil, sonraki istek yeniden kurar.
    const file = DriveApp.getFileById(id);
    if (file.isTrashed()) throw new Error('sync dosyası çöp kutusunda — Drive\'dan geri yükle');
    return file;
  }
  return migrate_(props);
}

// İlk çalıştırma: A1'de ne varsa Drive dosyasına kopyala.
function migrate_(props) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const cell = sh ? sh.getRange(CELL) : null;
  const old = cell ? String(cell.getValue() || '') : '';
  // DriveApp boş içerikle dosya oluşturmuyor; '{}' istemcide "bulut boş" sayılır.
  const content = old || '{}';
  const file = DriveApp.createFile(FILE_NAME, content, MimeType.PLAIN_TEXT);
  // Geri okuyup karşılaştırmadan ID'yi kaydetme: bozuk kopya kalıcı depo olmasın.
  if (file.getBlob().getDataAsString('UTF-8') !== content) {
    file.setTrashed(true);
    throw new Error('taşıma doğrulanamadı — veri hâlâ ' + SHEET_NAME + '!' + CELL + ' hücresinde');
  }
  props.setProperty(PROP_FILE_ID, file.getId());
  if (cell) {
    try {
      cell.setNote('Bu hücre artık kullanılmıyor (taşıma: ' + new Date().toISOString() +
        '). Güncel veri Drive\'da: ' + file.getUrl());
    } catch (err) {}
  }
  return file;
}

// Hata olursa bilerek yakalanmıyor: Apps Script HTML hata sayfası döner,
// istemcinin her sürümü bunu "eşitleme hatası" sayar. {"error":...} dönseydik
// eski istemci bunu "bulut boş" sanıp yerel veriyi buluta yazardı.
function doGet(e) {
  const raw = withLock_(function () {
    return getFile_().getBlob().getDataAsString('UTF-8');
  });
  return ContentService.createTextOutput(raw ? raw : '{}')
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = e.postData && e.postData.contents ? e.postData.contents : '{}';
  // Basit doğrulama: geçerli JSON değilse eski veriyi koru, hata dön.
  try {
    JSON.parse(body);
  } catch (err) {
    return json_({ error: 'invalid json' });
  }
  try {
    withLock_(function () {
      getFile_().setContent(body);
    });
  } catch (err) {
    return json_({ error: String(err && err.message ? err.message : err) });
  }
  return json_({ ok: true });
}

// ---------- Editörden elle çalıştırılanlar ----------

// Yeni sürümü dağıtmadan ÖNCE bir kez çalıştır: Drive iznini ister.
// Bilerek taşıma yapmıyor — eski sürüm hâlâ A1'e yazarken taşınırsa aradaki
// push'lar Drive dosyasına girmez. Taşıma, yeni sürümün ilk isteğinde olur.
function yetkiVer() {
  DriveApp.getRootFolder();
  SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('İzinler tamam. Şimdi yeni sürümü dağıt.');
}

// Dağıtımdan sonra kontrol: taşıma oldu mu, dosya nerede, kaç karakter.
function durum() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const a1 = sh ? String(sh.getRange(CELL).getValue() || '') : '';
  Logger.log('Eski A1: ' + a1.length + ' karakter');
  const id = PropertiesService.getScriptProperties().getProperty(PROP_FILE_ID);
  if (!id) {
    Logger.log('Henüz taşınmadı — ilk GET/POST isteğinde taşınacak.');
    return;
  }
  const file = DriveApp.getFileById(id);
  Logger.log('Drive dosyası: ' + file.getUrl());
  Logger.log('İçerik: ' + file.getBlob().getDataAsString('UTF-8').length + ' karakter' +
    (file.isTrashed() ? ' — ÇÖP KUTUSUNDA' : ''));
}
