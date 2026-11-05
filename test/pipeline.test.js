const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ffmpeg = require('ffmpeg-static');
const video = require('../src/core/video');
const { runUpload, dueForFirstComment } = require('../src/core/pipeline');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beat-тест-'));
const make = (args) => assert.equal(spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args]).status, 0);
const audio = path.join(dir, 'бит.wav');
const cover = path.join(dir, 'cover.png');
const endDir = path.join(dir, 'end');
fs.mkdirSync(endDir);
const endImage = path.join(endDir, 'end.png');
const endClip = path.join(dir, 'clip.mp4');
make(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=12', audio]);
make(['-f', 'lavfi', '-i', 'color=blue:s=1000x1000', '-frames:v', '1', cover]);
make(['-f', 'lavfi', '-i', 'color=red:s=1280x720', '-frames:v', '1', endImage]);
make(['-f', 'lavfi', '-i', 'color=red:s=1280x720:d=3', endClip]);

// Цвет кадра в заданную секунду: средний пиксель уменьшенного кадра.
function frameColor(file, t) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1',
    '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const [red, , blue] = r.stdout;
  return red > blue ? 'red' : 'blue';
}

test('видео из бита с картинкой-заставкой: нужная длина и смена кадра', async () => {
  const out = path.join(dir, 'with-image.mp4');
  const duration = await video.probeDuration(audio);
  await video.renderVideo({ audio, image: cover, output: out, duration, endScreen: endImage, endSeconds: 4 });
  assert.ok(Math.abs((await video.probeDuration(out)) - 12) < 0.5);
  assert.equal(frameColor(out, 5), 'blue');
  assert.equal(frameColor(out, 10), 'red');
});

test('заставка-видео включается в конце, после неё кадр не ломается', async () => {
  const out = path.join(dir, 'with-clip.mp4');
  await video.renderVideo({ audio, image: cover, output: out, duration: 12, endScreen: endClip, endSeconds: 5 });
  assert.ok(Math.abs((await video.probeDuration(out)) - 12) < 0.5);
  assert.equal(frameColor(out, 3), 'blue');
  assert.equal(frameColor(out, 8.5), 'red');
});

// Цвет узкой полосы у левого края кадра.
function edgeColor(file, t) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1',
    '-vf', 'crop=20:ih:0:0,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [...r.stdout];
}

test('у квадратной картинки по бокам размытый фон, а не чёрные полосы', async () => {
  const out = path.join(dir, 'blur.mp4');
  await video.renderVideo({ audio, image: cover, output: out, duration: 12, endScreen: null });
  assert.ok(Math.abs((await video.probeDuration(out)) - 12) < 0.5);
  for (const t of [1, 11]) {
    const [, , blue] = edgeColor(out, t);
    assert.ok(blue > 150, `край кадра на ${t} с должен быть синим, а не чёрным: ${blue}`);
  }
});

test('прозрачная картинка рендерится без ошибок и на всю длину', async () => {
  const clear = path.join(dir, 'clear.png');
  make(['-f', 'lavfi', '-i', 'color=black@0.0:s=500x500,format=rgba', '-frames:v', '1', clear]);
  const out = path.join(dir, 'clear.mp4');
  await video.renderVideo({ audio, image: clear, output: out, duration: 12, endScreen: null });
  assert.ok(Math.abs((await video.probeDuration(out)) - 12) < 0.5);
  const [r, g, b] = edgeColor(out, 6);
  assert.ok(r < 30 && g < 30 && b < 30, 'прозрачность должна лечь на чёрную подложку');
});

test('шортс: самый громкий кусок и вертикальное видео нужной длины', async () => {
  assert.equal(video.bestWindow([1, 1, 9, 9, 9, 1], 3), 2);
  assert.equal(video.bestWindow([1, 2], 30), 0);
  // Тихо, громко, тихо: шортс должен начаться на громкой части.
  const mixed = path.join(dir, 'mixed.wav');
  make(['-f', 'lavfi', '-i', 'aevalsrc=if(between(t\\,20\\,30)\\,0.8\\,0.01)*sin(440*2*PI*t):d=40:s=44100', mixed]);
  const out = path.join(dir, 'short.mp4');
  const { start, length } = await video.renderShort({ audio: mixed, image: cover, output: out, seconds: 10 });
  assert.equal(length, 10);
  assert.ok(start >= 19 && start <= 21, `начало ${start}`);
  assert.ok(Math.abs((await video.probeDuration(out)) - 10) < 0.5);
  const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', out], { encoding: 'utf8' }).stderr;
  assert.match(probe, /1080x1920/);
  // Бит короче шортса: берём весь.
  const tiny = await video.renderShort({ audio, image: cover, output: path.join(dir, 'tiny.mp4'), seconds: 60 });
  assert.equal(tiny.start, 0);
  assert.ok(tiny.length >= 11 && tiny.length <= 12);
});

test('обложка получается jpg до 2 МБ', async () => {
  const out = path.join(dir, 'thumb.jpg');
  await video.makeThumbnail(cover, out);
  assert.ok(fs.statSync(out).size <= 2 * 1024 * 1024);
});

function fakeClient({ failThumbOnce = false, addFailures = 0 } = {}) {
  const calls = [];
  let addFails = addFailures;
  let thumbFails = failThumbOnce ? 1 : 0;
  return {
    calls,
    async uploadVideo(file, metadata) { calls.push(['video', fs.statSync(file).size > 0, metadata]); return { id: 'VID' }; },
    async setThumbnail(id) {
      if (thumbFails-- > 0) throw new Error('канал не подтверждён');
      calls.push(['thumb', id]);
    },
    async insertCaption(id, srt) { calls.push(['caption', id, srt]); },
    async listPlaylists() { return [{ id: 'P1', snippet: { title: 'mac miller type beats' } }]; },
    async createPlaylist(title) { calls.push(['create', title]); return { id: 'P2', snippet: { title } }; },
    async insertTopComment(channelId, id, message) { calls.push(['comment', channelId, id, message]); },
    async playlistHasVideo(playlistId) { calls.push(['has', playlistId]); return false; },
    async addToPlaylist(playlistId, id) {
      if (addFails-- > 0) throw new Error('The operation was aborted.');
      calls.push(['add', playlistId, id]);
    },
  };
}

const baseItem = () => ({
  id: 'i1', audio, image: cover, accountId: 'acc', title: 'Drake Type Beat', description: 'd', ytTags: 'a, b',
  mode: 'public', captions: true, endScreen: true, playlists: 'Mac Miller Type Beats\nDrake Type Beats',
});
const settings = { endScreenDir: endDir, endSeconds: 3 };

test('полный путь: видео, обложка, субтитры, плейлисты без лишних созданий', async () => {
  const client = fakeClient();
  const res = await runUpload({ item: baseItem(), settings, client, workDir: dir, report() {}, saveDone() {} });
  assert.equal(res.videoId, 'VID');
  assert.deepEqual(res.warnings, []);
  assert.deepEqual(client.calls.map((c) => c[0]), ['video', 'thumb', 'caption', 'add', 'create', 'add']);
  const [, , metadata] = client.calls[0];
  assert.deepEqual(metadata.snippet.tags, ['a', 'b']);
  assert.ok(client.calls[2][2].includes('Drake Type Beat'));
});

test('повторный запуск не заливает видео второй раз и доделывает упавший шаг', async () => {
  const client = fakeClient({ failThumbOnce: true });
  const item = baseItem();
  const first = await runUpload({ item, settings, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; } });
  assert.equal(first.warnings.length, 1);
  assert.ok(first.warnings[0].includes('обложку'));
  const before = client.calls.length;
  const second = await runUpload({ item, settings, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; } });
  assert.deepEqual(second.warnings, []);
  assert.deepEqual(client.calls.slice(before).map((c) => c[0]), ['thumb']);
});

test('обрыв связи на плейлисте: повтор без второго создания плейлиста', async () => {
  const client = fakeClient({ addFailures: 2 });
  const item = { ...baseItem(), playlists: 'Drake Type Beats', captions: false };
  const res = await runUpload({ item, settings, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; }, retryDelayMs: 1 });
  assert.deepEqual(res.warnings, []);
  assert.equal(client.calls.filter((c) => c[0] === 'create').length, 1);
  assert.equal(client.calls.filter((c) => c[0] === 'add').length, 1);
});

test('сбой одного плейлиста не мешает другому, повторный запуск доделывает только его', async () => {
  const client = fakeClient({ addFailures: 3 });
  const item = baseItem();
  const first = await runUpload({ item, settings, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; }, retryDelayMs: 1 });
  assert.equal(first.warnings.length, 1);
  assert.ok(first.warnings[0].includes('Mac Miller Type Beats'));
  assert.equal(client.calls.filter((c) => c[0] === 'add').length, 1);
  const before = client.calls.length;
  const second = await runUpload({ item, settings, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; }, retryDelayMs: 1 });
  assert.deepEqual(second.warnings, []);
  assert.deepEqual(client.calls.slice(before).map((c) => c[0]), ['add']);
});

test('запрет доступа не повторяется впустую', async () => {
  const client = fakeClient();
  let tries = 0;
  client.addToPlaylist = async () => { tries++; throw Object.assign(new Error('нет доступа'), { status: 403 }); };
  const item = { ...baseItem(), playlists: 'Drake Type Beats' };
  const res = await runUpload({ item, settings, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; }, retryDelayMs: 1 });
  assert.equal(tries, 1);
  assert.equal(res.warnings.length, 1);
});

const commented = (mode, extra = {}) => ({
  ...baseItem(), mode, firstComment: true, firstCommentText: 'бай', firstCommentLink: 'telegram', captions: false, playlists: '', ...extra,
});
const withLinks = { ...settings, links: { telegram: 'demobeats' } };

test('открытое видео получает первый комментарий один раз', async () => {
  const client = fakeClient();
  const item = commented('public');
  await runUpload({ item, settings: withLinks, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; }, retryDelayMs: 1 });
  const comments = client.calls.filter((c) => c[0] === 'comment');
  assert.deepEqual(comments, [['comment', 'acc', 'VID', 'бай https://t.me/demobeats']]);
  await runUpload({ item, settings: withLinks, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; }, retryDelayMs: 1 });
  assert.equal(client.calls.filter((c) => c[0] === 'comment').length, 1);
});

test('приватное и плановое видео не получают комментарий при заливке', async () => {
  for (const mode of ['private', 'unlisted', 'scheduled']) {
    const client = fakeClient();
    const item = commented(mode, { publishAt: new Date(Date.now() + 3600000).toISOString() });
    await runUpload({ item, settings: withLinks, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; }, retryDelayMs: 1 });
    assert.equal(client.calls.filter((c) => c[0] === 'comment').length, 0, mode);
  }
});

test('без заполненной ссылки загрузка не начинается и говорит почему', async () => {
  const client = fakeClient();
  await assert.rejects(
    runUpload({ item: commented('public', { firstCommentLink: 'beatstars' }), settings: withLinks, client, workDir: dir, report() {}, saveDone() {} }),
    /ссылку для первого комментария/,
  );
  assert.equal(client.calls.length, 0);
});

test('шортс заливается отдельным видео без уведомления и не дублируется при повторе', async () => {
  const client = fakeClient();
  const uploads = [];
  client.uploadVideo = async (file, metadata, options) => {
    uploads.push({ title: metadata.snippet.title, notify: options.notifySubscribers, exists: fs.existsSync(file) });
    return { id: uploads.length === 1 ? 'VID' : 'SHORT' };
  };
  const item = commented('public', { short: true, title: 'T'.repeat(100) });
  const res = await runUpload({ item, settings: withLinks, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; }, retryDelayMs: 1 });
  assert.deepEqual(res.warnings, []);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[1].notify, false);
  assert.ok(uploads[1].title.endsWith(' #shorts') && uploads[1].title.length <= 100);
  assert.equal(res.done.shortId, 'SHORT');
  assert.deepEqual(client.calls.filter((c) => c[0] === 'comment').map((c) => c[2]), ['VID', 'SHORT']);
  await runUpload({ item, settings: withLinks, client, workDir: dir, report() {}, saveDone: (d) => { item.done = d; }, retryDelayMs: 1 });
  assert.equal(uploads.length, 2);
});

test('плановый комментарий ждёт выхода видео и не повторяется', () => {
  const at = Date.parse('2026-11-06T18:00:00Z');
  const item = commented('scheduled', { publishAt: new Date(at).toISOString(), status: 'done', done: { videoId: 'V' } });
  assert.equal(dueForFirstComment(item, at - 1000), false);
  assert.equal(dueForFirstComment(item, at + 30000), false);
  assert.equal(dueForFirstComment(item, at + 61000), true);
  assert.equal(dueForFirstComment({ ...item, done: { videoId: 'V', firstComment: true } }, at + 61000), false);
  assert.equal(dueForFirstComment({ ...item, firstCommentAttempts: 10 }, at + 61000), false);
  assert.equal(dueForFirstComment({ ...item, firstComment: false }, at + 61000), false);
  assert.equal(dueForFirstComment({ ...item, firstComment: undefined }, at + 61000), false, 'старые видео не трогаем');
  assert.equal(dueForFirstComment({ ...item, mode: 'private' }, at + 61000), false);
  assert.equal(dueForFirstComment({ ...item, status: 'uploading' }, at + 61000), false);
});

test('без картинки загрузка не начинается', async () => {
  const client = fakeClient();
  await assert.rejects(
    runUpload({ item: { ...baseItem(), image: '' }, settings, client, workDir: dir, report() {}, saveDone() {} }),
    /картинку/,
  );
  assert.equal(client.calls.length, 0);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
