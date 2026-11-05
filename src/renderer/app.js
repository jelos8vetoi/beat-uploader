/* global api, BeatText */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const T = BeatText;

const TABS = [['beat', 'Бит'], ['artists', 'Чей тайп'], ['description', 'Описание'], ['links', 'Ссылки'],
  ['tags', 'Теги'], ['media', 'Картинка и плейлисты'], ['publish', 'Публикация'], ['stats', 'Статистика']];
const AUDIO = /\.(mp3|wav|flac|m4a|aac|ogg)$/i;
const IMAGE = /\.(jpe?g|png|webp|bmp)$/i;
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STATUS = { draft: 'Черновик', queued: 'В очереди', uploading: 'Загружается', done: 'Загружен', partial: 'Загружен, есть замечания', error: 'Ошибка' };

const state = { settings: {}, items: [], accounts: [], currentId: null, view: 'editor', tab: 'beat' };
const live = new Map();
const statsCache = new Map();
let autoQueue = Promise.resolve();
let saveTimer;
let settingsTimer;

const current = () => state.items.find((i) => i.id === state.currentId);
const fileName = (p) => String(p || '').split(/[\\/]/).pop();
const fileUrl = (p) => `file:///${p.replace(/\\/g, '/').split('/').map((s, i) => (i === 0 ? s : encodeURIComponent(s))).join('/')}`;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2500);
}

function setStatus(sel, message, kind = '') {
  const el = $(sel);
  el.textContent = message;
  el.className = `status ${kind}`;
}
function showTagStatus(message, kind) {
  setStatus('#tag-status', message, kind);
  setStatus('#tag-status-2', message, kind);
}
const setTagStatus = showTagStatus;

function persist(item) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.saveItem(item), 250);
}

function refreshGenerated(item) {
  if (!item.titleManual) {
    item.title = T.buildTitle(item.titleTemplate || state.settings.titleTemplate, item);
  }
  if (!item.descManual) {
    item.description = T.buildDescription({
      title: item.title, key: item.key, bpm: item.bpm, links: state.settings.links, tags: item.prozavr, counts: state.settings.counts,
    });
  }
  if (!item.playlistsManual) {
    item.playlists = T.buildPlaylistNames(state.settings.playlistTemplate, item.artists).join('\n');
  }
}

const live18n = BeatI18n.createLive(document.body);
const currentLang = () => state.settings.language || (navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en');

function applyLanguage(lang) {
  document.documentElement.lang = lang;
  live18n.setLang(lang);
  $('#lang-ru').setAttribute('aria-pressed', String(lang === 'ru'));
  $('#lang-en').setAttribute('aria-pressed', String(lang === 'en'));
}

const defaultCommentLink = () => (state.settings.links && state.settings.links.beatstars ? 'beatstars' : 'telegram');

async function addBeats(paths) {
  const audio = paths.filter((p) => AUDIO.test(p));
  for (const file of audio) {
    // Новый бит берёт настройки прошлого, а артистов, название, BPM и тональность читает из имени файла.
    const last = state.items[state.items.length - 1];
    const { bpm, key } = T.parseBeatFileName(file);
    const meta = T.parseFileMeta(file);
    const artists = meta.artists.length ? meta.artists.join(', ') : (last ? last.artists : '');
    // Теги прошлого бита подходят, только если артисты те же.
    const sameArtists = last && last.artists === artists;
    const templates = state.settings.titleTemplates || [state.settings.titleTemplate];
    const item = {
      id: await api.newId(), audio: file, image: '',
      name: meta.name || T.uniqueBeatName(state.items.map((i) => i.name)), bpm, key,
      artists,
      titleTemplate: T.pickTemplate(templates, state.items.map((i) => i.titleTemplate)),
      title: '', description: '', ytTags: sameArtists ? last.ytTags : '', playlists: '',
      prozavr: sameArtists && last.prozavr ? JSON.parse(JSON.stringify(last.prozavr)) : { comma: [], lines: [], hashtags: [] },
      mode: last && last.mode !== 'scheduled' ? last.mode : 'public',
      publishAt: '', captions: true, endScreen: true, notify: true,
      short: last ? last.short === true : false,
      firstComment: last ? last.firstComment !== false : true,
      firstCommentText: (last && last.firstCommentText) || BeatI18n.tr('бай', currentLang()),
      firstCommentLink: (last && last.firstCommentLink) || defaultCommentLink(),
      accountId: (last && last.accountId) || (state.accounts[0] && state.accounts[0].id) || '', status: 'draft', done: {},
    };
    refreshGenerated(item);
    state.items.push(item);
    await api.saveItem(item);
    state.currentId = item.id;
    if (state.settings.autoFill !== false && T.parseArtists(item.artists).length) queueAutoFill(item);
  }
  if (audio.length) {
    state.view = 'editor';
    state.tab = 'beat';
    render();
  }
  return audio.length;
}

// Автоподбор идёт по одному биту, чтобы при заливке пачки файлов не перегружать сайты.
function queueAutoFill(item) {
  item.auto = true;
  autoQueue = autoQueue.then(() => runAutoFill(item));
}

async function runAutoFill(item) {
  if (state.items.includes(item)) {
    await fetchTags(item);
    if (!item.image && state.items.includes(item)) {
      const [artist] = T.parseArtists(item.artists);
      const query = T.renderTemplate(state.settings.imageQuery || '{artist} aesthetic', { artist });
      try {
        const file = await api.autoImage(query, state.settings.autoImageSource);
        if (file && !item.image) item.image = file;
      } catch { /* без картинки бит останется черновиком, её можно выбрать вручную */ }
    }
  }
  item.auto = false;
  if (state.items.includes(item)) await api.saveItem(item);
  renderList();
  if (current() === item) renderItem();
}

function setImage(path) {
  const item = current();
  if (!item) return;
  item.image = path;
  persist(item);
  renderItem();
}

function renderTabs() {
  const nav = $('#tabs');
  nav.replaceChildren(...TABS.map(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'tab';
    b.textContent = label;
    b.setAttribute('aria-selected', String(state.tab === id));
    b.onclick = () => {
      state.tab = id;
      renderTabs();
      if (id === 'stats') showStats();
    };
    return b;
  }));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === state.tab));
}

function renderList() {
  $('#beat-list').replaceChildren(...state.items.map((item) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-current', String(state.view === 'editor' && item.id === state.currentId));
    const title = document.createElement('span');
    title.className = 'beat-title';
    title.dataset.noI18n = '';
    title.textContent = item.name || fileName(item.audio);
    const status = document.createElement('span');
    status.className = `beat-status ${item.status}`;
    status.textContent = item.auto ? 'Подбираю теги и фото...' : (STATUS[item.status] || item.status);
    b.append(title, status);
    b.onclick = () => {
      state.currentId = item.id;
      state.view = 'editor';
      render();
      if (state.tab === 'stats') showStats();
    };
    li.append(b);
    return li;
  }));
  $('#open-settings').setAttribute('aria-current', String(state.view === 'settings'));
  $('#open-channel').setAttribute('aria-current', String(state.view === 'channel'));
}

const ADD_CHANNEL = '__add_channel__';

// Подключает канал и возвращает его адрес. Без ключа Google отправляет в настройки.
async function connectChannel(statusSelector) {
  if (!state.settings.googleClientId || !state.settings.hasSecret) {
    state.view = 'settings';
    render();
    setStatus('#settings-status', 'Сначала загрузи ключ Google, потом подключи канал.', 'err');
    return null;
  }
  setStatus(statusSelector, 'Открыл браузер. Войди в аккаунт Google и разреши доступ.');
  try {
    const next = await api.connectAccount();
    applyState(next);
    setStatus(statusSelector, 'Канал подключён.', 'ok');
    return next.lastConnectedId;
  } catch (err) {
    setStatus(statusSelector, cleanError(err), 'err');
    return null;
  }
}

function renderAccounts() {
  const select = $('#account-select');
  const none = new Option('Выбери канал', '');
  select.replaceChildren(none, ...state.accounts.map((a) => new Option(a.title, a.id)), new Option('+ Добавить канал', ADD_CHANNEL));
  const list = $('#accounts');
  if (!state.accounts.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = 'Каналы пока не подключены.';
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(...state.accounts.map((a) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = a.title;
    // Доступ, выданный до перехода проекта в рабочий режим, Google отзовёт через 7 дней.
    const connectedAt = new Date(a.connectedAt || 0).getTime();
    if (connectedAt < new Date(state.settings.productionSince).getTime()) {
      const note = document.createElement('small');
      note.className = 'hint access-note';
      note.textContent = 'Нажми «Подключить канал» один раз, чтобы доступ стал постоянным';
      name.append(note);
    }
    const country = document.createElement('button');
    country.type = 'button';
    country.className = 'ghost';
    country.textContent = 'Поставить страну США';
    country.onclick = async () => {
      try {
        await api.setCountry(a.id);
        setStatus('#settings-status', `Каналу «${a.title}» поставлена страна США.`, 'ok');
      } catch (err) { setStatus('#settings-status', cleanError(err), 'err'); }
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost danger';
    remove.textContent = 'Отключить';
    remove.onclick = async () => { applyState(await api.removeAccount(a.id)); render(); };
    li.append(name, country, remove);
    return li;
  }));
}

function renderItem() {
  const item = current();
  if (!item) return;
  $$('[data-field]').forEach((el) => {
    const value = item[el.dataset.field] || '';
    if (el.value !== value) el.value = value;
  });
  $$('[data-check]').forEach((el) => { el.checked = item[el.dataset.check] !== false; });
  $$('input[name=mode]').forEach((el) => { el.checked = el.value === item.mode; });
  $('#schedule-field').hidden = item.mode !== 'scheduled';
  $('#audio-name').textContent = fileName(item.audio);

  const templates = state.settings.titleTemplates || [state.settings.titleTemplate];
  $('#title-variants').replaceChildren(...templates.map((template) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = T.buildTitle(template, item);
    button.setAttribute('aria-pressed', String(!item.titleManual && (item.titleTemplate || state.settings.titleTemplate) === template));
    button.onclick = () => {
      item.titleTemplate = template;
      item.titleManual = false;
      refreshGenerated(item);
      persist(item);
      renderItem();
    };
    return button;
  }));

  const titleCount = $('#title-count');
  titleCount.textContent = `${(item.title || '').length}/${T.MAX_TITLE}`;
  titleCount.classList.toggle('over', (item.title || '').length > T.MAX_TITLE);
  const tagLen = T.tagsLength(T.splitTags(item.ytTags));
  const tagCount = $('#tags-count');
  tagCount.textContent = `${tagLen}/${T.MAX_TAG_CHARS}`;
  tagCount.classList.toggle('over', tagLen > T.MAX_TAG_CHARS);

  const cover = $('#cover-img');
  cover.hidden = !item.image;
  $('#cover-hint').hidden = Boolean(item.image);
  if (item.image) cover.src = fileUrl(item.image);
  else cover.removeAttribute('src');

  const p = item.prozavr || {};
  $('#prozavr-summary').textContent = (p.comma && p.comma.length)
    ? `prozavr нашёл: ${p.comma.length} тегов, ${p.lines.length} строк, ${p.hashtags.length} хештегов. Они уже в описании.`
    : 'Теги из prozavr пойдут в описание, а теги RapidTags в это поле.';

  const message = T.buildFirstComment({ text: item.firstCommentText, link: item.firstCommentLink, links: state.settings.links });
  const preview = $('#comment-preview');
  const applies = item.mode === 'public' || item.mode === 'scheduled';
  preview.classList.toggle('over', item.firstComment === true && applies && !message);
  if (!applies) preview.textContent = 'Работает только для открытых и запланированных видео.';
  else if (!message) preview.textContent = 'Заполни эту ссылку на вкладке «Ссылки».';
  else if (item.mode === 'scheduled') preview.textContent = `Выйдет после публикации, если приложение будет открыто: ${message}`;
  else preview.textContent = `Будет написано: ${message}`;

  renderProgress(item);
  renderResult(item);
}

function renderProgress(item) {
  const info = live.get(item.id);
  const active = item.status === 'queued' || item.status === 'uploading';
  $('#progress-wrap').hidden = !active;
  $('#upload').disabled = active || item.status === 'done' || Boolean(item.auto);
  $('#upload').textContent = item.auto ? 'Подбираю теги и фото...'
    : item.status === 'done' ? 'Уже на канале'
    : item.status === 'partial' ? 'Повторить незавершённое'
      : item.status === 'error' ? 'Повторить загрузку' : 'Загрузить на YouTube';
  if (active && info) {
    $('#progress-label').textContent = info.label || '';
    $('#progress-bar').style.width = `${Math.round((info.progress || 0) * 100)}%`;
  }
}

function renderResult(item) {
  const box = $('#result');
  const finished = item.done && item.done.videoId;
  if (!finished && item.status !== 'error') { box.hidden = true; return; }
  box.hidden = false;
  const lines = [];
  if (finished) lines.push('Видео уже на канале. Правки здесь на него не влияют: чтобы залить со свежими тегами, сделай новый черновик.');
  if (item.status === 'error') lines.push(`Ошибка: ${item.error}`);
  if (item.warnings && item.warnings.length && item.status === 'partial') lines.push('Не получилось:', ...item.warnings.map((w) => `• ${w}`));
  box.textContent = lines.join('\n');
  if (finished) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'ghost';
    open.textContent = 'Открыть в YouTube Studio';
    open.onclick = () => api.openVideo(item.done.videoId);
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'ghost';
    again.id = 'make-copy';
    again.textContent = 'Новый черновик со свежими тегами';
    again.onclick = () => makeFreshCopy(item);
    const actions = document.createElement('div');
    actions.className = 'row';
    actions.append(open, again);
    if (item.done.shortId) {
      const short = document.createElement('button');
      short.type = 'button';
      short.className = 'ghost';
      short.textContent = 'Открыть шортс';
      short.onclick = () => api.openVideo(item.done.shortId);
      actions.append(short);
    }
    box.append(actions);
  }
}

function renderSettings() {
  const s = state.settings;
  $$('[data-setting]').forEach((el) => {
    if (el.id === 'secret') { el.placeholder = s.hasSecret ? 'Сохранён' : ''; return; }
    el.value = s[el.dataset.setting] == null ? '' : s[el.dataset.setting];
  });
  $$('[data-link]').forEach((el) => { el.value = s.links[el.dataset.link] || ''; });
  $$('[data-count]').forEach((el) => { el.value = s.counts[el.dataset.count]; });
  $('#end-dir').textContent = s.endScreenDir || 'Папка не выбрана';
  $('#templates-input').value = (s.titleTemplates || [s.titleTemplate]).join('\n');
  $('#auto-fill').checked = s.autoFill !== false;
}

function render() {
  const item = current();
  $('#settings').hidden = state.view !== 'settings';
  $('#channel').hidden = state.view !== 'channel';
  $('#editor').hidden = state.view !== 'editor' || !item;
  $('#empty').hidden = state.view !== 'editor' || Boolean(item);
  renderList();
  renderAccounts();
  renderTabs();
  renderItem();
  renderSettings();
}

function applyState(next) {
  state.settings = next.settings;
  state.accounts = next.accounts;
}

const cleanError = (err) => String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function queueSettingsSave(patch) {
  Object.assign(state.settings, patch);
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(async () => {
    const { hasSecret, ...payload } = state.settings;
    const secret = $('#secret').value;
    if (secret) payload.googleClientSecret = secret;
    applyState(await api.saveSettings(payload));
    if (secret) { $('#secret').value = ''; $('#secret').placeholder = 'Сохранён'; }
  }, 300);
  const item = current();
  if (item) { refreshGenerated(item); persist(item); renderItem(); }
}

async function fetchTags(item = current()) {
  if (!item) return;
  // Автоподбор идёт и для бита, который сейчас не открыт: его сообщения не показываем.
  const setTagStatus = (message, kind) => { if (current() === item) showTagStatus(message, kind); };
  if (!T.parseArtists(item.artists).length) { setTagStatus('Сначала впиши артистов.', 'err'); return; }
  const buttons = [$('#generate'), $('#fetch-tags')];
  buttons.forEach((b) => { b.disabled = true; });
  setTagStatus('Подбираю теги на prozavr и RapidTags...');
  try {
    const res = await api.fetchTags(item.artists);
    if (!state.items.includes(item)) return;
    // Новый подбор всегда обновляет описание, иначе свежие теги в него не попадут.
    if (res.prozavr) {
      item.prozavr = res.prozavr;
      item.descManual = false;
    }
    if (res.rapid) item.ytTags = res.rapid.join(', ');
    refreshGenerated(item);
    await api.saveItem(item);
    if (current() === item) renderItem();
    if (res.errors.length) {
      setTagStatus(res.errors.join('\n'), 'err');
    } else {
      // Спокойные пояснения: приложение продолжает работать и без RapidTags.
      const notes = [];
      if (res.loginNote) notes.push(res.loginNote);
      if (res.filledFromProzavr) notes.push('Теги YouTube взяты из prozavr.');
      if (notes.length) setTagStatus(`Теги подобраны.\n${notes.join('\n')}`);
      else setTagStatus('Теги подобраны.', 'ok');
    }
  } catch (err) {
    setTagStatus(cleanError(err), 'err');
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

const locale = () => (currentLang() === 'en' ? 'en-US' : 'ru-RU');
const formatNumber = (value) => (value == null ? 'скрыто' : value.toLocaleString(locale()));
const formatDate = (value) => (value ? new Date(value).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '');
const PRIVACY = { public: 'Открытое', unlisted: 'По ссылке', private: 'Приватное' };

// Текст комментариев пишут чужие люди, поэтому он выводится только как обычный текст.
function commentNode(comment, tag = 'li') {
  const node = document.createElement(tag);
  node.className = 'comment';
  const head = document.createElement('div');
  head.className = 'comment-head';
  const author = document.createElement('strong');
  author.dataset.noI18n = '';
  author.textContent = comment.author;
  const meta = document.createElement('span');
  meta.textContent = `${formatDate(comment.publishedAt)}${comment.likes ? ` · лайков: ${comment.likes}` : ''}`;
  head.append(author, meta);
  const body = document.createElement('p');
  // Чужой текст не переводим, даже если он случайно совпал со строкой интерфейса.
  body.dataset.noI18n = '';
  body.textContent = comment.text;
  node.append(head, body);
  if (comment.replies && comment.replies.length) {
    const replies = document.createElement('ul');
    replies.className = 'replies';
    comment.replies.forEach((reply) => replies.append(commentNode(reply)));
    node.append(replies);
    if (comment.replyCount > comment.replies.length) {
      const more = document.createElement('span');
      more.className = 'hint';
      more.textContent = `Всего ответов: ${comment.replyCount}, остальные видны в YouTube Studio.`;
      node.append(more);
    }
  }
  return node;
}

function paintChannel(data) {
  const number = (v) => (v == null ? '—' : formatNumber(v));
  $('#channel-subs').textContent = data && data.subscribers === null ? 'скрыто' : number(data && data.subscribers);
  $('#channel-views').textContent = number(data && data.views);
  $('#channel-videos').textContent = number(data && data.videos);
  $('#channel-meta').textContent = data ? `обновлено ${formatDate(data.fetchedAt)}` : '';
  const recent = data ? data.recent : [];
  $('#channel-recent').replaceChildren(...recent.map((video) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.onclick = () => api.openVideo(video.id);
    if (video.thumb) {
      const img = document.createElement('img');
      img.src = video.thumb;
      img.alt = '';
      button.append(img);
    }
    const info = document.createElement('span');
    info.className = 'video-info';
    const title = document.createElement('strong');
    title.dataset.noI18n = '';
    title.textContent = video.title;
    const meta = document.createElement('span');
    meta.textContent = [
      `просмотры: ${formatNumber(video.views)}`, `лайки: ${formatNumber(video.likes)}`, `комментарии: ${formatNumber(video.comments)}`,
      PRIVACY[video.privacy] || video.privacy, formatDate(video.publishedAt),
    ].filter(Boolean).join(' · ');
    info.append(title, meta);
    button.append(info);
    li.append(button);
    return li;
  }));
}

function paintTemplates(rows) {
  const list = $('#templates-list');
  const total = rows.reduce((sum, r) => sum + r.videos, 0);
  // «Лучший» показываем, только когда есть что сравнивать: на паре видео вывод случаен.
  const showBest = rows.length >= 2 && rows.every((r) => r.videos >= 3);
  if (!rows.length) $('#templates-status').textContent = 'Цифры появятся, когда видео из приложения станут открытыми.';
  else if (total < 10) $('#templates-status').textContent = `Открытых видео пока ${total}, вывод ещё ненадёжный. Считаются только видео, залитые через приложение.`;
  else $('#templates-status').textContent = 'Отсортировано по просмотрам в день: так честнее сравнивать старые и новые видео.';
  list.replaceChildren(...rows.map((row, index) => {
    const li = document.createElement('li');
    const heading = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = row.template;
    heading.append(title);
    if (showBest && index === 0) {
      const best = document.createElement('span');
      best.className = 'best';
      best.textContent = 'лучший';
      heading.append(best);
    }
    const meta = document.createElement('span');
    meta.textContent = `видео: ${row.videos} · в среднем просмотров: ${formatNumber(row.avgViews)} · в день: ${row.perDay.toLocaleString(locale())}`;
    li.append(heading, meta);
    return li;
  }));
}

async function loadChannel() {
  const select = $('#channel-select');
  const previous = select.value;
  select.replaceChildren(...state.accounts.map((a) => new Option(a.title, a.id)), new Option('+ Добавить канал', ADD_CHANNEL));
  if (previous === ADD_CHANNEL) {
    const id = await connectChannel('#channel-status');
    if (id) {
      select.replaceChildren(...state.accounts.map((a) => new Option(a.title, a.id)), new Option('+ Добавить канал', ADD_CHANNEL));
      select.value = id;
    } else {
      select.selectedIndex = 0;
      return;
    }
  } else if (state.accounts.some((a) => a.id === previous)) {
    select.value = previous;
  }
  if (!state.accounts.length) {
    paintChannel(null);
    setStatus('#channel-status', 'Сначала подключи канал в настройках.');
    return;
  }
  const accountId = select.value;
  setStatus('#channel-status', 'Загружаю...');
  $('#channel-refresh').disabled = true;
  try {
    const data = await api.channelOverview(accountId);
    if (select.value !== accountId) return;
    paintChannel(data);
    setStatus('#channel-status', data.recent.length ? '' : 'На канале пока нет видео.');
    paintTemplates(await api.channelTemplates(accountId));
  } catch (err) {
    setStatus('#channel-status', cleanError(err), 'err');
  } finally {
    $('#channel-refresh').disabled = false;
  }
}

async function findImages(event) {
  event.preventDefault();
  const query = $('#image-query').value.trim();
  if (!query) { setStatus('#image-status', 'Напиши, что искать.', 'err'); return; }
  const source = $('#image-source').value;
  const go = $('#image-go');
  go.disabled = true;
  $('#image-results').replaceChildren();
  setStatus('#image-status', 'Ищу...');
  try {
    const results = await api.searchImages(source, query);
    if (!results.length) {
      setStatus('#image-status', source === 'pinterest'
        ? 'Pinterest ничего не показал. Он иногда просит войти, попробуй поиск в интернете.'
        : 'Ничего не нашлось, попробуй другой запрос.');
      return;
    }
    setStatus('#image-status', 'Нажми на картинку, чтобы поставить её. Проверь, что её можно использовать.');
    $('#image-results').replaceChildren(...results.map((result) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = result.title;
      const img = document.createElement('img');
      img.src = result.thumb;
      img.alt = result.title;
      img.loading = 'lazy';
      img.onerror = () => button.remove();
      button.append(img);
      button.onclick = () => pickImage(result);
      return button;
    }));
  } catch (err) {
    setStatus('#image-status', cleanError(err), 'err');
  } finally {
    go.disabled = false;
  }
}

async function pickImage(result) {
  const item = current();
  if (!item) return;
  setStatus('#image-status', 'Скачиваю картинку...');
  try {
    const { file, fromThumb } = await api.downloadImage(result);
    if (current() && current().id === item.id) setImage(file);
    else { item.image = file; persist(item); }
    setStatus('#image-status', fromThumb ? 'Поставил уменьшенную копию: сайт не отдал оригинал, в видео она может быть мутной.' : 'Картинка поставлена.', fromThumb ? '' : 'ok');
  } catch (err) {
    setStatus('#image-status', cleanError(err), 'err');
  }
}

// Форма ответа. Черновик хранится вне страницы, поэтому переживает перерисовку и «Обновить».
function replyControls(item, entry, comment) {
  const reply = entry.replies[comment.id] || (entry.replies[comment.id] = { open: false, text: '', busy: false, error: '' });
  const repaint = () => paintIfCurrent(item);
  if (!reply.open) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'ghost reply-open';
    open.textContent = 'Ответить';
    open.onclick = () => { reply.open = true; repaint(); };
    return open;
  }
  const box = document.createElement('div');
  box.className = 'reply-box';
  const input = document.createElement('textarea');
  input.value = reply.text;
  input.placeholder = 'Ответ сразу увидят все, от имени канала';
  input.setAttribute('aria-label', `Ответ на комментарий ${comment.author}`);
  input.disabled = reply.busy;
  input.oninput = () => { reply.text = input.value; };
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'primary reply-send';
  send.textContent = reply.busy ? 'Отправляю...' : 'Отправить';
  send.disabled = reply.busy;
  send.onclick = async () => {
    if (!reply.text.trim()) {
      reply.error = 'Напиши текст ответа.';
      repaint();
      return;
    }
    reply.busy = true;
    reply.error = '';
    repaint();
    try {
      const created = await api.replyToComment(item.id, comment.id, reply.text);
      comment.replies = [...(comment.replies || []), created];
      comment.replyCount = (comment.replyCount || 0) + 1;
      Object.assign(reply, { open: false, text: '' });
      toast('Ответ опубликован');
    } catch (err) {
      reply.error = cleanError(err);
    }
    reply.busy = false;
    repaint();
  };
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'ghost';
  cancel.textContent = 'Отмена';
  cancel.disabled = reply.busy;
  cancel.onclick = () => { Object.assign(reply, { open: false, error: '' }); repaint(); };
  const row = document.createElement('div');
  row.className = 'row';
  row.append(send, cancel);
  box.append(input, row);
  if (reply.error) {
    const error = document.createElement('p');
    error.className = 'status err';
    error.textContent = reply.error;
    box.append(error);
  }
  return box;
}

function paintStats(item) {
  const uploaded = Boolean(item.done && item.done.videoId);
  $('#stats-empty').hidden = uploaded;
  $('#stats-body').hidden = !uploaded;
  if (!uploaded) return;
  const data = statsCache.get(item.id) || {};
  const { stats, comments = [], nextPageToken, statsError, commentsError, loading } = data;
  $('#stat-views').textContent = stats ? formatNumber(stats.views) : '—';
  $('#stat-likes').textContent = stats ? formatNumber(stats.likes) : '—';
  $('#stat-comments').textContent = stats ? formatNumber(stats.comments) : '—';
  $('#stats-meta').textContent = stats
    ? [PRIVACY[stats.privacy] || stats.privacy,
      stats.publishAt && `выйдет ${formatDate(stats.publishAt)}`,
      `обновлено ${formatDate(stats.fetchedAt)}`].filter(Boolean).join(' · ')
    : '';
  $('#stats-refresh').disabled = Boolean(loading);
  setStatus('#stats-status', loading ? 'Загружаю...' : (statsError || ''), statsError ? 'err' : '');
  // Отсутствие комментариев у приватного видео не ошибка, поэтому показываем его спокойно.
  setStatus('#comments-status', commentsError || (!loading && stats && !comments.length ? 'Комментариев пока нет.' : ''));
  $('#comments').replaceChildren(...comments.map((c) => {
    const node = commentNode(c);
    node.append(replyControls(item, data, c));
    return node;
  }));
  $('#comments-more').hidden = !nextPageToken;
}

async function loadStats(item) {
  const previous = statsCache.get(item.id);
  const entry = { loading: true, comments: [], replies: previous ? previous.replies : {} };
  statsCache.set(item.id, entry);
  paintIfCurrent(item);
  const [stats, comments] = await Promise.allSettled([api.videoStats(item.id), api.videoComments(item.id)]);
  if (statsCache.get(item.id) !== entry) return;
  entry.loading = false;
  if (stats.status === 'fulfilled') entry.stats = stats.value;
  else entry.statsError = cleanError(stats.reason);
  if (comments.status === 'fulfilled') {
    entry.comments = comments.value.items;
    entry.nextPageToken = comments.value.nextPageToken;
  } else {
    entry.commentsError = cleanError(comments.reason);
  }
  paintIfCurrent(item);
}

function paintIfCurrent(item) {
  if (current() && current().id === item.id) paintStats(item);
}

// Показываем сохранённое сразу, а запрос к YouTube делаем при первом открытии и по кнопке.
function showStats() {
  const item = current();
  if (!item) return;
  paintStats(item);
  if (item.done && item.done.videoId && !statsCache.has(item.id)) loadStats(item);
}

// Залитый бит не меняется: копия становится обычным черновиком и сразу получает свежие теги.
async function makeFreshCopy(item) {
  const copy = {
    ...JSON.parse(JSON.stringify(item)),
    id: await api.newId(), status: 'draft', done: {}, warnings: [], error: null, videoId: null, descManual: false,
  };
  state.items.push(copy);
  await api.saveItem(copy);
  state.currentId = copy.id;
  state.view = 'editor';
  state.tab = 'artists';
  render();
  await fetchTags();
}

function bind() {
  $$('[data-field]').forEach((el) => {
    const handler = () => {
      const item = current();
      if (!item) return;
      const field = el.dataset.field;
      if (field === 'accountId' && el.value === ADD_CHANNEL) {
        el.value = item.accountId || '';
        connectChannel('#account-status').then((id) => {
          if (id) {
            item.accountId = id;
            persist(item);
          }
          renderAccounts();
          if (current()) renderItem();
        });
        return;
      }
      item[field] = el.value;
      if (field === 'title') item.titleManual = true;
      if (field === 'description') item.descManual = true;
      if (field === 'playlists') item.playlistsManual = true;
      refreshGenerated(item);
      persist(item);
      renderItem();
      if (field === 'name') renderList();
    };
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', handler);
  });
  $$('[data-check]').forEach((el) => el.addEventListener('change', () => {
    const item = current();
    item[el.dataset.check] = el.checked;
    persist(item);
  }));
  $$('input[name=mode]').forEach((el) => el.addEventListener('change', () => {
    const item = current();
    item.mode = el.value;
    persist(item);
    renderItem();
  }));

  ['ru', 'en'].forEach((lang) => {
    $(`#lang-${lang}`).onclick = () => {
      queueSettingsSave({ language: lang });
      applyLanguage(lang);
      if (state.view === 'channel') loadChannel();
      else render();
    };
  });
  $('#templates-input').addEventListener('input', (e) => {
    const lines = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length) queueSettingsSave({ titleTemplates: lines, titleTemplate: lines[0] });
  });
  $('#auto-fill').addEventListener('change', (e) => queueSettingsSave({ autoFill: e.target.checked }));
  $$('[data-setting]').forEach((el) => el.addEventListener('input', () => {
    if (el.id === 'secret') { queueSettingsSave({}); return; }
    const value = el.type === 'number' ? Number(el.value) : el.value;
    queueSettingsSave({ [el.dataset.setting]: value });
  }));
  $$('[data-link]').forEach((el) => el.addEventListener('input', () => {
    queueSettingsSave({ links: { ...state.settings.links, [el.dataset.link]: el.value.trim() } });
  }));
  $$('[data-count]').forEach((el) => el.addEventListener('input', () => {
    queueSettingsSave({ counts: { ...state.settings.counts, [el.dataset.count]: Math.max(0, Number(el.value) || 0) } });
  }));

  $('#open-channel').onclick = () => { state.view = 'channel'; render(); loadChannel(); };
  $('#channel-refresh').onclick = loadChannel;
  $('#channel-select').onchange = loadChannel;
  $('#image-form').addEventListener('submit', findImages);
  $('#stats-refresh').onclick = () => loadStats(current());
  $('#comments-more').onclick = async () => {
    const item = current();
    const entry = statsCache.get(item.id);
    if (!entry || !entry.nextPageToken) return;
    $('#comments-more').disabled = true;
    try {
      const page = await api.videoComments(item.id, entry.nextPageToken);
      entry.comments = [...entry.comments, ...page.items];
      entry.nextPageToken = page.nextPageToken;
    } catch (err) {
      entry.commentsError = cleanError(err);
    }
    $('#comments-more').disabled = false;
    paintIfCurrent(item);
  };

  $('#add-beat').onclick = async () => addBeats(await api.pickFile('audio'));
  $('#open-settings').onclick = () => { state.view = 'settings'; render(); };
  $('#pick-image').onclick = async () => {
    const [file] = await api.pickFile('image');
    if (file) setImage(file);
  };
  $('#dice').onclick = () => {
    const item = current();
    item.name = T.uniqueBeatName(state.items.map((i) => i.name));
    refreshGenerated(item);
    persist(item);
    renderItem();
    renderList();
  };
  $('#generate').onclick = () => {
    const item = current();
    if (!item.name) item.name = T.randomBeatName();
    item.titleManual = false;
    refreshGenerated(item);
    renderItem();
    fetchTags();
  };
  $('#reset-title').onclick = () => {
    const item = current();
    item.titleManual = false;
    refreshGenerated(item);
    persist(item);
    renderItem();
  };
  $('#reset-desc').onclick = () => {
    const item = current();
    item.descManual = false;
    refreshGenerated(item);
    persist(item);
    renderItem();
  };
  $('#fetch-tags').onclick = () => fetchTags();
  $('#rapid-login').onclick = async () => {
    try {
      await api.rapidLogin();
      setTagStatus('Войди через Google в открывшемся окне браузера, затем нажми «Подобрать теги».');
    } catch (err) { setTagStatus(cleanError(err), 'err'); }
  };
  $('#use-prozavr').onclick = () => {
    const item = current();
    const tags = (item.prozavr && item.prozavr.comma) || [];
    if (!tags.length) { setTagStatus('Сначала подбери теги, в prozavr пока пусто.', 'err'); return; }
    item.ytTags = T.fitTags(tags).join(', ');
    persist(item);
    renderItem();
  };

  $('#save-draft').onclick = async () => {
    const item = current();
    clearTimeout(saveTimer);
    await api.saveItem(item);
    toast('Черновик сохранён');
  };
  $('#delete-item').onclick = async () => {
    const item = current();
    if (!window.confirm(BeatI18n.tr(`Удалить «${item.name}» из приложения? С YouTube ничего не удалится.`, currentLang()))) return;
    clearTimeout(saveTimer);
    await api.deleteItem(item.id);
    state.items = state.items.filter((x) => x.id !== item.id);
    state.currentId = state.items.length ? state.items[state.items.length - 1].id : null;
    render();
  };
  $('#upload').onclick = async () => {
    const item = current();
    clearTimeout(saveTimer);
    await api.saveItem(item);
    state.tab = 'publish';
    item.status = 'queued';
    live.set(item.id, { label: 'В очереди', progress: 0 });
    render();
    await api.startUpload(item.id);
  };

  $('#connect').onclick = async () => {
    try {
      clearTimeout(settingsTimer);
      const secret = $('#secret').value;
      const { hasSecret, ...payload } = state.settings;
      if (secret) payload.googleClientSecret = secret;
      applyState(await api.saveSettings(payload));
      $('#secret').value = '';
    } catch (err) {
      setStatus('#settings-status', cleanError(err), 'err');
      return;
    }
    await connectChannel('#settings-status');
    render();
  };
  $('#import-key').onclick = async () => {
    try {
      clearTimeout(settingsTimer);
      const next = await api.importKey();
      if (!next) return;
      applyState(next);
      renderSettings();
      setStatus('#settings-status', 'Ключ загружен. Теперь нажми «Подключить канал».', 'ok');
    } catch (err) { setStatus('#settings-status', cleanError(err), 'err'); }
  };
  $('#pick-end-dir').onclick = async () => {
    const dir = await api.pickFolder();
    if (dir) { queueSettingsSave({ endScreenDir: dir }); renderSettings(); }
  };

  window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f));
    const added = await addBeats(paths);
    const image = paths.find((p) => IMAGE.test(p));
    if (image && current()) setImage(image);
    if (!added && !image) toast('Подходят аудио: mp3, wav, flac, m4a, aac, ogg, и картинки: jpg, png, webp');
  });

  api.onUpload((event) => {
    const item = state.items.find((x) => x.id === event.itemId);
    if (!item) return;
    item.status = event.status;
    if (event.done) item.done = event.done;
    if (event.warnings) item.warnings = event.warnings;
    item.error = event.error || null;
    live.set(item.id, { label: event.label, progress: event.progress });
    renderList();
    if (item.id === state.currentId) renderItem();
  });
}

(async function init() {
  $('#keys').replaceChildren(...NOTES.flatMap((n) => [new Option(`${n} minor`), new Option(`${n} major`)]));
  const initial = await api.getState();
  applyState(initial);
  state.items = initial.items;
  // Загрузка, прерванная закрытием приложения, не должна висеть как активная.
  state.items.forEach((i) => {
    if (i.status === 'uploading' || i.status === 'queued') {
      i.status = 'error';
      i.error = 'Приложение было закрыто во время загрузки. Запусти её снова.';
      api.saveItem(i);
    }
  });
  // Биты, созданные до появления первого комментария: незалитым включаем, а залитые не трогаем,
  // иначе на старых видео внезапно появились бы комментарии.
  state.items.forEach((i) => {
    if (i.firstComment === undefined) i.firstComment = !(i.done && i.done.videoId);
    if (i.short === undefined) i.short = false;
    if (!i.firstCommentText) i.firstCommentText = 'бай';
    if (!i.firstCommentLink) i.firstCommentLink = defaultCommentLink();
  });
  // Описания незалитых битов собираем заново, чтобы они сразу получили новые правила.
  state.items.filter((i) => !(i.done && i.done.videoId)).forEach(refreshGenerated);
  state.currentId = state.items.length ? state.items[state.items.length - 1].id : null;
  bind();
  live18n.start();
  applyLanguage(currentLang());
  render();
}());
