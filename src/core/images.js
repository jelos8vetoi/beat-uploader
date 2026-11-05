const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_RESULTS = 40;
const MAX_BYTES = 20 * 1024 * 1024;
const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SOURCES = {
  web: {
    // Широкие и большие картинки сразу подходят для видео.
    url: (q) => `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&qft=+filterui:aspect-wide+filterui:imagesize-large&form=IRFLTR`,
    read: `[...document.querySelectorAll('a.iusc')].map((a) => {
      try {
        const m = JSON.parse(a.getAttribute('m'));
        return { thumb: m.turl, full: m.murl, title: m.t || '' };
      } catch { return null; }
    }).filter(Boolean)`,
  },
  pinterest: {
    url: (q) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`,
    // Аватарки авторов имеют другой размер в адресе и сюда не попадают.
    read: `[...document.querySelectorAll('img[src*="pinimg.com"]')]
      .filter((img) => /\\/(236x|474x|564x|736x)\\//.test(img.src))
      .map((img) => ({
        thumb: img.src.replace(/\\/(474x|564x|736x)\\//, '/236x/'),
        full: img.src.replace(/\\/(236x|474x|564x)\\//, '/736x/'),
        title: img.alt || '',
      }))`,
  },
};

function cleanResults(list) {
  const seen = new Set();
  return list.filter((r) => {
    if (!r || !/^https:\/\//.test(r.thumb || '') || !/^https:\/\//.test(r.full || '') || seen.has(r.full)) return false;
    seen.add(r.full);
    return true;
  }).slice(0, MAX_RESULTS);
}

// Поиск в скрытом окне: страница открывается как у обычного посетителя.
async function searchImages(BrowserWindow, session, source, query) {
  const config = SOURCES[source];
  if (!config) throw new Error('Неизвестный источник картинок.');
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 1000,
    webPreferences: { sandbox: true, contextIsolation: true, session, backgroundThrottling: false },
  });
  try {
    // Сайт может сам перейти на другой адрес. Для loadURL это сбой, а для нас обычная загрузка.
    await win.loadURL(config.url(query)).catch((err) => {
      if (err.code !== 'ERR_ABORTED') throw err;
    });
    let results = [];
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      // Во время перехода страница недоступна, тогда просто спрашиваем ещё раз.
      const next = cleanResults(await win.webContents.executeJavaScript(config.read).catch(() => []));
      if (next.length && next.length === results.length) break;
      results = next;
      await sleep(500);
    }
    return results;
  } finally {
    win.destroy();
  }
}

function extensionFor(contentType) {
  return EXTENSIONS[String(contentType || '').split(';')[0].trim().toLowerCase()] || null;
}

async function downloadOne(url, dir, fetchFn) {
  if (!/^https:\/\//.test(url || '')) throw new Error('Неверный адрес картинки.');
  const res = await fetchFn(url, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!res.ok) throw new Error(`Сайт не отдал картинку (${res.status}).`);
  const ext = extensionFor(res.headers.get('content-type'));
  if (!ext) throw new Error('По этой ссылке не картинка.');
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_BYTES) throw new Error('Картинка больше 20 МБ.');
  if (!body.length) throw new Error('Сайт отдал пустой файл.');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${crypto.randomUUID()}${ext}`);
  fs.writeFileSync(file, body);
  return file;
}

// Сайты-источники часто не отдают оригинал, тогда берём уменьшенную копию из поиска.
async function downloadImage({ full, thumb }, dir, fetchFn = fetch) {
  try {
    return { file: await downloadOne(full, dir, fetchFn), fromThumb: false };
  } catch (err) {
    if (!thumb) throw err;
    return { file: await downloadOne(thumb, dir, fetchFn), fromThumb: true };
  }
}

// Для автоподбора: скачивает первую подходящую картинку, которой ещё не было.
// Уменьшенную копию берём только в крайнем случае, в видео она будет мутной.
async function autoPick(results, used, dir, fetchFn = fetch) {
  const fresh = results.filter((r) => !used.has(r.full));
  let fallback = null;
  for (const result of fresh.slice(0, 8)) {
    try {
      const picked = await downloadImage(result, dir, fetchFn);
      if (!picked.fromThumb) return { ...picked, url: result.full };
      if (!fallback) fallback = { ...picked, url: result.full };
    } catch { /* эта картинка недоступна, пробуем следующую */ }
  }
  return fallback;
}

module.exports = { searchImages, downloadImage, autoPick, cleanResults, extensionFor };
