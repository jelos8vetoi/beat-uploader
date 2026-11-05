const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ffmpegPath = () => require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm']);

// Картинка целиком по центру, а вокруг неё размытая копия на весь кадр. Чёрная подложка
// нужна для прозрачных PNG: иначе в прозрачных местах появятся случайные цвета.
function fillFrame(input, out, { width = 1920, height = 1080, fps = 1, still = false } = {}) {
  const size = `${width}:${height}`;
  return [
    `[${input}]format=rgba,split=2[${out}a][${out}b]`,
    `[${out}a]scale=${size}:force_original_aspect_ratio=increase,crop=${size},gblur=sigma=40[${out}blur]`,
    `[${out}b]scale=${size}:force_original_aspect_ratio=decrease[${out}top]`,
    `color=c=black:s=${width}x${height}:r=${fps}[${out}base]`,
    `[${out}base][${out}blur]overlay=shortest=1[${out}back]`,
    // Неподвижный кадр считается один раз и повторяется: размытие на каждый кадр заняло бы минуты.
    `[${out}back][${out}top]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1,format=yuv420p${still ? ',loop=loop=-1:size=1:start=0' : ''}[${out}]`,
  ].join(';');
}

function run(args, onStderr) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), args, { windowsHide: true });
    let tail = '';
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-4000);
      if (onStderr) onStderr(text);
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stderr: tail }));
  });
}

function parseDuration(text) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

async function probeDuration(file) {
  const { stderr } = await run(['-hide_banner', '-i', file]);
  const duration = parseDuration(stderr);
  if (!duration) throw new Error(`Не удалось определить длительность файла: ${path.basename(file)}`);
  return duration;
}

// Заставка вшивается в последние секунды ролика, бит при этом продолжает играть.
function buildRenderArgs({ audio, image, output, duration, endScreen, endSeconds = 20 }) {
  const isClip = endScreen && VIDEO_EXT.has(path.extname(endScreen).toLowerCase());
  const fps = isClip ? 30 : 6;
  const args = ['-y', '-hide_banner', '-framerate', String(fps), '-i', image, '-i', audio];
  let filter = fillFrame('0:v', 'bg', { fps, still: true });
  let videoOut = '[bg]';
  if (endScreen) {
    const start = Math.max(0, duration - endSeconds).toFixed(2);
    if (isClip) {
      args.push('-i', endScreen);
      filter += `;${fillFrame('2:v', 'clip', { fps })};[clip]setpts=PTS-STARTPTS+${start}/TB[end];[bg][end]overlay=eof_action=pass[v]`;
    } else {
      args.push('-framerate', String(fps), '-i', endScreen);
      filter += `;${fillFrame('2:v', 'end', { fps, still: true })};[bg][end]overlay=enable='gte(t,${start})'[v]`;
    }
    videoOut = '[v]';
  }
  args.push(
    '-filter_complex', filter,
    '-map', videoOut, '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', String(fps), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
    '-t', duration.toFixed(3), '-movflags', '+faststart', output,
  );
  return args;
}

// Громкость по секундам: шортс берём из самого насыщенного куска бита.
function audioEnergy(file) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { windowsHide: true });
    const chunks = [];
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.resume();
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('FFmpeg не смог прочитать бит.'));
      const data = Buffer.concat(chunks);
      const perSecond = 8000;
      const energies = [];
      for (let s = 0; (s + 1) * perSecond * 2 <= data.length; s++) {
        let sum = 0;
        for (let i = 0; i < perSecond; i += 8) {
          const v = data.readInt16LE((s * perSecond + i) * 2);
          sum += v * v;
        }
        energies.push(sum);
      }
      resolve(energies);
    });
  });
}

// Начало самого громкого отрезка нужной длины.
function bestWindow(energies, length) {
  if (energies.length <= length) return 0;
  let sum = energies.slice(0, length).reduce((a, b) => a + b, 0);
  let best = sum;
  let start = 0;
  for (let i = length; i < energies.length; i++) {
    sum += energies[i] - energies[i - length];
    if (sum > best) {
      best = sum;
      start = i - length + 1;
    }
  }
  return start;
}

function buildShortArgs({ audio, image, output, start, length }) {
  const fps = 6;
  const fadeOut = Math.max(0, length - 1).toFixed(2);
  return [
    '-y', '-hide_banner', '-framerate', String(fps), '-i', image,
    '-ss', String(start), '-t', String(length), '-i', audio,
    '-filter_complex', fillFrame('0:v', 'v', { width: 1080, height: 1920, fps, still: true }),
    '-map', '[v]', '-map', '1:a:0',
    '-af', `afade=t=in:d=0.3,afade=t=out:st=${fadeOut}:d=1`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', String(fps), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
    '-t', String(length), '-movflags', '+faststart', output,
  ];
}

// Вертикальный отрывок на всю высоту кадра: такой ролик YouTube сам считает шортсом.
async function renderShort({ audio, image, output, seconds = 30 }) {
  const energies = await audioEnergy(audio);
  const length = Math.min(seconds, Math.max(1, energies.length));
  const start = bestWindow(energies, length);
  const { code, stderr } = await run(buildShortArgs({ audio, image, output, start, length }));
  if (code !== 0) throw new Error(`FFmpeg не смог собрать шортс:\n${stderr.slice(-600)}`);
  return { output, start, length };
}

function pickRandomEndScreen(dir, rng = Math.random) {
  if (!dir || !fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext);
  });
  return files.length ? path.join(dir, files[Math.floor(rng() * files.length)]) : null;
}

async function renderVideo(options, onProgress) {
  const args = buildRenderArgs(options);
  const { code, stderr } = await run(args, (text) => {
    const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
    if (m && onProgress) {
      const done = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      onProgress(Math.min(1, done / options.duration));
    }
  });
  if (code !== 0) throw new Error(`FFmpeg не смог собрать видео:\n${stderr.slice(-600)}`);
  return options.output;
}

// YouTube принимает обложку 1280x720 не больше 2 МБ.
async function makeThumbnail(image, output) {
  for (const quality of [2, 4, 7, 10, 14]) {
    const { code, stderr } = await run(['-y', '-hide_banner', '-i', image,
      '-filter_complex', fillFrame('0:v', 'thumb', { width: 1280, height: 720 }), '-map', '[thumb]',
      '-frames:v', '1', '-q:v', String(quality), output]);
    if (code !== 0) throw new Error(`Не удалось подготовить обложку:\n${stderr.slice(-400)}`);
    if (fs.statSync(output).size <= 2 * 1024 * 1024) return output;
  }
  throw new Error('Обложка больше 2 МБ даже после сжатия.');
}

module.exports = {
  parseDuration, probeDuration, buildRenderArgs, buildShortArgs, bestWindow, renderShort, pickRandomEndScreen, renderVideo, makeThumbnail, IMAGE_EXT,
};
