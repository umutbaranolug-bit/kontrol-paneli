// Kontrol Paneli — bulut senkronizasyon backend
// Tek işi var: POST ile gelen JSON'u sakla, GET ile aynen geri ver.
// Veri Sheets'te tek hücrede duruyor — dashboard zaten kendi çakışma
// mantığını (rev/baseRev) client tarafında çözüyor, burada iş yok.

const SHEET_NAME = 'sync';
const CELL = 'A1';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

function doGet(e) {
  const sh = getSheet_();
  const raw = sh.getRange(CELL).getValue();
  const out = raw ? raw : '{}';
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sh = getSheet_();
  const body = e.postData && e.postData.contents ? e.postData.contents : '{}';
  // Basit doğrulama: geçerli JSON değilse eski veriyi koru, hata dön.
  try {
    JSON.parse(body);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'invalid json' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  sh.getRange(CELL).setValue(body);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
