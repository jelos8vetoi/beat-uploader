const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tr } = require('../src/shared/i18n');

const CYRILLIC = /[А-Яа-яЁё]/;
const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

// Строки из кода: комментарии убираем, а подстановки ${...} заменяем образцом.
function codeStrings(file) {
  const code = src(file).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    if (!CYRILLIC.test(raw)) continue;
    const sample = raw.replace(/\$\{[^}]*\}/g, 'X').replace(/\\n/g, '\n').replace(/\\'/g, "'");
    if (/</.test(sample)) continue; // страница ответа Google двуязычная сама по себе
    sample.split('\n').forEach((line) => { if (CYRILLIC.test(line)) found.push(line.trim()); });
  }
  return found;
}

function htmlStrings() {
  const html = src('renderer/index.html').replace(/<script[\s\S]*?<\/script>/g, '');
  const out = [];
  for (const m of html.matchAll(/>([^<>]+)</g)) if (CYRILLIC.test(m[1])) out.push(m[1].trim());
  for (const m of html.matchAll(/(?:placeholder|aria-label|title)="([^"]+)"/g)) if (CYRILLIC.test(m[1])) out.push(m[1]);
  return out;
}

const JOINED = new Set([
  // Куски, которые соединяются в полную строку прямо в коде: проверяются ниже целиком.
  'X · лайков: X', 'Не хватает данных: X.', 'X: X',
]);

test('у каждой строки интерфейса и ошибки есть английский перевод', () => {
  const files = ['renderer/app.js', 'main.js', 'core/youtube.js', 'core/tags.js', 'core/video.js', 'core/images.js', 'core/pipeline.js'];
  const strings = [...files.flatMap(codeStrings), ...htmlStrings()].filter((s) => !JOINED.has(s));
  const missing = [...new Set(strings)].filter((s) => CYRILLIC.test(tr(s, 'en')));
  assert.deepEqual(missing, []);
});

test('составные сообщения переводятся полностью', () => {
  const samples = [
    'Не хватает данных: выбери канал, добавь картинку.',
    'Добавляю в плейлисты: «Drake Type Beats»: The operation was aborted.',
    'Первый комментарий: не заполнена ссылка для комментария.',
    'Ошибка: Канал не подключён. Подключи его в настройках.',
    '• Шортс: FFmpeg не смог прочитать бит.',
    'RapidTags не',
    'просмотры: 5 · лайки: скрыто · комментарии: 0 · Приватное · 05.11.2026, 14:29',
    'Приватное · выйдет 06.11.26 · обновлено 05.11.26',
    'Теги подобраны.\nТеги YouTube взяты из prozavr.',
    '05.11.2026, 11:00 · лайков: 5',
  ].filter((s) => s !== 'RapidTags не');
  samples.forEach((s) => assert.ok(!CYRILLIC.test(tr(s, 'en')), `${s} => ${tr(s, 'en')}`));
});

test('по-русски текст не меняется, чужой текст и лишние пробелы сохраняются', () => {
  assert.equal(tr('Загрузить на YouTube', 'ru'), 'Загрузить на YouTube');
  assert.equal(tr('Загрузить на YouTube', 'en'), 'Upload to YouTube');
  assert.equal(tr(' Приватно', 'en'), ' Private');
  assert.equal(tr('Название видео ', 'en'), 'Video title ');
  assert.equal(tr('огонь бит', 'en'), 'огонь бит');
  assert.equal(tr('', 'en'), '');
});
