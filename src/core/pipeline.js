const fs = require('node:fs');
const path = require('node:path');
const text = require('../shared/text');
const video = require('./video');
const { buildVideoMetadata } = require('./youtube');

function validate(item, settings = {}) {
  const problems = [];
  if (wantsFirstComment(item) && !text.buildFirstComment({ text: item.firstCommentText, link: item.firstCommentLink, links: settings.links })) {
    problems.push('заполни ссылку для первого комментария или выключи его');
  }
  if (!item.accountId) problems.push('выбери канал');
  if (!item.audio || !fs.existsSync(item.audio)) problems.push('файл бита не найден');
  if (!item.image || !fs.existsSync(item.image)) problems.push('добавь картинку');
  if (!item.title || !item.title.trim()) problems.push('нет названия');
  if (item.title && item.title.length > text.MAX_TITLE) problems.push('название длиннее 100 символов');
  return problems;
}

// Обрыв связи и сбои YouTube проходят при повторе, а исчерпанный лимит или запрет доступа нет.
async function withRetry(fn, delayMs, attempts = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const permanent = err.status === 401 || err.status === 403 || err.reason === 'invalid_grant';
      if (permanent || attempt + 1 >= attempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
}

// Каждый шаг отмечается в item.done. Повторный запуск пропускает готовые шаги
// и не создаёт второе видео на канале.
async function runUpload({ item, settings, client, workDir, report, saveDone, retryDelayMs = 3000 }) {
  // Уже залитому биту незаполненная ссылка не мешает: комментарий просто выдаст замечание.
  const problems = (item.done && item.done.videoId) ? [] : validate(item, settings);
  if (problems.length) throw new Error(`Не хватает данных: ${problems.join(', ')}.`);

  const done = { ...(item.done || {}) };
  const warnings = [];
  const mark = (patch) => { Object.assign(done, patch); saveDone(done); };
  const duration = done.duration || await video.probeDuration(item.audio);
  const output = path.join(workDir, `${item.id}.mp4`);

  if (!done.videoId) {
    // Метаданные проверяем до рендера, чтобы не собирать видео зря.
    const metadata = buildVideoMetadata(item, text.fitTags(text.splitTags(item.ytTags)));
    const endScreen = item.endScreen ? video.pickRandomEndScreen(settings.endScreenDir) : null;
    if (item.endScreen && !endScreen) warnings.push('Папка с заставками пуста или не выбрана, видео собрано без заставки.');
    report('render', 0, 'Собираю видео');
    await video.renderVideo({
      audio: item.audio, image: item.image, output, duration, endScreen, endSeconds: settings.endSeconds,
    }, (p) => report('render', p, 'Собираю видео'));
    report('upload', 0, 'Загружаю на YouTube');
    const uploaded = await client.uploadVideo(output, metadata, {
      notifySubscribers: item.notify !== false,
      onProgress: (p) => report('upload', p, 'Загружаю на YouTube'),
    });
    mark({ videoId: uploaded.id, duration });
    fs.rmSync(output, { force: true });
  }
  const { videoId } = done;

  // Видео уже на канале, поэтому ошибка следующего шага не должна обрывать остальные.
  const step = async (key, label, fn) => {
    if (done[key]) return;
    report(key, 1, label);
    try {
      await fn();
      mark({ [key]: true });
    } catch (err) {
      warnings.push(`${label}: ${err.message}`);
    }
  };

  await step('thumbnail', 'Ставлю обложку', async () => {
    const thumb = path.join(workDir, `${item.id}-thumb.jpg`);
    await video.makeThumbnail(item.image, thumb);
    try {
      await client.setThumbnail(videoId, fs.readFileSync(thumb));
    } finally {
      fs.rmSync(thumb, { force: true });
    }
  });

  if (item.captions !== false) {
    await step('captions', 'Добавляю субтитры', () => client.insertCaption(videoId, text.buildSrt(item.title, duration)));
  }

  // Адрес созданного плейлиста запоминаем сразу: при повторе нельзя создать его второй раз.
  const addToNamedPlaylist = async (name, attempt) => {
    const idKey = `playlistId:${name}`;
    if (!done[idKey]) {
      const existing = await client.listPlaylists();
      const found = existing.find((p) => p.snippet.title.toLowerCase() === name.toLowerCase());
      mark({ [idKey]: (found || await client.createPlaylist(name)).id });
    }
    // Если связь оборвалась после ответа сервера, видео уже может быть в плейлисте.
    const already = attempt > 0 && await client.playlistHasVideo(done[idKey], videoId);
    if (!already) await client.addToPlaylist(done[idKey], videoId);
    mark({ [`playlist:${name}`]: true });
  };

  const names = [...new Set(String(item.playlists || '').split('\n').map((n) => n.trim()).filter(Boolean))];
  if (names.length) {
    await step('playlists', 'Добавляю в плейлисты', async () => {
      const failed = [];
      // Ошибка одного плейлиста не должна мешать остальным.
      for (const name of names) {
        if (done[`playlist:${name}`]) continue;
        try {
          await withRetry((attempt) => addToNamedPlaylist(name, attempt), retryDelayMs);
        } catch (err) {
          failed.push(`«${name}»: ${err.message}`);
        }
      }
      if (failed.length) throw new Error(failed.join('; '));
    });
  }

  // Сразу комментируем только открытое видео. Плановое подождёт публикации: см. dueForFirstComment.
  if (wantsFirstComment(item) && item.mode === 'public') {
    await step('firstComment', COMMENT_LABEL, () => withRetry(
      () => postFirstComment(client, item, settings),
      retryDelayMs,
    ));
  }

  if (item.short === true) {
    await step('short', 'Шортс', async () => {
      if (!done.shortId) {
        const output = path.join(workDir, `${item.id}-short.mp4`);
        report('short', 0, 'Собираю шортс');
        await video.renderShort({ audio: item.audio, image: item.image, output, seconds: settings.shortSeconds || 30 });
        // Подписчикам не нужно второе уведомление об одном бите.
        const title = `${item.title.slice(0, text.MAX_TITLE - 8).trim()} #shorts`;
        const metadata = buildVideoMetadata({ ...item, title }, text.fitTags(text.splitTags(item.ytTags)));
        report('short', 0, 'Загружаю шортс');
        const uploaded = await client.uploadVideo(output, metadata, {
          notifySubscribers: false,
          onProgress: (p) => report('short', p, 'Загружаю шортс'),
        });
        mark({ shortId: uploaded.id });
        fs.rmSync(output, { force: true });
      }
      if (wantsFirstComment(item) && item.mode === 'public' && !done.shortComment) {
        const message = text.buildFirstComment({ text: item.firstCommentText, link: item.firstCommentLink, links: settings.links });
        await withRetry(() => client.insertTopComment(item.accountId, done.shortId, message), retryDelayMs);
        mark({ shortComment: true });
      }
    });
  }

  return { videoId, warnings, done };
}

const COMMENT_LABEL = 'Первый комментарий';
const MAX_COMMENT_ATTEMPTS = 10;

// Только открытые и плановые видео: у приватных комментарии закрыты.
function wantsFirstComment(item) {
  return item.firstComment === true && (item.mode === 'public' || item.mode === 'scheduled');
}

async function postFirstComment(client, item, settings) {
  const message = text.buildFirstComment({ text: item.firstCommentText, link: item.firstCommentLink, links: settings.links });
  if (!message) throw new Error('не заполнена ссылка для комментария.');
  // Канал берём из бита: videoId мог уже быть записан в done после загрузки.
  const videoId = (item.done && item.done.videoId) || item.videoId;
  await client.insertTopComment(item.accountId, videoId, message);
}

// Нужно ли сейчас отправить комментарий: плановое видео ждём минуту после времени публикации.
function dueForFirstComment(item, now = Date.now()) {
  if (!wantsFirstComment(item) || !item.done || !item.done.videoId || item.done.firstComment) return false;
  if (item.status === 'uploading' || item.status === 'queued') return false;
  if ((item.firstCommentAttempts || 0) >= MAX_COMMENT_ATTEMPTS) return false;
  if (item.mode === 'scheduled') return now >= new Date(item.publishAt).getTime() + 60000;
  return true;
}

module.exports = { runUpload, validate, postFirstComment, dueForFirstComment, wantsFirstComment, COMMENT_LABEL, MAX_COMMENT_ATTEMPTS };
