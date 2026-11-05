const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const text = require('./shared/text');
const i18n = require('./shared/i18n');
const { Store } = require('./core/store');
const { fetchProzavr, RapidTags } = require('./core/tags');
const { authorize, YouTubeClient, parseClientFile } = require('./core/youtube');
const { runUpload, postFirstComment, dueForFirstComment, COMMENT_LABEL, MAX_COMMENT_ATTEMPTS } = require('./core/pipeline');
const { searchImages, downloadImage, autoPick } = require('./core/images');

// Папка данных задана явно: у собранной программы своё имя, а черновики и вход должны остаться.
app.setPath('userData', process.env.BEAT_DATA_DIR || path.join(app.getPath('appData'), 'beat-uploader'));

let win;
let store;
let rapid;
let uploadChain = Promise.resolve();

const seal = (value) => (safeStorage.isEncryptionAvailable()
  ? { enc: safeStorage.encryptString(value).toString('base64') }
  : { plain: value });
const unseal = (box) => (box.enc ? safeStorage.decryptString(Buffer.from(box.enc, 'base64')) : box.plain);

const publicAccounts = () => store.data.accounts.map(({ id, title, connectedAt }) => ({ id, title, connectedAt }));
const publicState = () => {
  const { googleClientSecret, ...settings } = store.data.settings;
  return { settings: { ...settings, hasSecret: Boolean(googleClientSecret) }, items: store.data.items, accounts: publicAccounts() };
};

// Окна выбора файла рисует Windows, поэтому их подписи переводим здесь.
const dialogText = (label) => i18n.tr(label, store.data.settings.language === 'en' ? 'en' : 'ru');

function clientFor(accountId) {
  const account = store.data.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Канал не подключён. Подключи его в настройках.');
  const { googleClientId, googleClientSecret } = store.data.settings;
  return new YouTubeClient({
    clientId: googleClientId,
    clientSecret: unseal(googleClientSecret),
    refreshToken: unseal(account.refresh),
  });
}

async function collectProzavr(keywords) {
  const partition = session.fromPartition('prozavr');
  const settled = await Promise.allSettled(keywords.map(async (keyword) => {
    const cached = store.cachedTags('prozavr', keyword);
    if (cached) return cached;
    const value = await fetchProzavr(BrowserWindow, partition, keyword);
    store.rememberTags('prozavr', keyword, value);
    return value;
  }));
  const lists = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const failed = settled.find((s) => s.status === 'rejected');
  return {
    prozavr: lists.length ? {
      comma: text.mergeRoundRobin(lists.map((l) => text.onlyTypeBeat(l.comma))),
      lines: text.mergeRoundRobin(lists.map((l) => text.onlyTypeBeat(l.lines))),
      hashtags: text.mergeRoundRobin(lists.map((l) => text.onlyTypeBeat(l.hashtags))),
    } : null,
    error: failed ? `prozavr: ${failed.reason.message}` : null,
  };
}

async function collectRapid(keywords) {
  const missing = keywords.filter((keyword) => !store.cachedTags('rapid', keyword));
  let loginNote = null;
  if (missing.length) {
    const { found, error: failure } = await rapid.fetchTags(missing);
    found.forEach((value, keyword) => store.rememberTags('rapid', keyword, value));
    if (failure && failure.needsLogin) loginNote = failure.message;
  }
  const lists = keywords.map((keyword) => store.cachedTags('rapid', keyword)).filter(Boolean);
  return { lists, loginNote };
}

// Комментарий к плановому видео уходит после его выхода, если приложение в это время открыто.
// Сюда же попадают открытые видео, где первая попытка сразу после заливки не удалась.
function queueDueComments() {
  if (!store.data.items.some((item) => dueForFirstComment(item))) return;
  uploadChain = uploadChain.then(async () => {
    for (const item of store.data.items) {
      if (!dueForFirstComment(item)) continue;
      const send = (payload) => { if (win && !win.isDestroyed()) win.webContents.send('upload:event', { itemId: item.id, ...payload }); };
      try {
        await postFirstComment(clientFor(item.accountId), item, store.data.settings);
        const done = { ...item.done, firstComment: true };
        const warnings = (item.warnings || []).filter((w) => !w.startsWith(COMMENT_LABEL));
        const status = warnings.length ? 'partial' : 'done';
        store.patchItem(item.id, { done, warnings, status });
        send({ status, done, warnings, progress: 1, label: 'Готово' });
      } catch (err) {
        const attempts = (item.firstCommentAttempts || 0) + 1;
        const patch = { firstCommentAttempts: attempts };
        if (attempts >= MAX_COMMENT_ATTEMPTS) {
          patch.warnings = [...(item.warnings || []).filter((w) => !w.startsWith(COMMENT_LABEL)), `${COMMENT_LABEL}: ${err.message}`];
          patch.status = 'partial';
        }
        store.patchItem(item.id, patch);
        if (patch.warnings) send({ status: 'partial', warnings: patch.warnings, done: item.done, progress: 1, label: 'Готово' });
      }
    }
  }).catch(() => {});
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240, height: 840, minWidth: 980, minHeight: 640,
    backgroundColor: '#14151a', title: 'Beat Uploader', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function handlers() {
  ipcMain.handle('state:get', () => publicState());

  ipcMain.handle('settings:save', (_e, patch) => {
    const next = { ...patch };
    delete next.hasSecret;
    if (next.googleClientSecret) next.googleClientSecret = seal(next.googleClientSecret);
    else delete next.googleClientSecret;
    Object.assign(store.data.settings, next);
    store.save();
    return publicState();
  });

  ipcMain.handle('settings:importKey', async () => {
    const res = await dialog.showOpenDialog(win, {
      filters: [{ name: dialogText('Файл ключа Google'), extensions: ['json'] }], properties: ['openFile'],
    });
    if (res.canceled) return null;
    const { clientId, clientSecret } = parseClientFile(fs.readFileSync(res.filePaths[0], 'utf8'));
    store.data.settings.googleClientId = clientId;
    store.data.settings.googleClientSecret = seal(clientSecret);
    store.save();
    return publicState();
  });

  ipcMain.handle('item:save', (_e, item) => store.upsertItem(item));
  ipcMain.handle('item:delete', (_e, id) => {
    store.data.items = store.data.items.filter((x) => x.id !== id);
    store.save();
  });

  ipcMain.handle('dialog:file', async (_e, kind) => {
    const filters = kind === 'audio'
      ? [{ name: dialogText('Аудио'), extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] }]
      : [{ name: dialogText('Картинки'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }];
    const properties = kind === 'audio' ? ['openFile', 'multiSelections'] : ['openFile'];
    const res = await dialog.showOpenDialog(win, { filters, properties });
    return res.canceled ? [] : res.filePaths;
  });
  ipcMain.handle('dialog:folder', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('account:connect', async () => {
    const { googleClientId, googleClientSecret } = store.data.settings;
    if (!googleClientId || !googleClientSecret) throw new Error('Сначала впиши Client ID и Client Secret.');
    const clientSecret = unseal(googleClientSecret);
    const tokens = await authorize({ clientId: googleClientId, clientSecret, openUrl: (u) => shell.openExternal(u) });
    if (!tokens.refresh_token) throw new Error('Google не выдал постоянный доступ. Попробуй подключить канал ещё раз.');
    const client = new YouTubeClient({ clientId: googleClientId, clientSecret, refreshToken: tokens.refresh_token });
    const channel = await client.channel();
    store.data.accounts = store.data.accounts.filter((a) => a.id !== channel.id);
    store.data.accounts.push({ ...channel, refresh: seal(tokens.refresh_token), connectedAt: new Date().toISOString() });
    store.save();
    if (win) win.show();
    return { ...publicState(), lastConnectedId: channel.id };
  });
  ipcMain.handle('account:remove', (_e, id) => {
    store.data.accounts = store.data.accounts.filter((a) => a.id !== id);
    store.save();
    return publicState();
  });
  ipcMain.handle('account:country', (_e, id) => clientFor(id).setChannelCountry('US'));

  ipcMain.handle('rapid:login', () => rapid.openLogin());

  ipcMain.handle('tags:fetch', async (_e, artistsText) => {
    const artists = text.parseArtists(artistsText);
    if (!artists.length) throw new Error('Сначала впиши артистов.');
    const { prozavrKeyword, rapidKeyword } = store.data.settings;
    // Сайты опрашиваются одновременно, поэтому ждём только самый медленный.
    const [prozavrResult, rapidResult] = await Promise.all([
      collectProzavr(artists.map((artist) => text.renderTemplate(prozavrKeyword, { artist }))),
      collectRapid(artists.map((artist) => text.renderTemplate(rapidKeyword, { artist }))),
    ]);
    // Ошибкой считаем только prozavr: сбой RapidTags не мешает работе, поле тегов дополняется.
    const errors = [prozavrResult.error].filter(Boolean);
    const { prozavr } = prozavrResult;
    let tags = rapidResult.lists;
    // Если RapidTags ответил не по всем артистам, недостающее берём из prozavr,
    // иначе в поле останутся теги прошлого бита или только одного артиста.
    const incomplete = tags.length < artists.length;
    if (incomplete && prozavr) tags = [...tags, prozavr.comma];
    return {
      prozavr,
      rapid: tags.length ? text.fitTags(text.mergeRoundRobin(tags)) : null,
      filledFromProzavr: incomplete && Boolean(prozavr),
      loginNote: rapidResult.loginNote,
      errors,
    };
  });

  ipcMain.handle('channel:overview', (_e, accountId) => clientFor(accountId).channelOverview());

  ipcMain.handle('images:search', (_e, source, query) => {
    const q = String(query || '').trim();
    if (!q) throw new Error('Напиши, что искать.');
    return searchImages(BrowserWindow, session.fromPartition('imagesearch'), source, q);
  });
  ipcMain.handle('images:download', async (_e, result) => {
    const picked = await downloadImage(result, path.join(app.getPath('userData'), 'images'));
    store.rememberImage(result.full);
    return picked;
  });

  // Автоподбор: сначала выбранный сайт, а если там пусто или всё уже было, другой.
  ipcMain.handle('images:auto', async (_e, query, source) => {
    const partition = session.fromPartition('imagesearch');
    const dir = path.join(app.getPath('userData'), 'images');
    const used = new Set(store.data.usedImages);
    const order = source === 'pinterest' ? ['pinterest', 'web'] : ['web', 'pinterest'];
    for (const site of order) {
      const results = await searchImages(BrowserWindow, partition, site, query).catch(() => []);
      const picked = await autoPick(results, used, dir);
      if (picked) {
        store.rememberImage(picked.url);
        return picked.file;
      }
    }
    return null;
  });

  // Статистика шаблонов считается по битам, залитым через приложение на этот канал.
  ipcMain.handle('channel:templates', async (_e, accountId) => {
    const items = store.data.items.filter((i) => i.accountId === accountId && i.done && i.done.videoId);
    const videos = await clientFor(accountId).videosByIds(items.map((i) => i.done.videoId));
    return text.summarizeTemplates(items, videos);
  });

  ipcMain.handle('video:stats', async (_e, itemId) => {
    const item = store.data.items.find((x) => x.id === itemId);
    if (!item || !item.done || !item.done.videoId) throw new Error('Это видео ещё не залито.');
    return clientFor(item.accountId).videoStats(item.done.videoId);
  });

  ipcMain.handle('video:reply', async (_e, itemId, parentId, rawText) => {
    const item = store.data.items.find((x) => x.id === itemId);
    if (!item || !item.done || !item.done.videoId) throw new Error('Это видео ещё не залито.');
    const replyText = String(rawText || '').trim();
    if (!replyText) throw new Error('Напиши текст ответа.');
    return clientFor(item.accountId).replyToComment(parentId, replyText);
  });

  ipcMain.handle('video:comments', async (_e, itemId, pageToken) => {
    const item = store.data.items.find((x) => x.id === itemId);
    if (!item || !item.done || !item.done.videoId) throw new Error('Это видео ещё не залито.');
    return clientFor(item.accountId).listComments(item.done.videoId, pageToken);
  });

  ipcMain.handle('upload:start', (_e, itemId) => {
    const send = (payload) => { if (win && !win.isDestroyed()) win.webContents.send('upload:event', { itemId, ...payload }); };
    store.patchItem(itemId, { status: 'queued', error: null });
    send({ status: 'queued', label: 'В очереди', progress: 0 });
    // Биты загружаются по одному, чтобы не упираться в лимиты YouTube.
    const job = uploadChain.then(async () => {
      const item = store.data.items.find((x) => x.id === itemId);
      if (!item) return;
      try {
        store.patchItem(itemId, { status: 'uploading' });
        const workDir = path.join(app.getPath('userData'), 'renders');
        fs.mkdirSync(workDir, { recursive: true });
        const { videoId, warnings, done } = await runUpload({
          item,
          settings: store.data.settings,
          client: clientFor(item.accountId),
          workDir,
          report: (stage, progress, label) => send({ status: 'uploading', stage, progress, label }),
          saveDone: (d) => store.patchItem(itemId, { done: d }),
        });
        store.patchItem(itemId, { status: warnings.length ? 'partial' : 'done', warnings, done, videoId });
        send({ status: warnings.length ? 'partial' : 'done', videoId, warnings, done, progress: 1, label: 'Готово' });
      } catch (err) {
        store.patchItem(itemId, { status: 'error', error: err.message });
        send({ status: 'error', error: err.message });
      }
    });
    uploadChain = job;
    return true;
  });

  ipcMain.handle('open:video', (_e, videoId) => {
    if (/^[\w-]+$/.test(videoId)) shell.openExternal(`https://studio.youtube.com/video/${videoId}/edit`);
  });
  ipcMain.handle('open:external', (_e, url) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.handle('id:new', () => crypto.randomUUID());
}

// Два окна писали бы в один файл данных, поэтому второй запуск просто показывает первое окно.
const firstInstance = app.requestSingleInstanceLock();
if (!firstInstance) app.quit();
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  if (!firstInstance) return;
  store = new Store(app.getPath('userData'));
  rapid = new RapidTags(path.join(app.getPath('userData'), 'rapidtags-profile'));
  handlers();
  createWindow();
  setTimeout(queueDueComments, 5000);
  setInterval(queueDueComments, 60000);
});

app.on('window-all-closed', () => {
  if (rapid) rapid.close();
  app.quit();
});
