const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const T = require('../src/shared/text');
const { Store } = require('../src/core/store');
const {
  buildVideoMetadata, parseClientFile, normalizeStats, normalizeComments, normalizeChannel, YouTubeClient, YouTubeError,
} = require('../src/core/youtube');
const images = require('../src/core/images');
const { buildRenderArgs, parseDuration } = require('../src/core/video');

test('артисты разбираются и не дублируются', () => {
  assert.deepEqual(T.parseArtists('Mac Miller, J. Cole x mac miller & Drake'), ['Mac Miller', 'J. Cole', 'Drake']);
});

test('имя с буквой x внутри не разбивается', () => {
  assert.deepEqual(T.parseArtists('Xxxtentacion, Lil Xan'), ['Xxxtentacion', 'Lil Xan']);
});

test('название строится по шаблону', () => {
  const title = T.buildTitle('[FREE] {artists} Type Beat - "{name}"', { artists: 'Drake, Future', name: 'Cold Rain' });
  assert.equal(title, '[FREE] Drake x Future Type Beat - "Cold Rain"');
});

test('длинное название укладывается в 100 символов за счёт артистов', () => {
  const artists = Array.from({ length: 12 }, (_, i) => `Very Long Artist ${i}`).join(', ');
  const title = T.buildTitle('{artists} Type Beat - "{name}"', { artists, name: 'Rain' });
  assert.ok(title.length <= 100);
  assert.ok(title.endsWith('Type Beat - "Rain"'));
});

test('описание идёт в заданном порядке с лимитами 15, 5 и 3', () => {
  const nums = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
  const d = T.buildDescription({
    title: 'My Title', key: 'C minor', bpm: '140',
    links: { instagram: 'https://i', telegram: 'https://t', beatstars: 'https://b' },
    tags: { comma: nums('c', 30), lines: nums('l', 30), hashtags: nums('#h', 30) },
  });
  const blocks = d.split('\n\n');
  assert.equal(blocks[0], 'My Title\nKey: C minor\nBPM: 140');
  assert.equal(blocks[1], 'Instagram: https://i\nTelegram: https://t\nBeatStars: https://b');
  assert.equal(blocks[2].split(', ').length, 15);
  assert.equal(blocks[3].split('\n').length, 5);
  assert.equal(blocks[4], '#h1 #h2 #h3');
});

test('из айди получается полная ссылка, готовая ссылка не меняется', () => {
  assert.equal(T.normalizeLink('instagram', 'demoartist'), 'https://instagram.com/demoartist');
  assert.equal(T.normalizeLink('telegram', '@demobeats'), 'https://t.me/demobeats');
  assert.equal(T.normalizeLink('beatstars', 'vlad'), 'https://www.beatstars.com/vlad');
  assert.equal(T.normalizeLink('telegram', 'https://t.me/demobeats'), 'https://t.me/demobeats');
  assert.equal(T.normalizeLink('instagram', 'instagram.com/vlad'), 'https://instagram.com/vlad');
  assert.equal(T.normalizeLink('instagram', 'vlad.beats'), 'https://instagram.com/vlad.beats');
  assert.equal(T.normalizeLink('instagram', '  '), '');
  const d = T.buildDescription({ title: 't', links: { instagram: 'demoartist', telegram: 'demobeats' } });
  assert.ok(d.includes('Instagram: https://instagram.com/demoartist\nTelegram: https://t.me/demobeats'));
});

test('описание не превышает 5000 байт и без угловых скобок', () => {
  const d = T.buildDescription({ title: '<я>', tags: { comma: Array(3000).fill('тег') }, counts: { comma: 3000 } });
  assert.ok(T.byteLength(d) <= 5000);
  assert.ok(!/[<>]/.test(d));
});

test('теги укладываются в 500 символов по правилам YouTube', () => {
  const tags = T.fitTags(Array.from({ length: 200 }, (_, i) => `mac miller type beat ${i}`));
  assert.ok(T.tagsLength(tags) <= 500);
  assert.ok(tags.length > 5);
  assert.deepEqual(T.fitTags(['a', 'A', 'b']), ['a', 'b']);
});

test('при нехватке места хештеги и строки остаются, а теги не обрываются', () => {
  const comma = Array.from({ length: 300 }, (_, i) => `very long artist name type beat ${i}`);
  const lines = Array.from({ length: 50 }, (_, i) => `line tag type beat ${i}`);
  const d = T.buildDescription({
    title: 'Title', links: { telegram: 'demobeats' },
    tags: { comma, lines, hashtags: ['#a', '#b', '#c', '#d'] }, counts: { comma: 150, lines: 50, hashtags: 3 },
  });
  assert.ok(T.byteLength(d) <= 5000);
  const blocks = d.split('\n\n');
  assert.equal(blocks[4], '#a #b #c');
  assert.equal(blocks[3].split('\n').length, 50);
  const kept = blocks[2].split(', ');
  assert.ok(kept.length > 10 && kept.length < 150);
  assert.ok(kept.every((tag, i) => tag === comma[i]), 'каждый тег остался целым');
});

test('остаются только теги с type beat, в том числе хештеги', () => {
  assert.deepEqual(T.onlyTypeBeat(['tewiq type beat', 'madk1d', 'Free Type Beat']), ['tewiq type beat', 'Free Type Beat']);
  assert.deepEqual(T.onlyTypeBeat(['#tewiqtypebeat', '#tewiq']), ['#tewiqtypebeat']);
  assert.deepEqual(T.onlyTypeBeat(['madk1d', 'tewiq']), ['madk1d', 'tewiq'], 'без подходящих остаётся исходный список');
});

test('результаты артистов чередуются без повторов', () => {
  assert.deepEqual(T.mergeRoundRobin([['a', 'b', 'c'], ['x', 'a']]), ['a', 'x', 'b', 'c']);
});

test('субтитры покрывают весь ролик', () => {
  assert.equal(T.buildSrt('Title', 3725.2), '1\n00:00:00,000 --> 01:02:06,000\nTitle\n');
});

test('плановая публикация ставится как приватная с датой', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  const m = buildVideoMetadata({ title: 't', description: 'd', mode: 'scheduled', publishAt: '2026-11-06T18:00:00Z' }, ['x'], now);
  assert.equal(m.status.privacyStatus, 'private');
  assert.equal(m.status.publishAt, '2026-11-06T18:00:00.000Z');
  assert.equal(m.snippet.categoryId, '10');
  assert.equal(m.status.selfDeclaredMadeForKids, false);
});

test('дата в прошлом отклоняется', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  assert.throws(() => buildVideoMetadata({ title: 't', mode: 'scheduled', publishAt: '2026-11-01T18:00:00Z' }, [], now), /будущем/);
  assert.throws(() => buildVideoMetadata({ title: 't', mode: 'scheduled', publishAt: '' }, [], now), /будущем/);
});

test('заставка начинается за нужное число секунд до конца', () => {
  const args = buildRenderArgs({ audio: 'a.mp3', image: 'c.png', output: 'o.mp4', duration: 100, endScreen: 'e.png', endSeconds: 20 });
  assert.ok(args.join(' ').includes("gte(t,80.00)"));
  const clip = buildRenderArgs({ audio: 'a.mp3', image: 'c.png', output: 'o.mp4', duration: 100, endScreen: 'e.mp4', endSeconds: 20 });
  assert.ok(clip.join(' ').includes('setpts=PTS-STARTPTS+80.00/TB'));
});

test('файл ключа Desktop app читается, чужой файл отклоняется', () => {
  const file = JSON.stringify({ installed: { client_id: 'id', client_secret: 'sec' } });
  assert.deepEqual(parseClientFile(file), { clientId: 'id', clientSecret: 'sec' });
  assert.throws(() => parseClientFile(JSON.stringify({ web: { client_id: 'id', client_secret: 'sec' } })), /Desktop app/);
  assert.throws(() => parseClientFile('не json'), /не JSON/);
});

test('теги запоминаются на неделю, без учёта регистра, и переживают перезапуск', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beat-store-'));
  try {
    const now = Date.parse('2026-11-05T12:00:00Z');
    const day = 24 * 60 * 60 * 1000;
    const store = new Store(dir);
    store.rememberTags('rapid', 'Drake Type Beat', ['a'], now);
    assert.deepEqual(store.cachedTags('rapid', 'drake type beat', now + day), ['a']);
    assert.equal(store.cachedTags('prozavr', 'drake type beat', now), null);
    assert.equal(store.cachedTags('rapid', 'drake type beat', now + 8 * day), null);
    const reopened = new Store(dir);
    assert.deepEqual(reopened.cachedTags('rapid', 'drake type beat', now), ['a']);
    reopened.rememberTags('rapid', 'future type beat', ['b'], now + 8 * day);
    assert.equal(Object.keys(reopened.data.tagCache).length, 1, 'старые записи удаляются');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('статистика: числа из строк, скрытые лайки остаются пустыми', () => {
  const s = normalizeStats({
    statistics: { viewCount: '1200', commentCount: '3' },
    status: { privacyStatus: 'public' },
    snippet: { publishedAt: '2026-11-05T10:00:00Z' },
  });
  assert.equal(s.views, 1200);
  assert.equal(s.comments, 3);
  assert.equal(s.likes, null);
  assert.equal(s.privacy, 'public');
});

test('комментарии: ответы и следующая страница', () => {
  const raw = (id, text) => ({ id, snippet: { authorDisplayName: 'A', textDisplay: text, likeCount: 2, publishedAt: 'd' } });
  const page = normalizeComments({
    nextPageToken: 'N',
    items: [
      { snippet: { topLevelComment: raw('1', 'огонь'), totalReplyCount: 7 }, replies: { comments: [raw('2', 'да')] } },
      { snippet: { topLevelComment: raw('3', 'бит') } },
    ],
  });
  assert.equal(page.nextPageToken, 'N');
  assert.equal(page.items[0].text, 'огонь');
  assert.equal(page.items[0].replyCount, 7);
  assert.equal(page.items[0].replies[0].text, 'да');
  assert.deepEqual(page.items[1].replies, []);
  assert.deepEqual(normalizeComments({}), { nextPageToken: null, items: [] });
});

test('ответ уходит на YouTube правильным запросом', async (t) => {
  const client = new YouTubeClient({ clientId: 'i', clientSecret: 's', refreshToken: 'r' });
  client.accessToken = 'token';
  client.expiresAt = Date.now() + 3600000;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({
      id: 'P.new', snippet: { authorDisplayName: 'Влад', textDisplay: 'спасибо', likeCount: 0, publishedAt: 'd' },
    }));
  });
  const created = await client.replyToComment('PARENT', 'спасибо');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://www.googleapis.com/youtube/v3/comments?part=snippet');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(requests[0].options.body), { snippet: { parentId: 'PARENT', textOriginal: 'спасибо' } });
  assert.deepEqual(created, { id: 'P.new', author: 'Влад', text: 'спасибо', likes: 0, publishedAt: 'd' });
});

test('отказ YouTube на ответ даёт понятное сообщение', async (t) => {
  const client = new YouTubeClient({ clientId: 'i', clientSecret: 's', refreshToken: 'r' });
  client.accessToken = 'token';
  client.expiresAt = Date.now() + 3600000;
  t.mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({ error: { message: 'raw', errors: [{ reason: 'parentCommentNotFound' }] } }), { status: 404 },
  ));
  await assert.rejects(client.replyToComment('X', 'текст'), /уже удалён/);
});

test('BPM и тональность читаются из имени файла, обычные слова не считаются тональностью', () => {
  assert.deepEqual(T.parseBeatFileName('C:\\beats\\Night 140bpm C minor.mp3'), { bpm: '140', key: 'C minor' });
  assert.deepEqual(T.parseBeatFileName('Night_F#min_95 BPM.wav'), { bpm: '95', key: 'F# minor' });
  assert.deepEqual(T.parseBeatFileName('drake 130bpm Cm.mp3'), { bpm: '130', key: 'C minor' });
  assert.deepEqual(T.parseBeatFileName('Am 120bpm.mp3'), { bpm: '120', key: 'A minor' });
  assert.deepEqual(T.parseBeatFileName('Bb major 88bpm.wav'), { bpm: '88', key: 'Bb major' });
  assert.deepEqual(T.parseBeatFileName('Night a 120bpm.mp3'), { bpm: '120', key: '' });
  assert.deepEqual(T.parseBeatFileName('I Am Here Tonight.mp3'), { bpm: '', key: '' });
  assert.deepEqual(T.parseBeatFileName('Slot Music #12 - The Dog House.mp3'), { bpm: '', key: '' });
  assert.deepEqual(T.parseBeatFileName('Good Bad Mind.mp3'), { bpm: '', key: '' });
});

test('артисты и название из имени файла', () => {
  const m = (f) => T.parseFileMeta(f);
  assert.deepEqual(m('C:\\beats\\[FREE] Drake x Future Type Beat - Cold Rain 140bpm Cm.mp3'), { artists: ['Drake', 'Future'], name: 'Cold Rain' });
  assert.deepEqual(m('(FREE) tewiq type beat "Lonely Fire".wav'), { artists: ['tewiq'], name: 'Lonely Fire' });
  assert.deepEqual(m('Mac Miller & J. Cole type beat.mp3'), { artists: ['Mac Miller', 'J. Cole'], name: '' });
  assert.deepEqual(m('2hollis x greyrock - night 130 bpm.mp3'), { artists: ['2hollis', 'greyrock'], name: 'night' });
  assert.deepEqual(m('free_tewiq_type_beat_140bpm.mp3').artists, ['tewiq']);
  assert.deepEqual(m('Slot Music #12 - The Dog House (Main Theme).mp3'), { artists: [], name: '' });
  assert.deepEqual(m('my new beat final.wav'), { artists: [], name: '' });
});

test('названия бита не повторяются, шаблоны идут по очереди', () => {
  let i = 0;
  const seq = [0, 0, 0, 0, 0.5, 0.5];
  const rng = () => seq[i++ % seq.length];
  const first = T.randomBeatName(() => 0);
  const next = T.uniqueBeatName([first.toUpperCase()], rng);
  assert.notEqual(next.toLowerCase(), first.toLowerCase());
  assert.equal(T.pickTemplate(['a', 'b', 'c'], ['a', 'a', 'b']), 'c');
  assert.equal(T.pickTemplate(['a', 'b'], []), 'a');
  assert.equal(T.pickTemplate(['a', 'b'], ['старый', 'a', undefined]), 'b');
});

test('название с годом', () => {
  assert.equal(T.buildTitle('{artists} Type Beat {year}', { artists: 'Drake' }, 2027), 'Drake Type Beat 2027');
});

test('сравнение шаблонов: только открытые видео, по просмотрам в день', () => {
  const now = Date.parse('2026-11-11T00:00:00Z');
  const ago = (d) => new Date(now - d * 86400000).toISOString();
  const item = (id, titleTemplate, extra = {}) => ({ titleTemplate, done: { videoId: id }, ...extra });
  const rows = T.summarizeTemplates(
    [item('1', 'A'), item('2', 'A'), item('3', 'B'), item('4', 'C'), item('5', 'B', { titleManual: true }), item('6', undefined), item('gone', 'D')],
    [
      { id: '1', views: 100, privacy: 'public', publishedAt: ago(10) },
      { id: '2', views: 300, privacy: 'public', publishedAt: ago(10) },
      { id: '3', views: 100, privacy: 'public', publishedAt: ago(1) },
      { id: '4', views: 900, privacy: 'private', publishedAt: ago(1) },
      { id: '5', views: 5, privacy: 'public', publishedAt: ago(1) },
      { id: '6', views: 1, privacy: 'public', publishedAt: ago(1) },
    ],
    now,
  );
  assert.deepEqual(rows.map((r) => r.template), ['B', 'A', 'Своё название', 'Старые видео']);
  assert.deepEqual({ videos: rows[1].videos, avg: rows[1].avgViews, day: rows[1].perDay }, { videos: 2, avg: 200, day: 20 });
});

test('автоподбор фото не берёт уже использованные и предпочитает оригинал', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beat-auto-'));
  try {
    const png = (status = 200) => new Response('img', { status, headers: { 'content-type': 'image/png' } });
    const results = [
      { full: 'https://a/used', thumb: 'https://a/t1' },
      { full: 'https://a/blocked', thumb: 'https://a/t2' },
      { full: 'https://a/ok', thumb: 'https://a/t3' },
    ];
    const picked = await images.autoPick(results, new Set(['https://a/used']), dir, async (url) => (url.endsWith('blocked') ? png(403) : png()));
    assert.equal(picked.url, 'https://a/ok');
    const onlyThumbs = await images.autoPick([results[1]], new Set(), dir, async (url) => (url.endsWith('blocked') ? png(403) : png()));
    assert.equal(onlyThumbs.fromThumb, true);
    assert.equal(await images.autoPick([results[0]], new Set(['https://a/used']), dir, async () => png()), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('настройки старой версии: свой шаблон становится первым вариантом', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beat-mig-'));
  try {
    fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ settings: { titleTemplate: 'МОЙ {artists}' }, items: [], accounts: [] }));
    const store = new Store(dir);
    assert.equal(store.data.settings.titleTemplates[0], 'МОЙ {artists}');
    assert.ok(store.data.settings.titleTemplates.length > 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('первый комментарий: текст и ссылка из айди', () => {
  const links = { telegram: 'demobeats', beatstars: '' };
  assert.equal(T.buildFirstComment({ text: 'бай', link: 'telegram', links }), 'бай https://t.me/demobeats');
  assert.equal(T.buildFirstComment({ text: 'бай', link: 'beatstars', links }), '');
  assert.equal(T.buildFirstComment({ text: '', link: 'telegram', links }), 'https://t.me/demobeats');
});

test('первый комментарий уходит на YouTube правильным запросом', async (t) => {
  const client = new YouTubeClient({ clientId: 'i', clientSecret: 's', refreshToken: 'r' });
  client.accessToken = 'token';
  client.expiresAt = Date.now() + 3600000;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response('{}');
  });
  await client.insertTopComment('CH', 'VID', 'бай https://t.me/x');
  assert.equal(requests[0].url, 'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    snippet: { channelId: 'CH', videoId: 'VID', topLevelComment: { snippet: { textOriginal: 'бай https://t.me/x' } } },
  });
});

test('сводка канала: скрытые подписчики и список видео', () => {
  const data = normalizeChannel(
    { snippet: { title: 'Влад' }, statistics: { hiddenSubscriberCount: true, subscriberCount: '0', viewCount: '100', videoCount: '2' } },
    [{ id: 'v', snippet: { title: 't', publishedAt: 'd', thumbnails: { medium: { url: 'https://x' } } }, status: { privacyStatus: 'public' }, statistics: { viewCount: '5', commentCount: '1' } }],
  );
  assert.equal(data.subscribers, null);
  assert.equal(data.views, 100);
  assert.deepEqual(data.recent[0], { id: 'v', title: 't', thumb: 'https://x', publishedAt: 'd', privacy: 'public', views: 5, likes: null, comments: 1 });
});

test('картинки: чистка выдачи и допустимые типы', () => {
  const list = images.cleanResults([
    { thumb: 'https://a/1', full: 'https://a/1f' }, { thumb: 'https://a/1', full: 'https://a/1f' },
    { thumb: 'http://a/2', full: 'https://a/2f' }, null, { thumb: 'https://a/3' },
  ]);
  assert.deepEqual(list.map((r) => r.full), ['https://a/1f']);
  assert.equal(images.extensionFor('image/jpeg; charset=x'), '.jpg');
  assert.equal(images.extensionFor('text/html'), null);
});

test('картинка: оригинал недоступен, берётся копия, а не картинка отклоняется', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beat-img-'));
  try {
    const answer = (status, type, body = 'img') => new Response(body, { status, headers: { 'content-type': type } });
    const ok = await images.downloadImage({ full: 'https://a/full', thumb: 'https://a/thumb' }, dir, async (url) => (url.endsWith('full') ? answer(403, 'text/html') : answer(200, 'image/png')));
    assert.equal(ok.fromThumb, true);
    assert.ok(ok.file.endsWith('.png') && fs.existsSync(ok.file));
    await assert.rejects(images.downloadImage({ full: 'https://a/x' }, dir, async () => answer(200, 'text/html')), /не картинка/);
    await assert.rejects(images.downloadImage({ full: 'file:///etc/passwd' }, dir, async () => answer(200, 'image/png')), /Неверный адрес/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('отключённые комментарии дают понятное сообщение', () => {
  assert.ok(new YouTubeError('raw', 'commentsDisabled', 403).message.includes('комментарии недоступны'));
});

test('длительность читается из вывода ffmpeg', () => {
  assert.equal(parseDuration('  Duration: 00:03:05.50, start: 0'), 185.5);
  assert.equal(parseDuration('нет данных'), null);
});
