const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');

const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl';
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';

const FRIENDLY = {
  quotaExceeded: 'Дневной лимит YouTube API исчерпан. Он обновится в полночь по тихоокеанскому времени (около 10:00 по Москве).',
  uploadLimitExceeded: 'YouTube временно ограничил число загрузок на этом канале.',
  invalid_grant: 'Доступ к аккаунту истёк. Подключи канал заново в настройках.',
  youtubeSignupRequired: 'У этого аккаунта Google ещё нет канала YouTube. Создай канал и подключи аккаунт заново.',
  invalidPublishAt: 'YouTube не принял время публикации. Выбери время в будущем.',
  thumbnailsNotAccessible: 'Нельзя поставить обложку: подтверди канал по телефону на youtube.com/verify.',
  forbidden: 'YouTube запретил это действие для канала. Проверь, что канал подтверждён на youtube.com/verify.',
  commentsDisabled: 'У этого видео комментарии недоступны. Для приватных видео это нормально.',
  videoNotFound: 'Видео не найдено на YouTube. Возможно, его удалили.',
  parentCommentNotFound: 'Этот комментарий уже удалён. Нажми «Обновить».',
  commentTextTooLong: 'Ответ слишком длинный для YouTube.',
  ineligibleAccount: 'YouTube не разрешает этому аккаунту оставлять комментарии.',
  invalidCommentMetadata: 'YouTube не принял этот ответ.',
  processingFailure: 'YouTube не смог обработать ответ. Попробуй ещё раз.',
};

class YouTubeError extends Error {
  constructor(message, reason, status) {
    super(FRIENDLY[reason] || message);
    this.reason = reason;
    this.status = status;
  }
}

async function parseError(res) {
  const text = await res.text();
  try {
    const body = JSON.parse(text);
    if (typeof body.error === 'string') return new YouTubeError(body.error_description || body.error, body.error, res.status);
    const reason = body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason;
    return new YouTubeError((body.error && body.error.message) || text, reason, res.status);
  } catch {
    return new YouTubeError(`Ошибка YouTube (${res.status}): ${text.slice(0, 200)}`, null, res.status);
  }
}

// Вход через системный браузер: пароль Google приложению не передаётся.
function authorize({ clientId, clientSecret, openUrl }) {
  return new Promise((resolve, reject) => {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    const timer = setTimeout(() => finish(new Error('Время на вход истекло. Попробуй ещё раз.')), 5 * 60 * 1000);
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2 style="font-family:sans-serif">Готово, вернись в приложение. Эту вкладку можно закрыть.<br>Done, return to the app. You can close this tab.</h2>');
      if (url.searchParams.get('state') !== state) return finish(new Error('Ответ Google не прошёл проверку.'));
      const code = url.searchParams.get('code');
      if (!code) return finish(new Error(`Вход отменён: ${url.searchParams.get('error') || 'нет кода'}`));
      try {
        const redirect = `http://127.0.0.1:${server.address().port}/callback`;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          body: new URLSearchParams({
            code, client_id: clientId, client_secret: clientSecret, code_verifier: verifier,
            redirect_uri: redirect, grant_type: 'authorization_code',
          }),
        });
        if (!tokenRes.ok) throw await parseError(tokenRes);
        finish(null, await tokenRes.json());
      } catch (err) { finish(err); }
    });
    function finish(err, value) {
      clearTimeout(timer);
      server.close();
      if (err) reject(err); else resolve(value);
    }
    server.listen(0, '127.0.0.1', () => {
      const params = new URLSearchParams({
        client_id: clientId, redirect_uri: `http://127.0.0.1:${server.address().port}/callback`,
        response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent select_account',
        code_challenge: challenge, code_challenge_method: 'S256', state,
      });
      openUrl(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
  });
}

class YouTubeClient {
  constructor({ clientId, clientSecret, refreshToken }) {
    Object.assign(this, { clientId, clientSecret, refreshToken, accessToken: null, expiresAt: 0 });
  }

  async token() {
    if (this.accessToken && Date.now() < this.expiresAt - 60000) return this.accessToken;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.clientId, client_secret: this.clientSecret,
        refresh_token: this.refreshToken, grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw await parseError(res);
    const body = await res.json();
    this.accessToken = body.access_token;
    this.expiresAt = Date.now() + body.expires_in * 1000;
    return this.accessToken;
  }

  async call(method, url, { json, body, headers } = {}) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json ? JSON.stringify(json) : body,
    });
    if (!res.ok) throw await parseError(res);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  async channel() {
    const { items } = await this.call('GET', `${API}/channels?part=snippet&mine=true`);
    if (!items || !items.length) throw new YouTubeError('', 'youtubeSignupRequired');
    return { id: items[0].id, title: items[0].snippet.title };
  }

  async setChannelCountry(country) {
    const { items } = await this.call('GET', `${API}/channels?part=brandingSettings&mine=true`);
    if (!items || !items.length) throw new YouTubeError('', 'youtubeSignupRequired');
    const channel = items[0];
    channel.brandingSettings.channel.country = country;
    await this.call('PUT', `${API}/channels?part=brandingSettings`, {
      json: { id: channel.id, brandingSettings: channel.brandingSettings },
    });
  }

  async uploadVideo(file, metadata, { notifySubscribers = true, onProgress } = {}) {
    const size = fs.statSync(file).size;
    const params = new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status', notifySubscribers: String(notifySubscribers) });
    const start = await fetch(`${UPLOAD}/videos?${params}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    });
    if (!start.ok) throw await parseError(start);
    const sessionUrl = start.headers.get('location');

    let offset = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        const state = await this.uploadState(sessionUrl, size);
        if (state.video) return state.video;
        offset = state.offset;
      }
      try {
        return await this.putChunk(sessionUrl, file, offset, size, onProgress);
      } catch (err) {
        if (err.status && err.status < 500) throw err;
      }
    }
    throw new Error('Загрузка несколько раз обрывалась. Проверь интернет и запусти её снова.');
  }

  async uploadState(sessionUrl, size) {
    const res = await fetch(sessionUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Range': `bytes */${size}` },
    });
    if (res.status === 200 || res.status === 201) return { video: await res.json() };
    if (res.status !== 308) throw await parseError(res);
    const range = res.headers.get('range');
    return { offset: range ? Number(range.split('-')[1]) + 1 : 0 };
  }

  async putChunk(sessionUrl, file, offset, size, onProgress) {
    const token = await this.token();
    return new Promise((resolve, reject) => {
      const req = https.request(sessionUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'video/mp4',
          'Content-Length': size - offset,
          ...(offset ? { 'Content-Range': `bytes ${offset}-${size - 1}/${size}` } : {}),
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          if (res.statusCode === 200 || res.statusCode === 201) return resolve(JSON.parse(text));
          reject(Object.assign(new Error(`Ошибка загрузки (${res.statusCode}): ${text.slice(0, 200)}`), { status: res.statusCode }));
        });
      });
      req.on('error', reject);
      let sent = offset;
      const stream = fs.createReadStream(file, { start: offset });
      stream.on('data', (chunk) => {
        sent += chunk.length;
        if (onProgress) onProgress(sent / size);
      });
      stream.on('error', reject);
      stream.pipe(req);
    });
  }

  setThumbnail(videoId, buffer) {
    return this.call('POST', `${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
      body: buffer, headers: { 'Content-Type': 'image/jpeg' },
    });
  }

  insertCaption(videoId, srt, { language = 'en', name = 'Title' } = {}) {
    const boundary = `beat${crypto.randomBytes(12).toString('hex')}`;
    const body = [
      `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '',
      JSON.stringify({ snippet: { videoId, language, name } }),
      `--${boundary}`, 'Content-Type: application/octet-stream', '',
      srt,
      `--${boundary}--`, '',
    ].join('\r\n');
    return this.call('POST', `${UPLOAD}/captions?uploadType=multipart&part=snippet`, {
      body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    });
  }

  async listPlaylists() {
    const all = [];
    let pageToken = '';
    do {
      const page = await this.call('GET', `${API}/playlists?part=snippet&mine=true&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`);
      all.push(...(page.items || []));
      pageToken = page.nextPageToken || '';
    } while (pageToken);
    return all;
  }

  createPlaylist(title) {
    return this.call('POST', `${API}/playlists?part=snippet,status`, {
      json: { snippet: { title }, status: { privacyStatus: 'public' } },
    });
  }

  async videoStats(videoId) {
    const { items } = await this.call('GET', `${API}/videos?part=statistics,status,snippet&id=${encodeURIComponent(videoId)}`);
    if (!items || !items.length) throw new YouTubeError('', 'videoNotFound');
    return normalizeStats(items[0]);
  }

  async listComments(videoId, pageToken) {
    const params = new URLSearchParams({
      part: 'snippet,replies', videoId, maxResults: '50', order: 'time', textFormat: 'plainText',
    });
    if (pageToken) params.set('pageToken', pageToken);
    return normalizeComments(await this.call('GET', `${API}/commentThreads?${params}`));
  }

  // Сводка канала: общие цифры и последние видео. Три запроса по одной единице лимита.
  async channelOverview() {
    const { items } = await this.call('GET', `${API}/channels?part=snippet,statistics,contentDetails&mine=true`);
    if (!items || !items.length) throw new YouTubeError('', 'youtubeSignupRequired');
    const channel = items[0];
    const uploads = channel.contentDetails.relatedPlaylists.uploads;
    const list = await this.call('GET', `${API}/playlistItems?part=contentDetails&maxResults=25&playlistId=${encodeURIComponent(uploads)}`);
    const ids = (list.items || []).map((i) => i.contentDetails.videoId);
    const details = ids.length
      ? await this.call('GET', `${API}/videos?part=snippet,statistics,status&id=${ids.join(',')}`)
      : { items: [] };
    return normalizeChannel(channel, details.items || []);
  }

  // Запросы частями: YouTube принимает не больше 50 адресов за раз. Удалённых видео в ответе нет.
  async videosByIds(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const part = ids.slice(i, i + 50).join(',');
      const { items } = await this.call('GET', `${API}/videos?part=snippet,statistics,status&id=${part}`);
      (items || []).forEach((v) => out.push({
        id: v.id,
        views: Number(v.statistics.viewCount || 0),
        privacy: v.status.privacyStatus,
        publishedAt: v.snippet.publishedAt,
      }));
    }
    return out;
  }

  insertTopComment(channelId, videoId, text) {
    return this.call('POST', `${API}/commentThreads?part=snippet`, {
      json: { snippet: { channelId, videoId, topLevelComment: { snippet: { textOriginal: text } } } },
    });
  }

  async replyToComment(parentId, text) {
    const created = await this.call('POST', `${API}/comments?part=snippet`, {
      json: { snippet: { parentId, textOriginal: text } },
    });
    return normalizeComment(created);
  }

  async playlistHasVideo(playlistId, videoId) {
    const params = new URLSearchParams({ part: 'id', playlistId, videoId });
    const { items } = await this.call('GET', `${API}/playlistItems?${params}`);
    return Boolean(items && items.length);
  }

  addToPlaylist(playlistId, videoId) {
    return this.call('POST', `${API}/playlistItems?part=snippet`, {
      json: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } },
    });
  }
}

// YouTube отдаёт числа строками, а скрытые лайки не присылает вовсе: тогда значение null.
function normalizeStats(video) {
  const number = (value) => (value == null ? null : Number(value));
  const { statistics = {}, status = {}, snippet = {} } = video;
  return {
    views: number(statistics.viewCount),
    likes: number(statistics.likeCount),
    comments: number(statistics.commentCount),
    privacy: status.privacyStatus || null,
    publishAt: status.publishAt || null,
    publishedAt: snippet.publishedAt || null,
    fetchedAt: new Date().toISOString(),
  };
}

function normalizeChannel(channel, videos) {
  const number = (value) => (value == null ? null : Number(value));
  const { statistics: s = {} } = channel;
  return {
    title: channel.snippet.title,
    subscribers: s.hiddenSubscriberCount ? null : number(s.subscriberCount),
    views: number(s.viewCount),
    videos: number(s.videoCount),
    fetchedAt: new Date().toISOString(),
    recent: videos.map((v) => ({
      id: v.id,
      title: v.snippet.title,
      thumb: v.snippet.thumbnails && v.snippet.thumbnails.medium && v.snippet.thumbnails.medium.url,
      publishedAt: v.snippet.publishedAt,
      privacy: v.status && v.status.privacyStatus,
      views: number(v.statistics.viewCount),
      likes: number(v.statistics.likeCount),
      comments: number(v.statistics.commentCount),
    })),
  };
}

function normalizeComment(c) {
  return {
    id: c.id,
    author: c.snippet.authorDisplayName,
    text: c.snippet.textDisplay,
    likes: c.snippet.likeCount || 0,
    publishedAt: c.snippet.publishedAt,
  };
}

function normalizeComments(page) {
  const comment = normalizeComment;
  return {
    nextPageToken: page.nextPageToken || null,
    items: (page.items || []).map((thread) => ({
      ...comment(thread.snippet.topLevelComment),
      replyCount: thread.snippet.totalReplyCount || 0,
      replies: ((thread.replies && thread.replies.comments) || []).map(comment),
    })),
  };
}

// API не отдаёт статус «черновик», поэтому черновики хранятся в самом приложении.
function buildVideoMetadata(item, tags, now = Date.now()) {
  const status = { selfDeclaredMadeForKids: false, embeddable: true };
  if (item.mode === 'scheduled') {
    const at = new Date(item.publishAt);
    if (Number.isNaN(at.getTime()) || at.getTime() <= now) throw new Error('Выбери дату публикации в будущем.');
    status.privacyStatus = 'private';
    status.publishAt = at.toISOString();
  } else {
    status.privacyStatus = item.mode === 'private' || item.mode === 'unlisted' ? item.mode : 'public';
  }
  return {
    snippet: { title: item.title, description: item.description, tags, categoryId: '10', defaultLanguage: 'en' },
    status,
  };
}

// Разбирает файл, который Google Cloud отдаёт кнопкой Download JSON для Desktop app.
function parseClientFile(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('Это не файл ключа Google: внутри не JSON.');
  }
  const client = body.installed;
  if (!client || !client.client_id || !client.client_secret) {
    throw new Error('В файле нет ключа Desktop app. Скачай его кнопкой Download JSON у ключа типа Desktop app.');
  }
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

module.exports = {
  authorize, YouTubeClient, YouTubeError, buildVideoMetadata, parseClientFile, normalizeStats, normalizeComments, normalizeChannel,
};
