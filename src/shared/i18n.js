// Перевод интерфейса. Исходные тексты в коде русские, словарь переводит их при показе,
// поэтому новый текст достаточно добавить сюда, а автотест не даст о нём забыть.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BeatI18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EN = {
    // Боковая панель и пустой экран
    'Закинь биты сюда': 'Drop your beats here',
    'или нажми, чтобы выбрать файл': 'or click to choose a file',
    'Статистика канала': 'Channel stats',
    'Настройки и каналы': 'Settings & channels',
    'Пока нет битов': 'No beats yet',
    'Перетащи mp3 или wav в это окно. Каждый файл станет отдельным черновиком.': 'Drag an mp3 or wav into this window. Each file becomes a separate draft.',
    // Вкладки
    'Бит': 'Beat',
    'Чей тайп': 'Type beat',
    'Описание': 'Description',
    'Ссылки': 'Links',
    'Теги': 'Tags',
    'Картинка и плейлисты': 'Image & playlists',
    'Публикация': 'Publishing',
    'Статистика': 'Stats',
    // Статусы
    'Черновик': 'Draft',
    'В очереди': 'Queued',
    'Загружается': 'Uploading',
    'Загружен': 'Uploaded',
    'Загружен, есть замечания': 'Uploaded with notes',
    'Ошибка': 'Error',
    'Готово': 'Done',
    // Вкладка «Бит»
    'Название бита': 'Beat name',
    'Случайное': 'Random',
    'Тональность': 'Key',
    'Канал': 'Channel',
    'Файл:': 'File:',
    'Выбери канал': 'Choose a channel',
    '+ Добавить канал': '+ Add channel',
    // Вкладка «Чей тайп»
    'Чей тайп-бит': 'Type beat of',
    'Артисты через запятую. По ним строятся название, теги и плейлисты.': 'Artists, separated by commas. The title, tags and playlists are built from them.',
    'Название видео': 'Video title',
    'Варианты названия': 'Title options',
    'Сгенерировать название и теги': 'Generate title and tags',
    'Собрать название заново': 'Rebuild title',
    // Вкладка «Описание»
    'Описание видео': 'Video description',
    'Собирается само: название, тональность, BPM, ссылки, теги. Можно править вручную.': 'Built automatically: title, key, BPM, links, tags. You can edit it by hand.',
    'Собрать описание заново': 'Rebuild description',
    // Вкладка «Ссылки»
    'Ссылки общие для всех битов. Можно вписать просто айди, полную ссылку приложение соберёт само.': 'Links are shared by all beats. You can enter just a username, the app builds the full link.',
    'айди или ссылка': 'username or link',
    // Вкладка «Теги»
    'Теги YouTube (RapidTags)': 'YouTube tags (RapidTags)',
    'Теги через запятую': 'Tags, separated by commas',
    'Подобрать теги': 'Find tags',
    'Войти в RapidTags': 'Sign in to RapidTags',
    'Подставить из prozavr': 'Use tags from prozavr',
    'Теги из prozavr пойдут в описание, а теги RapidTags в это поле.': 'Tags from prozavr go into the description, RapidTags tags go into this field.',
    // Вкладка «Картинка»
    'Выбрать картинку': 'Choose an image',
    'Закинь картинку': 'Drop an image',
    'или нажми': 'or click',
    'Плейлисты': 'Playlists',
    'По одному на строку. Если плейлиста нет, он создастся на канале при загрузке.': 'One per line. A playlist that does not exist is created on the channel during upload.',
    'Найти фото': 'Find a photo',
    'Что искать, например: dark anime aesthetic': 'What to search for, e.g. dark anime aesthetic',
    'Что искать': 'What to search for',
    'Где искать': 'Where to search',
    'В интернете': 'On the web',
    'Найти': 'Search',
    // Вкладка «Публикация»
    'Как опубликовать': 'How to publish',
    'Сразу открыто': 'Public now',
    'Запланировать': 'Schedule',
    'По ссылке': 'Unlisted',
    'Приватно': 'Private',
    'Дата и время': 'Date and time',
    'Субтитры с названием видео': 'Captions with the video title',
    'Случайная заставка в конце ролика': 'Random end screen at the end of the video',
    'Уведомить подписчиков': 'Notify subscribers',
    'Ещё и шортс из самой громкой части бита': 'Also a Short from the loudest part of the beat',
    'Категория: Музыка. Язык: английский. Не для детей.': 'Category: Music. Language: English. Not made for kids.',
    'Первый комментарий после публикации': 'First comment after publishing',
    'Текст': 'Text',
    'Ссылка': 'Link',
    'бай': 'buy',
    'Работает только для открытых и запланированных видео.': 'Only works for public and scheduled videos.',
    'Заполни эту ссылку на вкладке «Ссылки».': 'Fill in this link on the Links tab.',
    'Видео уже на канале. Правки здесь на него не влияют: чтобы залить со свежими тегами, сделай новый черновик.': 'This video is already on the channel. Edits here do not affect it: to upload with fresh tags, make a new draft.',
    'Не получилось:': 'Could not complete:',
    'Открыть в YouTube Studio': 'Open in YouTube Studio',
    'Новый черновик со свежими тегами': 'New draft with fresh tags',
    'Открыть шортс': 'Open Short',
    // Вкладка «Статистика»
    'Статистика появится после заливки видео.': 'Stats appear after the video is uploaded.',
    'Просмотры': 'Views',
    'Лайки': 'Likes',
    'Комментарии': 'Comments',
    'Обновить': 'Refresh',
    'Показать ещё': 'Show more',
    'скрыто': 'hidden',
    'Открытое': 'Public',
    'Приватное': 'Private',
    'Загружаю...': 'Loading...',
    'Комментариев пока нет.': 'No comments yet.',
    'Ответить': 'Reply',
    'Ответ сразу увидят все, от имени канала': 'Everyone will see the reply right away, posted as the channel',
    'Отправляю...': 'Sending...',
    'Отправить': 'Send',
    'Напиши текст ответа.': 'Write the reply text.',
    'Ответ опубликован': 'Reply posted',
    'Отмена': 'Cancel',
    // Нижние кнопки
    'Удалить': 'Delete',
    'Сохранить черновик': 'Save draft',
    'Загрузить на YouTube': 'Upload to YouTube',
    'Подбираю теги и фото...': 'Finding tags and a photo...',
    'Уже на канале': 'Already on the channel',
    'Повторить незавершённое': 'Retry unfinished steps',
    'Повторить загрузку': 'Retry upload',
    'Черновик сохранён': 'Draft saved',
    // Статистика канала
    'Подписчики': 'Subscribers',
    'Открытые видео': 'Public videos',
    'Какие названия работают': 'Which titles work',
    'Последние видео': 'Latest videos',
    'лучший': 'best',
    'Своё название': 'Custom title',
    'Старые видео': 'Older videos',
    'Цифры появятся, когда видео из приложения станут открытыми.': 'Numbers appear once videos from the app are public.',
    'Отсортировано по просмотрам в день: так честнее сравнивать старые и новые видео.': 'Sorted by views per day, which compares old and new videos more fairly.',
    'На канале пока нет видео.': 'There are no videos on the channel yet.',
    'Сначала подключи канал в настройках.': 'Connect a channel in settings first.',
    // Настройки
    'Настройки': 'Settings',
    'Каналы YouTube': 'YouTube channels',
    'Подключить канал': 'Connect channel',
    'Каналы пока не подключены.': 'No channels connected yet.',
    'Поставить страну США': 'Set country to USA',
    'Отключить': 'Disconnect',
    'Нажми «Подключить канал» один раз, чтобы доступ стал постоянным': 'Click "Connect channel" once to make access permanent',
    'Ключ Google': 'Google key',
    'Как его получить, написано в README.md. Проще всего загрузить файл, скачанный кнопкой Download JSON.': 'See README.md for how to get it. The easiest way is to load the file from the Download JSON button.',
    'Загрузить файл ключа': 'Load key file',
    'Сохранён': 'Saved',
    'Шаблоны': 'Templates',
    'Варианты названия, по одному на строку': 'Title options, one per line',
    '{artists} {name} {bpm} {key} {year}. Новые биты получают их по очереди, так видно, какой лучше.': '{artists} {name} {bpm} {key} {year}. New beats get them in turn, which shows which one works best.',
    'Плейлист': 'Playlist',
    'Запрос в prozavr': 'prozavr search',
    'Запрос в RapidTags': 'RapidTags search',
    'Автоподбор': 'Auto-fill',
    'Подбирать теги и фото сразу при добавлении бита': 'Find tags and a photo as soon as a beat is added',
    'Артистов приложение берёт из имени файла, например «Drake x Future Type Beat - Cold Rain.mp3». Фото и названия не повторяются.': 'The app takes artists from the file name, e.g. "Drake x Future Type Beat - Cold Rain.mp3". Photos and names do not repeat.',
    'Где искать фото': 'Where to find photos',
    'Запрос для фото': 'Photo search',
    'Длина шортса, секунд': 'Short length, seconds',
    'Теги в описании': 'Tags in the description',
    'Тегов через запятую': 'Comma-separated tags',
    'Строк с тегами': 'Lines of tags',
    'Хештегов': 'Hashtags',
    'Заставка в конце': 'End screen',
    'Выбрать папку': 'Choose folder',
    'Папка не выбрана': 'No folder selected',
    'Сколько секунд показывать': 'How many seconds to show',
    'Язык': 'Language',
    // Сообщения
    'Сначала впиши артистов.': 'Enter the artists first.',
    'Подбираю теги на prozavr и RapidTags...': 'Finding tags on prozavr and RapidTags...',
    'Теги YouTube взяты из prozavr.': 'YouTube tags were taken from prozavr.',
    'Теги подобраны.': 'Tags are ready.',
    'Напиши, что искать.': 'Enter what to search for.',
    'Ищу...': 'Searching...',
    'Pinterest ничего не показал. Он иногда просит войти, попробуй поиск в интернете.': 'Pinterest showed nothing. It sometimes asks you to sign in, so try a web search.',
    'Ничего не нашлось, попробуй другой запрос.': 'Nothing found, try another search.',
    'Нажми на картинку, чтобы поставить её. Проверь, что её можно использовать.': 'Click an image to use it. Make sure you are allowed to use it.',
    'Скачиваю картинку...': 'Downloading the image...',
    'Поставил уменьшенную копию: сайт не отдал оригинал, в видео она может быть мутной.': 'Used a smaller copy because the site did not provide the original. It may look blurry in the video.',
    'Картинка поставлена.': 'Image set.',
    'Войди через Google в открывшемся окне браузера, затем нажми «Подобрать теги».': 'Sign in with Google in the browser window that opened, then click "Find tags".',
    'Сначала подбери теги, в prozavr пока пусто.': 'Find tags first, there is nothing from prozavr yet.',
    'Открыл браузер. Войди в аккаунт Google и разреши доступ.': 'Browser opened. Sign in to your Google account and allow access.',
    'Канал подключён.': 'Channel connected.',
    'Сначала загрузи ключ Google, потом подключи канал.': 'Load your Google key first, then connect the channel.',
    'Ключ загружен. Теперь нажми «Подключить канал».': 'Key loaded. Now click "Connect channel".',
    'Подходят аудио: mp3, wav, flac, m4a, aac, ogg, и картинки: jpg, png, webp': 'Supported audio: mp3, wav, flac, m4a, aac, ogg. Supported images: jpg, png, webp',
    'Приложение было закрыто во время загрузки. Запусти её снова.': 'The app was closed during the upload. Start it again.',
    // Ошибки YouTube и Google
    'Дневной лимит YouTube API исчерпан. Он обновится в полночь по тихоокеанскому времени (около 10:00 по Москве).': 'The daily YouTube API quota is used up. It resets at midnight Pacific Time.',
    'YouTube временно ограничил число загрузок на этом канале.': 'YouTube has temporarily limited uploads on this channel.',
    'Доступ к аккаунту истёк. Подключи канал заново в настройках.': 'Access to the account has expired. Connect the channel again in settings.',
    'У этого аккаунта Google ещё нет канала YouTube. Создай канал и подключи аккаунт заново.': 'This Google account has no YouTube channel yet. Create one and connect the account again.',
    'YouTube не принял время публикации. Выбери время в будущем.': 'YouTube did not accept the publish time. Choose a time in the future.',
    'Нельзя поставить обложку: подтверди канал по телефону на youtube.com/verify.': 'Cannot set the thumbnail: verify your channel by phone at youtube.com/verify.',
    'YouTube запретил это действие для канала. Проверь, что канал подтверждён на youtube.com/verify.': 'YouTube does not allow this action for the channel. Check that it is verified at youtube.com/verify.',
    'У этого видео комментарии недоступны. Для приватных видео это нормально.': 'Comments are not available for this video. That is normal for private videos.',
    'Видео не найдено на YouTube. Возможно, его удалили.': 'The video was not found on YouTube. It may have been deleted.',
    'Этот комментарий уже удалён. Нажми «Обновить».': 'This comment has been deleted. Click "Refresh".',
    'Ответ слишком длинный для YouTube.': 'The reply is too long for YouTube.',
    'YouTube не разрешает этому аккаунту оставлять комментарии.': 'YouTube does not allow this account to comment.',
    'YouTube не принял этот ответ.': 'YouTube did not accept this reply.',
    'YouTube не смог обработать ответ. Попробуй ещё раз.': 'YouTube could not process the reply. Try again.',
    'Время на вход истекло. Попробуй ещё раз.': 'Sign-in timed out. Try again.',
    'Ответ Google не прошёл проверку.': 'The response from Google failed verification.',
    'нет кода': 'no code',
    'Загрузка несколько раз обрывалась. Проверь интернет и запусти её снова.': 'The upload was interrupted several times. Check your connection and start it again.',
    'Выбери дату публикации в будущем.': 'Choose a publish date in the future.',
    'Это не файл ключа Google: внутри не JSON.': 'This is not a Google key file: it does not contain JSON.',
    'В файле нет ключа Desktop app. Скачай его кнопкой Download JSON у ключа типа Desktop app.': 'The file has no Desktop app key. Download it with the Download JSON button of a Desktop app key.',
    'Канал не подключён. Подключи его в настройках.': 'The channel is not connected. Connect it in settings.',
    'Сначала впиши Client ID и Client Secret.': 'Enter the Client ID and Client Secret first.',
    'Google не выдал постоянный доступ. Попробуй подключить канал ещё раз.': 'Google did not grant lasting access. Try connecting the channel again.',
    'Это видео ещё не залито.': 'This video has not been uploaded yet.',
    // Ошибки тегов и картинок
    'prozavr долго не отвечает': 'prozavr is taking too long to respond',
    'Не нашёл Chrome или Edge на компьютере.': 'Could not find Chrome or Edge on this computer.',
    'Войди в RapidTags в открывшемся окне браузера и нажми «Подобрать теги» ещё раз.': 'Sign in to RapidTags in the browser window that opened and click "Find tags" again.',
    'закончился дневной лимит бесплатного аккаунта. Запросы вернутся позже.': 'the daily limit of the free account is used up. Requests will return later.',
    'Браузер не запустился.': 'The browser did not start.',
    'страница RapidTags не загрузилась.': 'the RapidTags page did not load.',
    'FFmpeg не смог прочитать бит.': 'FFmpeg could not read the beat.',
    'Обложка больше 2 МБ даже после сжатия.': 'The thumbnail is over 2 MB even after compression.',
    'Неизвестный источник картинок.': 'Unknown image source.',
    'Неверный адрес картинки.': 'Invalid image address.',
    'По этой ссылке не картинка.': 'This link is not an image.',
    'Картинка больше 20 МБ.': 'The image is over 20 MB.',
    'Сайт отдал пустой файл.': 'The site returned an empty file.',
    // Шаги заливки
    'заполни ссылку для первого комментария или выключи его': 'fill in the link for the first comment or turn it off',
    'выбери канал': 'choose a channel',
    'файл бита не найден': 'the beat file was not found',
    'добавь картинку': 'add an image',
    'нет названия': 'no title',
    'название длиннее 100 символов': 'the title is longer than 100 characters',
    'Папка с заставками пуста или не выбрана, видео собрано без заставки.': 'The end screen folder is empty or not selected, so the video was built without one.',
    'Собираю видео': 'Building the video',
    'Загружаю на YouTube': 'Uploading to YouTube',
    'Ставлю обложку': 'Setting the thumbnail',
    'Добавляю субтитры': 'Adding captions',
    'Добавляю в плейлисты': 'Adding to playlists',
    'Шортс': 'Short',
    'Собираю шортс': 'Building the Short',
    'Загружаю шортс': 'Uploading the Short',
    'Первый комментарий': 'First comment',
    'не заполнена ссылка для комментария.': 'the comment link is not filled in.',
    'Файл ключа Google': 'Google key file',
    'Аудио': 'Audio',
    'Картинки': 'Images',
  };

  // Тексты с подстановками. Части в скобках переводятся отдельно.
  const PATTERNS = [
    [/^Каналу «(.+)» поставлена страна США\.$/, (m) => `Channel "${m[1]}" is now set to USA.`],
    [/^prozavr нашёл: (.+) тегов, (.+) строк, (.+) хештегов\. Они уже в описании\.$/, (m) => `prozavr found ${m[1]} tags, ${m[2]} lines and ${m[3]} hashtags. They are already in the description.`],
    [/^Выйдет после публикации, если приложение будет открыто: (.*)$/, (m) => `Posted after publishing if the app is open: ${m[1]}`],
    [/^Будет написано: (.*)$/, (m) => `Will be posted: ${m[1]}`],
    [/^Ошибка: (.*)$/, (m, t) => `Error: ${t(m[1])}`],
    [/^• (.*)$/, (m, t) => `• ${t(m[1])}`],
    // Строка из частей через точку: каждая часть переводится отдельно.
    [/^.+ · .+$/, (m, t) => m[0].split(' · ').map(t).join(' · ')],
    [/^лайков: (.+)$/, (m) => `likes: ${m[1]}`],
    [/^просмотры: (.+)$/, (m, t) => `views: ${t(m[1])}`],
    [/^лайки: (.+)$/, (m, t) => `likes: ${t(m[1])}`],
    [/^комментарии: (.+)$/, (m, t) => `comments: ${t(m[1])}`],
    [/^видео: (.+)$/, (m) => `videos: ${m[1]}`],
    [/^в среднем просмотров: (.+)$/, (m, t) => `average views: ${t(m[1])}`],
    [/^в день: (.+)$/, (m) => `per day: ${m[1]}`],
    [/^выйдет (.+)$/, (m) => `goes live ${m[1]}`],
    [/^обновлено (.+)$/, (m) => `updated ${m[1]}`],
    [/^Всего ответов: (.+), остальные видны в YouTube Studio\.$/, (m) => `${m[1]} replies in total, the rest are visible in YouTube Studio.`],
    [/^Открытых видео пока (.+), вывод ещё ненадёжный\. Считаются только видео, залитые через приложение\.$/, (m) => `Only ${m[1]} public videos so far, so the result is not reliable yet. Only videos uploaded through the app are counted.`],
    [/^Ответ на комментарий (.+)$/, (m) => `Reply to the comment by ${m[1]}`],
    [/^Удалить «(.+)» из приложения\? С YouTube ничего не удалится\.$/, (m) => `Delete "${m[1]}" from the app? Nothing is removed from YouTube.`],
    [/^Ошибка YouTube \((.+?)\): (.*)$/, (m) => `YouTube error (${m[1]}): ${m[2]}`],
    [/^Ошибка загрузки \((.+?)\): (.*)$/, (m) => `Upload error (${m[1]}): ${m[2]}`],
    [/^Вход отменён: (.*)$/, (m, t) => `Sign-in cancelled: ${t(m[1])}`],
    [/^prozavr не вернул теги для «(.+)»$/, (m) => `prozavr returned no tags for "${m[1]}"`],
    [/^prozavr: (.*)$/, (m, t) => `prozavr: ${t(m[1])}`],
    [/^сайт не вернул теги для «(.+)»\.$/, (m) => `the site returned no tags for "${m[1]}".`],
    [/^Не удалось определить длительность файла: (.*)$/, (m) => `Could not determine the file duration: ${m[1]}`],
    [/^FFmpeg не смог собрать шортс:$/, () => 'FFmpeg could not build the Short:'],
    [/^FFmpeg не смог собрать видео:$/, () => 'FFmpeg could not build the video:'],
    [/^Не удалось подготовить обложку:$/, () => 'Could not prepare the thumbnail:'],
    [/^Сайт не отдал картинку \((.+?)\)\.$/, (m) => `The site did not provide the image (${m[1]}).`],
    [/^Не хватает данных: (.*)\.$/, (m, t) => `Missing: ${m[1].split(', ').map(t).join(', ')}.`],
    [/^«(.+)»: (.*)$/, (m, t) => `"${m[1]}": ${t(m[2])}`],
    [/^(Ставлю обложку|Добавляю субтитры|Добавляю в плейлисты|Шортс|Первый комментарий): (.*)$/, (m, t) => `${t(m[1])}: ${t(m[2])}`],
  ];

  function translateLine(line) {
    const body = line.trim();
    if (!body) return line;
    const padded = (text) => line.replace(body, () => text);
    if (Object.prototype.hasOwnProperty.call(EN, body)) return padded(EN[body]);
    for (const [re, build] of PATTERNS) {
      const m = re.exec(body);
      if (m) return padded(build(m, translateLine));
    }
    return line;
  }

  function tr(text, lang) {
    if (lang !== 'en' || !text) return text;
    return String(text).split('\n').map(translateLine).join('\n');
  }

  // Переводит окно на лету: новый текст подхватывается сразу, поэтому в коде не нужны ключи.
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  function createLive(rootElement) {
    let lang = 'ru';
    const textOriginals = new WeakMap();
    const attrOriginals = new WeakMap();
    const skip = (el) => el && el.closest && el.closest('[data-no-i18n]');

    function applyText(node) {
      if (skip(node.parentElement)) return;
      const known = textOriginals.get(node);
      const current = node.nodeValue;
      const source = known && current === known.shown ? known.source : current;
      const shown = tr(source, lang);
      textOriginals.set(node, { source, shown });
      if (shown !== current) node.nodeValue = shown;
    }

    function applyAttrs(el) {
      if (skip(el)) return;
      ATTRS.forEach((name) => {
        if (!el.hasAttribute || !el.hasAttribute(name)) return;
        const store = attrOriginals.get(el) || {};
        const current = el.getAttribute(name);
        const source = store[name] && current === store[name].shown ? store[name].source : current;
        const shown = tr(source, lang);
        store[name] = { source, shown };
        attrOriginals.set(el, store);
        if (shown !== current) el.setAttribute(name, shown);
      });
    }

    function walk(node) {
      if (node.nodeType === 3) { applyText(node); return; }
      if (node.nodeType !== 1) return;
      applyAttrs(node);
      node.childNodes.forEach(walk);
    }

    const observer = new MutationObserver((records) => {
      records.forEach((r) => {
        if (r.type === 'characterData') applyText(r.target);
        else if (r.type === 'attributes') applyAttrs(r.target);
        else r.addedNodes.forEach(walk);
      });
    });

    return {
      start() {
        walk(rootElement);
        observer.observe(rootElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      },
      setLang(next) {
        lang = next;
        walk(rootElement);
      },
    };
  }

  return { tr, createLive, EN };
});
