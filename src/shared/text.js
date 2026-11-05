// Чистая логика текста. Работает и в main-процессе, и в окне приложения.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BeatText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ADJECTIVES = ['Midnight', 'Velvet', 'Silent', 'Golden', 'Broken', 'Faded', 'Neon', 'Lost', 'Cold', 'Hollow',
    'Crimson', 'Distant', 'Paper', 'Silver', 'Burning', 'Quiet', 'Electric', 'Wandering', 'Empty', 'Sunset',
    'Frozen', 'Heavy', 'Lonely', 'Purple', 'Restless', 'Slow', 'Violet', 'Wild', 'Amber', 'Black'];
  const NOUNS = ['Rain', 'Echo', 'Dreams', 'Motion', 'Skyline', 'Shadows', 'Memories', 'Horizon', 'Letters', 'Static',
    'Summer', 'Roses', 'Ghost', 'Avenue', 'Waves', 'Mirror', 'Smoke', 'Tides', 'Pulse', 'Daylight',
    'Thoughts', 'Heart', 'Night', 'Windows', 'Gravity', 'Vision', 'Fire', 'Ocean', 'Moon', 'Road'];

  const MAX_TITLE = 100;
  const MAX_DESCRIPTION_BYTES = 5000;
  const MAX_TAG_CHARS = 500;

  const clean = (s) => String(s == null ? '' : s).replace(/[<>]/g, '').trim();

  function randomBeatName(rng = Math.random) {
    const pick = (list) => list[Math.floor(rng() * list.length)];
    return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
  }

  // Название, которого ещё не было. Вариантов около 900, поэтому повтор почти невозможен.
  function uniqueBeatName(used, rng = Math.random) {
    const taken = new Set([...used].map((n) => String(n).toLowerCase()));
    for (let i = 0; i < 200; i++) {
      const name = randomBeatName(rng);
      if (!taken.has(name.toLowerCase())) return name;
    }
    return randomBeatName(rng);
  }

  // Берём шаблон, который использовался реже всего, чтобы сравнение было честным.
  function pickTemplate(templates, usedTemplates) {
    const counts = new Map(templates.map((t) => [t, 0]));
    usedTemplates.forEach((t) => { if (counts.has(t)) counts.set(t, counts.get(t) + 1); });
    return templates.reduce((best, t) => (counts.get(t) < counts.get(best) ? t : best), templates[0]);
  }

  // Цифры по шаблонам названий: только открытые видео, потому что у остальных нет честных просмотров.
  function summarizeTemplates(items, videos, now = Date.now()) {
    const byId = new Map(videos.map((v) => [v.id, v]));
    const groups = new Map();
    items.forEach((item) => {
      const video = item.done && byId.get(item.done.videoId);
      if (!video || video.privacy !== 'public') return;
      const template = item.titleManual ? 'Своё название' : (item.titleTemplate || 'Старые видео');
      const group = groups.get(template) || { template, videos: 0, views: 0, perDay: 0 };
      const days = Math.max(1, (now - new Date(video.publishedAt).getTime()) / 86400000);
      group.videos += 1;
      group.views += video.views || 0;
      group.perDay += (video.views || 0) / days;
      groups.set(template, group);
    });
    return [...groups.values()]
      .map((g) => ({ ...g, avgViews: Math.round(g.views / g.videos), perDay: Math.round((g.perDay / g.videos) * 10) / 10 }))
      .sort((a, b) => b.perDay - a.perDay || b.avgViews - a.avgViews);
  }

  // Из имени файла вроде «[FREE] Drake x Future Type Beat - Cold Rain 140bpm.mp3»
  // достаёт артистов и название. Без «type beat» или « x » артистов не угадываем.
  function parseFileMeta(file) {
    const raw = String(file || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/_+/g, ' ');
    const tidy = (s) => s
      .replace(/\[[^\]]*\]|\((?:free|prod|with|ft)[^)]*\)/gi, ' ')
      .replace(/\b(?:free|prod\.?\s+by\s+\S+)\b/gi, ' ')
      .replace(/\d{2,3}\s*bpm\b/gi, ' ')
      .replace(/\b[A-G](?:#|b)?\s*(?:major|minor|maj|min)\b/g, ' ')
      .replace(/[_]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '');
    const realArtist = (a) => a.length >= 2 && a.length <= 40 && !/^\d+$/.test(a);
    const typeBeat = /^(.*?)\btype\s*beat\b(.*)$/i.exec(raw);
    let artists = [];
    let rest = '';
    if (typeBeat) {
      artists = parseArtists(tidy(typeBeat[1]));
      rest = typeBeat[2];
    } else {
      const [head, ...tail] = raw.split(/\s[-–—]\s/);
      if (/\s+x\s+/i.test(tidy(head))) {
        artists = parseArtists(tidy(head));
        rest = tail.join(' - ');
      }
    }
    const quoted = /["«“']([^"»”']{2,40})["»”']/.exec(rest);
    const name = quoted ? quoted[1].trim() : tidy(rest).replace(/^[A-G](?:#|b)?m?\s+|\s+[A-G](?:#|b)?m?$/g, '').trim();
    return { artists: artists.filter(realArtist), name: name.length >= 2 && name.length <= 40 && !/^\d+$/.test(name) ? name : '' };
  }

  function parseArtists(input) {
    const seen = new Set();
    return String(input || '')
      .split(/[,;\n&]|\s+x\s+/i)
      .map((a) => a.trim())
      .filter((a) => {
        const key = a.toLowerCase();
        if (!a || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function renderTemplate(template, vars) {
    return String(template || '').replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
  }

  // Если название не влезает в лимит YouTube, сначала убираем последних артистов.
  function buildTitle(template, { artists, name, bpm, key }, year = new Date().getFullYear()) {
    const list = parseArtists(artists);
    for (let n = list.length; n >= 0; n--) {
      const title = clean(renderTemplate(template, {
        artists: list.slice(0, n).join(' x '), name: clean(name), bpm: clean(bpm), key: clean(key), year,
      })).replace(/\s{2,}/g, ' ');
      if (title.length <= MAX_TITLE) return title;
      if (n === 0) return title.slice(0, MAX_TITLE).trim();
    }
    return '';
  }

  function buildPlaylistNames(template, artists) {
    return parseArtists(artists).map((artist) => clean(renderTemplate(template, { artist })));
  }

  function splitTags(text) {
    return String(text || '').split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
  }

  function byteLength(s) {
    let n = 0;
    for (const ch of s) {
      const c = ch.codePointAt(0);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    }
    return n;
  }

  function truncateBytes(s, limit) {
    let n = 0;
    let out = '';
    for (const ch of s) {
      n += byteLength(ch);
      if (n > limit) break;
      out += ch;
    }
    return out.trimEnd();
  }

  const LINK_BASES = {
    instagram: 'https://instagram.com/',
    telegram: 'https://t.me/',
    beatstars: 'https://www.beatstars.com/',
  };

  // Из айди делает полную ссылку, готовую ссылку оставляет как есть.
  function normalizeLink(kind, value) {
    const text = clean(value);
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    if (/^[\w-]+(\.[\w-]+)+\//.test(text)) return `https://${text}`;
    return LINK_BASES[kind] + text.replace(/^@/, '');
  }

  // Текст и ссылка для первого комментария. Пустая строка значит, что ссылка не заполнена.
  function buildFirstComment({ text, link, links = {} }) {
    const url = normalizeLink(link, links[link]);
    return url ? `${clean(text)} ${url}`.trim() : '';
  }

  // Достаёт BPM и тональность из имени файла вроде «Night 140bpm C minor.mp3».
  function parseBeatFileName(file) {
    const name = String(file || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    const bpmMatch = /(?:^|[^\d])(\d{2,3})\s*bpm\b/i.exec(name) || /\bbpm\s*(\d{2,3})\b/i.exec(name);
    const note = (letter, sign) => letter.toUpperCase() + (sign || '');
    const full = /(?:^|[\s_\-(])([A-Ga-g])(#|b)?[\s_-]*(major|minor|maj|min)(?=$|[\s_)\-])/i.exec(name);
    // Короткая запись вроде «Cm» бывает и обычным словом, поэтому верим ей только рядом с BPM.
    const short = /[Bb][Pp][Mm][\s_-]+([A-G])(#|b)?(m)?(?=$|[\s_)-])/.exec(name)
      || /(?:^|[\s_(-])([A-G])(#|b)?(m)?[\s_-]+\d{2,3}\s*[Bb][Pp][Mm](?=$|[\s_)-])/.exec(name);
    let key = '';
    if (full) key = `${note(full[1], full[2])} ${/^min/i.test(full[3]) ? 'minor' : 'major'}`;
    else if (short) key = `${note(short[1], short[2])} ${short[3] ? 'minor' : 'major'}`;
    return { bpm: bpmMatch ? bpmMatch[1] : '', key };
  }

  // Порядок блоков задан пользователем: название, тональность и BPM, ссылки, затем теги.
  function buildDescription({ title, key, bpm, links = {}, tags = {}, counts = {} }) {
    const linkLines = [['instagram', 'Instagram'], ['telegram', 'Telegram'], ['beatstars', 'BeatStars']]
      .map(([kind, label]) => [label, normalizeLink(kind, links[kind])])
      .filter(([, url]) => url)
      .map(([label, url]) => `${label}: ${url}`);
    const head = [clean(title), key && `Key: ${clean(key)}`, bpm && `BPM: ${clean(bpm)}`].filter(Boolean);
    const comma = (tags.comma || []).slice(0, counts.comma == null ? 15 : counts.comma);
    const lines = (tags.lines || []).slice(0, counts.lines == null ? 5 : counts.lines);
    const hashtags = (tags.hashtags || []).slice(0, counts.hashtags == null ? 3 : counts.hashtags);
    const compose = () => [
      head.join('\n'),
      linkLines.join('\n'),
      comma.join(', '),
      lines.join('\n'),
      hashtags.join(' '),
    ].filter(Boolean).join('\n\n').replace(/[<>]/g, '');
    // Лимит YouTube: убираем целые теги с конца длинного блока, чтобы хештеги внизу не пропали.
    let text = compose();
    while (byteLength(text) > MAX_DESCRIPTION_BYTES && (comma.length || lines.length)) {
      (comma.length ? comma : lines).pop();
      text = compose();
    }
    return truncateBytes(text, MAX_DESCRIPTION_BYTES);
  }

  // Оставляет только теги про биты. Если таких нет совсем, лучше обычные теги, чем пустое описание.
  function onlyTypeBeat(list) {
    const matched = list.filter((tag) => /type\s*beat/i.test(tag));
    return matched.length ? matched : list;
  }

  // Чередуем результаты артистов, чтобы первый артист не занял весь список.
  function mergeRoundRobin(lists) {
    const seen = new Set();
    const out = [];
    const longest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < longest; i++) {
      for (const list of lists) {
        const value = list[i];
        if (value == null) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
      }
    }
    return out;
  }

  // YouTube считает лимит 500 с запятыми и кавычками вокруг тегов с пробелами.
  const tagCost = (tag) => tag.length + (/\s/.test(tag) ? 2 : 0);
  function tagsLength(tags) {
    return tags.reduce((sum, t, i) => sum + tagCost(t) + (i ? 1 : 0), 0);
  }
  function fitTags(tags, limit = MAX_TAG_CHARS) {
    const seen = new Set();
    const out = [];
    for (const raw of tags) {
      const tag = clean(raw);
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) continue;
      if (tagsLength([...out, tag]) > limit) continue;
      seen.add(key);
      out.push(tag);
    }
    return out;
  }

  function buildSrt(title, durationSec) {
    const total = Math.max(1, Math.ceil(durationSec));
    const pad = (n) => String(n).padStart(2, '0');
    const end = `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)},000`;
    return `1\n00:00:00,000 --> ${end}\n${clean(title)}\n`;
  }

  return {
    MAX_TITLE, MAX_TAG_CHARS, randomBeatName, uniqueBeatName, pickTemplate, summarizeTemplates, parseFileMeta, parseArtists, renderTemplate, buildTitle, buildPlaylistNames,
    splitTags, normalizeLink, onlyTypeBeat, buildFirstComment, parseBeatFileName, buildDescription, mergeRoundRobin, tagsLength, fitTags, buildSrt, byteLength,
  };
});
