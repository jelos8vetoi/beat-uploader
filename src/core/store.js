const fs = require('node:fs');
const path = require('node:path');

const TAG_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_TEMPLATES = [
  '[FREE] {artists} Type Beat - "{name}"',
  '{artists} Type Beat {year} | "{name}"',
  '[FREE] "{name}" - {artists} Type Beat',
  '{artists} Type Beat - {name}',
];

const DEFAULT_SETTINGS = {
  googleClientId: '',
  googleClientSecret: '',
  links: { instagram: '', telegram: '', beatstars: '' },
  titleTemplate: DEFAULT_TEMPLATES[0],
  titleTemplates: DEFAULT_TEMPLATES,
  // С этого момента проект Google в рабочем режиме: доступ, выданный позже, не истекает через 7 дней.
  productionSince: '2026-11-05T14:00:00.000Z',
  autoFill: true,
  autoImageSource: 'web',
  imageQuery: '{artist} aesthetic',
  shortSeconds: 30,
  playlistTemplate: '{artist} Type Beats',
  prozavrKeyword: '{artist} type beat',
  rapidKeyword: '{artist} type beat',
  counts: { comma: 15, lines: 5, hashtags: 3 },
  endScreenDir: '',
  endSeconds: 20,
};

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'data.json');
    this.data = { settings: { ...DEFAULT_SETTINGS }, items: [], accounts: [], tagCache: {}, usedImages: [] };
    if (fs.existsSync(this.file)) {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = {
        items: saved.items || [],
        accounts: saved.accounts || [],
        tagCache: saved.tagCache || {},
        usedImages: saved.usedImages || [],
        settings: {
          ...DEFAULT_SETTINGS,
          ...saved.settings,
          links: { ...DEFAULT_SETTINGS.links, ...(saved.settings && saved.settings.links) },
          counts: { ...DEFAULT_SETTINGS.counts, ...(saved.settings && saved.settings.counts) },
        },
      };
      // Каналы из старой версии подключены без даты и до перехода проекта в рабочий режим.
      this.data.accounts.forEach((a) => { if (!a.connectedAt) a.connectedAt = '2026-11-05T00:00:00.000Z'; });
      // Настройки старой версии: свой шаблон становится первым вариантом.
      if (!saved.settings || !saved.settings.titleTemplates) {
        this.data.settings.titleTemplates = [...new Set([this.data.settings.titleTemplate, ...DEFAULT_TEMPLATES])];
      }
      // Старое значение по умолчанию давало теги не про биты. Переводим один раз,
      // чтобы потом можно было вернуть {artist} вручную.
      if (!this.data.settings.prozavrKeywordMigrated) {
        if (this.data.settings.prozavrKeyword === '{artist}') this.data.settings.prozavrKeyword = DEFAULT_SETTINGS.prozavrKeyword;
        this.data.settings.prozavrKeywordMigrated = true;
      }
    }
  }

  // Запись через временный файл, чтобы сбой не испортил сохранённые данные.
  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // Теги по запросу живут неделю: повторный подбор мгновенный и не тратит лимит RapidTags.
  cachedTags(kind, keyword, now = Date.now()) {
    const hit = this.data.tagCache[`${kind}:${keyword.toLowerCase()}`];
    return hit && now - hit.at < TAG_CACHE_MS ? hit.value : null;
  }

  rememberTags(kind, keyword, value, now = Date.now()) {
    for (const [key, entry] of Object.entries(this.data.tagCache)) {
      if (now - entry.at >= TAG_CACHE_MS) delete this.data.tagCache[key];
    }
    this.data.tagCache[`${kind}:${keyword.toLowerCase()}`] = { at: now, value };
    this.save();
  }

  // Картинки, которые уже ставили, чтобы автоподбор их не повторял.
  rememberImage(url) {
    if (!url || this.data.usedImages.includes(url)) return;
    this.data.usedImages = [...this.data.usedImages, url].slice(-3000);
    this.save();
  }

  upsertItem(item) {
    const i = this.data.items.findIndex((x) => x.id === item.id);
    if (i >= 0) this.data.items[i] = item; else this.data.items.push(item);
    this.save();
    return item;
  }

  patchItem(id, patch) {
    const item = this.data.items.find((x) => x.id === id);
    if (!item) return null;
    Object.assign(item, patch);
    this.save();
    return item;
  }
}

module.exports = { Store, DEFAULT_SETTINGS };
