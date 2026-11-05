const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const PROZAVR_URL = 'https://prozavr.ru/tools/podbor_tegov_youtube.php';
const RAPIDTAGS_URL = 'https://rapidtags.io/app/keywords';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Для тегов нужны только страница и её скрипты. Без картинок, шрифтов и рекламы всё грузится быстрее.
const prepared = new WeakSet();
function lightSession(session) {
  if (prepared.has(session)) return session;
  prepared.add(session);
  session.webRequest.onBeforeRequest((details, callback) => {
    const heavy = ['image', 'font', 'media', 'stylesheet', 'subFrame'].includes(details.resourceType);
    const host = new URL(details.url).hostname;
    callback({ cancel: heavy || !(host === 'prozavr.ru' || host.endsWith('.prozavr.ru')) });
  });
  return session;
}

// prozavr: скрытое окно заполняет форму и нажимает кнопку на странице сайта, как обычный посетитель.
async function fetchProzavr(BrowserWindow, session, keyword) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, session: lightSession(session) },
  });
  try {
    await win.loadURL(PROZAVR_URL);
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('prozavr долго не отвечает')), 60000);
      win.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
    });
    await win.webContents.executeJavaScript(`
      document.querySelector('input[name=keyword]').value = ${JSON.stringify(keyword)};
      document.getElementById('id_button').click();
      true;
    `);
    await loaded;
    const areas = await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('textarea')].filter((t) => t.name !== 'links').map((t) => t.value)`,
    );
    if (areas.length < 3 || !areas[0].trim()) throw new Error(`prozavr не вернул теги для «${keyword}»`);
    return {
      comma: areas[0].split(',').map((t) => t.trim()).filter(Boolean),
      lines: areas[1].split('\n').map((t) => t.trim()).filter(Boolean),
      hashtags: areas[2].split(/\s+/).filter(Boolean),
    };
  } finally {
    win.destroy();
  }
}

function findBrowser() {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const relative = ['Google\\Chrome\\Application\\chrome.exe', 'Microsoft\\Edge\\Application\\msedge.exe'];
  for (const rel of relative) {
    for (const root of roots) {
      const full = path.join(root, rel);
      if (fs.existsSync(full)) return full;
    }
  }
  throw new Error('Не нашёл Chrome или Edge на компьютере.');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const LOGIN_MESSAGE = 'Войди в RapidTags в открывшемся окне браузера и нажми «Подобрать теги» ещё раз.';
const LIMIT_MESSAGE = 'закончился дневной лимит бесплатного аккаунта. Запросы вернутся позже.';

function rapidError(message, flags) {
  return Object.assign(new Error(message), flags);
}

// Подбор идёт в браузере без окна с отдельным профилем и после него браузер закрывается.
// Окно появляется, только когда нужен вход: Google не пускает во встроенные окна,
// а вход пользователь выполняет сам.
class RapidTags {
  constructor(profileDir) {
    this.profileDir = profileDir;
    this.proc = null;
    this.port = null;
    this.browser = null;
    this.visible = false;
    this.queue = Promise.resolve();
  }

  async findOpenPort() {
    try {
      const port = Number(fs.readFileSync(path.join(this.profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      return res.ok ? port : null;
    } catch {
      return null;
    }
  }

  async start({ hidden }) {
    if (this.browser && this.browser.isConnected()) return;
    // Окно могло остаться открытым: второй браузер на том же профиле не запустится.
    const openPort = await this.findOpenPort();
    if (openPort) {
      this.port = openPort;
      this.visible = !hidden;
    } else {
      this.port = await freePort();
      this.visible = !hidden;
      this.proc = spawn(findBrowser(), [
        ...(hidden ? ['--headless=new'] : []),
        `--remote-debugging-port=${this.port}`, '--remote-debugging-address=127.0.0.1',
        `--user-data-dir=${this.profileDir}`, '--no-first-run', '--no-default-browser-check',
        ...(hidden ? [] : [RAPIDTAGS_URL]),
      ], { stdio: 'ignore', detached: false });
      await this.waitForPort();
    }
    const { chromium } = require('playwright-core');
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.port}`);
    if (hidden) {
      await this.browser.contexts()[0].route('**/*', (route) => (
        ['image', 'font', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue()
      ));
    }
  }

  async waitForPort() {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${this.port}/json/version`)).ok) return;
      } catch { /* браузер ещё запускается */ }
      await sleep(100);
    }
    throw new Error('Браузер не запустился.');
  }

  // Штатное закрытие сохраняет вход. Если браузер не ответил, закрываем принудительно.
  async shutdown() {
    const { browser, proc, port } = this;
    this.browser = null;
    this.proc = null;
    this.visible = false;
    if (browser) {
      try {
        const cdp = await browser.newBrowserCDPSession();
        await cdp.send('Browser.close');
      } catch { /* браузер уже закрывается */ }
    }
    for (let i = 0; i < 30; i++) {
      const gone = proc ? proc.exitCode !== null : !(await this.portAlive(port));
      if (gone) return;
      await sleep(100);
    }
    if (proc) proc.kill();
  }

  async portAlive(port) {
    try {
      return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(300) })).ok;
    } catch {
      return false;
    }
  }

  openLogin() {
    return this.enqueue(async () => {
      if (!this.visible) await this.shutdown();
      await this.start({ hidden: false });
      const context = this.browser.contexts()[0];
      const page = context.pages().find((p) => p.url().includes('rapidtags.io')) || await context.newPage();
      if (!page.url().includes('rapidtags.io')) await page.goto(RAPIDTAGS_URL);
      await page.bringToFront();
    });
  }

  enqueue(job) {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => {});
    return next;
  }

  // Возвращает теги по найденным запросам и ошибку, из-за которой остальные не получены.
  fetchTags(keywords) {
    return this.enqueue(async () => {
      const found = new Map();
      let error = null;
      try {
        await this.start({ hidden: true });
        const page = await this.browser.contexts()[0].newPage();
        for (const keyword of keywords) {
          found.set(keyword, await this.searchKeyword(page, keyword));
        }
      } catch (err) {
        error = err;
      }
      if (error && error.needsLogin) {
        // Если окно уже открыто, человек может быть на полпути ко входу: его не трогаем.
        if (!this.visible) {
          await this.shutdown();
          await this.start({ hidden: false });
        }
      } else {
        await this.shutdown();
      }
      return { found, error };
    });
  }

  // Каждый запрос идёт с чистой страницы: после обновления RapidTags снова показывает поиск.
  async searchKeyword(page, keyword) {
    await page.goto(RAPIDTAGS_URL, { waitUntil: 'domcontentloaded' });
    const input = page.locator('input[placeholder^="Search a keyword"]');
    const state = await Promise.race([
      input.waitFor({ timeout: 20000 }).then(() => 'ready').catch(() => null),
      page.waitForURL(/\/auth/, { timeout: 20000 }).then(() => 'login').catch(() => null),
    ]);
    if (state === 'login') throw rapidError(LOGIN_MESSAGE, { needsLogin: true });
    if (state !== 'ready') throw new Error('страница RapidTags не загрузилась.');
    await input.fill(keyword);
    await input.press('Enter');

    let tags = [];
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await sleep(400);
      const { next, limit } = await page.evaluate(readResultInPage);
      if (limit) throw rapidError(LIMIT_MESSAGE, { limitReached: true });
      if (next.length && next.length === tags.length) return next;
      tags = next;
    }
    if (tags.length) return tags;
    throw new Error(`сайт не вернул теги для «${keyword}».`);
  }

  // Синхронно, потому что вызывается при закрытии приложения.
  close() {
    if (this.proc && this.proc.exitCode === null) this.proc.kill();
    this.proc = null;
    this.browser = null;
  }
}

/* global document */
// Выполняется на странице. В редакторе у выбранного тега есть кнопка удаления,
// поэтому берём только их: это ровно те теги, что копирует кнопка Copy, без предложений с «+».
function readResultInPage() {
  const next = [...document.querySelectorAll('button')]
    .filter((b) => b.textContent.trim() === 'Delete keyword')
    .map((b) => b.parentElement.querySelector('button').textContent.trim())
    .filter(Boolean);
  return { next, limit: /generation limit reached/i.test(document.body.innerText) };
}

module.exports = { fetchProzavr, RapidTags };
