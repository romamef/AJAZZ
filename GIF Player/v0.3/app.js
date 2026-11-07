/* global $SD */
'use strict';

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const DEFAULTS = Object.freeze({
  fps: 8,
  startAnimation: 1,
  animationsFolder: 'gif',
  maxFrames: 999
});

const LIMITS = Object.freeze({
  fps: [5, 30],
  startAnimation: [1, 999],
  maxFrames: [1, 999]
});

const MAX_FOLDERS = 999;
const FRAME_SIZE = 144;
const FORMATS = ['gif', 'png', 'jpg', 'jpeg', 'webp'];

// Кадры кодируются ОДИН раз при загрузке. Для уменьшения трафика попробуйте
// { type: 'image/jpeg', quality: 0.9 } - файлы будут в разы меньше.
const ENCODING = Object.freeze({ type: 'image/png', quality: 0.92 });

const LOAD_BATCH = 8;             // кадров загружается параллельно
const SCAN_CHUNK_START = 4;      // папок в первой пачке при поиске следующей (далее удваивается)
const SCAN_CHUNK_MAX = 32;        // макс. папок в пачке
const PROBE_TIMEOUT = 1000;       // мс, проверка существования файла
const LOAD_TIMEOUT = 3000;        // мс, загрузка одного кадра
const NEGATIVE_TTL = 5000;        // мс, сколько помнить "папки нет"
const MAX_CACHED_FRAMES = 1200;   // суммарный лимит кадров в кэше (LRU)
const MAX_AUTO_SKIPS = 3;         // сколько раз подряд автоматически пропускать битые папки
const SETTINGS_RELOAD_DELAY = 250; // мс, debounce перезагрузки при вводе в PI

// ============================================
// СОСТОЯНИЕ
// ============================================

const elements = new Map();         // context -> element
const frameCache = new Map();       // key -> string[] (dataURL), порядок = LRU
const inflight = new Map();         // key -> Promise (дедупликация загрузок)
const folderInfoCache = new Map();  // key -> { info, time }
let loopTimer = null;
let scratch = null;
let registered = false;

// ============================================
// УТИЛИТЫ
// ============================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (n) => String(n).padStart(3, '0');

function clampInt(value, [min, max], fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeSettings(raw) {
  raw = raw || {};
  return {
    fps: clampInt(raw.fps, LIMITS.fps, DEFAULTS.fps),
    startAnimation: clampInt(raw.startAnimation, LIMITS.startAnimation, DEFAULTS.startAnimation),
    animationsFolder: String(raw.animationsFolder || '').trim() || DEFAULTS.animationsFolder,
    maxFrames: clampInt(raw.maxFrames, LIMITS.maxFrames, DEFAULTS.maxFrames)
  };
}

const frameUrl = (base, folder, index, format) =>
  `./${base}/${pad(folder)}/${index}.${format}`;

// ============================================
// ЗАГРУЗКА ИЗОБРАЖЕНИЙ
// ============================================

function loadImage(url, timeout) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const cleanup = () => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
    };
    const timer = setTimeout(() => {
      cleanup();
      img.src = '';
      reject(new Error(`Timeout: ${url}`));
    }, timeout);
    img.onload = () => { cleanup(); resolve(img); };
    img.onerror = () => { cleanup(); reject(new Error(`Can't load ${url}`)); };
    img.src = url;
  });
}

const probe = (url) => loadImage(url, PROBE_TIMEOUT).then(() => true, () => false);

// Определяет формат и индекс первого кадра. Все варианты проверяются параллельно.
async function detectFolder(base, folder) {
  const key = `${base}/${folder}`;
  const hit = folderInfoCache.get(key);
  if (hit && (hit.info || Date.now() - hit.time < NEGATIVE_TTL)) return hit.info;

  const results = await Promise.all(FORMATS.map(async (format) => {
    const [has0, has1] = await Promise.all([
      probe(frameUrl(base, folder, 0, format)),
      probe(frameUrl(base, folder, 1, format))
    ]);
    return has0 ? { format, start: 0 } : has1 ? { format, start: 1 } : null;
  }));

  const info = results.find(Boolean) || null; // порядок FORMATS = приоритет
  folderInfoCache.set(key, { info, time: Date.now() });
  return info;
}

// Ищет следующую существующую папку по кругу, проверяя пачками.
async function findNextExistingFolder(base, current) {
  const order = [];
  for (let i = 1; i < MAX_FOLDERS; i++) {
    order.push(((current - 1 + i) % MAX_FOLDERS) + 1);
  }
  // Пачки растут: соседняя папка находится быстро, длинный перебор - параллельно.
  let size = SCAN_CHUNK_START;
  for (let i = 0; i < order.length; i += size, size = Math.min(size * 2, SCAN_CHUNK_MAX)) {
    const chunk = order.slice(i, i + size);
    const infos = await Promise.all(chunk.map((n) => detectFolder(base, n)));
    const idx = infos.findIndex(Boolean);
    if (idx !== -1) return chunk[idx];
  }
  return null;
}

// ============================================
// КОДИРОВАНИЕ КАДРОВ (один раз, при загрузке)
// ============================================

function encodeFrame(img) {
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratch.width = FRAME_SIZE;
    scratch.height = FRAME_SIZE;
    scratch.ctx = scratch.getContext('2d');
  }
  const ctx = scratch.ctx;
  ctx.fillStyle = '#000'; // как и раньше: прозрачность -> чёрный фон
  ctx.fillRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  ctx.drawImage(img, 0, 0, FRAME_SIZE, FRAME_SIZE);
  return scratch.toDataURL(ENCODING.type, ENCODING.quality);
}

async function loadAllFrames(base, folder, info, maxFrames) {
  const frames = [];
  const end = info.start + maxFrames; // не включая

  for (let from = info.start; from < end; from += LOAD_BATCH) {
    const jobs = [];
    for (let i = from; i < Math.min(from + LOAD_BATCH, end); i++) {
      jobs.push(loadImage(frameUrl(base, folder, i, info.format), LOAD_TIMEOUT).catch(() => null));
    }
    const images = await Promise.all(jobs);

    let finished = false;
    for (const img of images) {
      if (!img) { finished = true; break; } // первый пропуск = конец анимации
      frames.push(encodeFrame(img));
    }
    if (finished) break;
    await sleep(0); // отдаём управление event loop
  }
  return frames;
}

// ============================================
// КЭШ КАДРОВ (LRU, лимит по количеству кадров)
// ============================================

function trimCache() {
  const pinned = new Set();
  for (const el of elements.values()) if (el.cacheKey) pinned.add(el.cacheKey);

  let total = 0;
  for (const frames of frameCache.values()) total += frames.length;

  const keys = [...frameCache.keys()];
  const newest = keys[keys.length - 1];
  for (const key of keys) {
    if (total <= MAX_CACHED_FRAMES) break;
    if (key === newest || pinned.has(key)) continue;
    total -= frameCache.get(key).length;
    frameCache.delete(key);
  }
}

function getFrames(base, folder, maxFrames) {
  const key = `${base}/${folder}/${maxFrames}`;

  const cached = frameCache.get(key);
  if (cached) {
    frameCache.delete(key); // обновляем позицию LRU
    frameCache.set(key, cached);
    return Promise.resolve({ key, frames: cached });
  }
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    const info = await detectFolder(base, folder);
    if (!info) throw new Error(`No supported files in ${base}/${pad(folder)}`);

    const frames = await loadAllFrames(base, folder, info, maxFrames);
    if (frames.length === 0) {
      folderInfoCache.delete(`${base}/${folder}`);
      throw new Error(`No frames loaded from ${base}/${pad(folder)}`);
    }
    frameCache.set(key, frames);
    trimCache();
    return { key, frames };
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

// ============================================
// ЕДИНЫЙ ЦИКЛ ВОСПРОИЗВЕДЕНИЯ
// ============================================

function sendFrame(el) {
  try {
    $SD.api.setImage(el.context, el.frames[el.frameIndex]);
  } catch (error) {
    console.error(`[${el.context}] setImage error:`, error);
  }
}

function scheduleLoop() {
  clearTimeout(loopTimer);
  loopTimer = null;

  let next = Infinity;
  for (const el of elements.values()) {
    if (el.playing && el.nextTime < next) next = el.nextTime;
  }
  if (next === Infinity) return; // нечего играть - таймеров нет вообще

  loopTimer = setTimeout(tick, Math.max(0, next - performance.now()));
}

function tick() {
  loopTimer = null;
  const now = performance.now();

  for (const el of elements.values()) {
    if (!el.playing || now < el.nextTime) continue;

    const interval = 1000 / el.settings.fps;
    el.nextTime += interval;
    if (el.nextTime <= now) el.nextTime = now + interval; // не пытаемся "догонять"

    el.frameIndex = (el.frameIndex + 1) % el.frames.length;
    sendFrame(el);
  }
  scheduleLoop();
}

function startPlayback(el) {
  el.frameIndex = 0;
  sendFrame(el);
  el.playing = el.frames.length > 1; // статичная картинка = ни одного таймера
  el.nextTime = performance.now() + 1000 / el.settings.fps;
  scheduleLoop();
}

function stopPlayback(el) {
  el.playing = false;
  scheduleLoop();
}

// ============================================
// ЭЛЕМЕНТЫ
// ============================================

function createElement(context, mode, settings) {
  return {
    context,
    mode,
    settings,
    currentFolder: settings.startAnimation,
    frames: [],
    frameIndex: 0,
    nextTime: 0,
    playing: false,
    loadId: 0,        // защита от гонок: устаревшие загрузки игнорируются
    cacheKey: null,
    switching: false,
    failures: 0,
    reloadTimer: null,
    saveTimer: null
  };
}

const isAlive = (el) => elements.get(el.context) === el;

function saveSettings(el, delay = 0) {
  clearTimeout(el.saveTimer);
  const save = () => {
    el.saveTimer = null;
    $SD.api.setSettings(el.context, el.settings);
  };
  if (delay > 0) el.saveTimer = setTimeout(save, delay);
  else save();
}

function requestReload(el, delay = 0) {
  clearTimeout(el.reloadTimer);
  if (delay > 0) el.reloadTimer = setTimeout(() => loadAndPlay(el), delay);
  else loadAndPlay(el);
}

async function loadAndPlay(el) {
  const loadId = ++el.loadId;
  clearTimeout(el.reloadTimer);
  stopPlayback(el);

  const { animationsFolder, maxFrames } = el.settings;
  const folder = el.currentFolder;

  try {
    const { key, frames } = await getFrames(animationsFolder, folder, maxFrames);
    if (loadId !== el.loadId || !isAlive(el)) return; // устарело / кнопку убрали

    el.frames = frames;
    el.cacheKey = key;
    el.failures = 0;
    startPlayback(el);
  } catch (error) {
    if (loadId !== el.loadId || !isAlive(el)) return;
    console.error(`[GIF Player] Failed to load ${animationsFolder}/${pad(folder)}:`, error.message);

    folderInfoCache.delete(`${animationsFolder}/${folder}`);
    if (++el.failures <= MAX_AUTO_SKIPS) {
      setTimeout(() => { if (isAlive(el) && loadId === el.loadId) switchFolder(el); }, 500);
    }
  }
}

async function switchFolder(el) {
  if (el.switching) return;
  el.switching = true;

  let next = null;
  try {
    next = await findNextExistingFolder(el.settings.animationsFolder, el.currentFolder);
  } finally {
    el.switching = false;
  }
  if (!isAlive(el) || next === null) return; // других папок нет - остаёмся

  el.currentFolder = next;
  el.settings.startAnimation = next;
  saveSettings(el);
  loadAndPlay(el);
}

// Применение настроек (из PI / didReceiveSettings). Перезагружает кадры только при необходимости.
function applySettings(el, raw, { debounce = 0 } = {}) {
  const prev = el.settings;
  const next = normalizeSettings(Object.assign({}, prev, raw));
  el.settings = next;

  const needReload =
    next.animationsFolder !== prev.animationsFolder ||
    next.maxFrames !== prev.maxFrames ||
    next.startAnimation !== el.currentFolder;

  if (needReload) {
    el.currentFolder = next.startAnimation;
    el.failures = 0;
    requestReload(el, debounce);
  } else if (next.fps !== prev.fps && el.playing) {
    el.nextTime = performance.now() + 1000 / next.fps;
    scheduleLoop();
  }
}

function destroyElement(context) {
  const el = elements.get(context);
  if (!el) return;

  el.loadId++; // отменяет любые текущие загрузки этого элемента
  clearTimeout(el.reloadTimer);
  if (el.saveTimer) saveSettings(el); // не теряем отложенные настройки

  elements.delete(context);
  el.frames = [];
  scheduleLoop();
  trimCache();
}

// ============================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================

const action = {
  onWillAppear(jsn) {
    const context = jsn.context;
    const payload = jsn.payload || {};
    const mode = payload.controller || 'Keypad';
    const raw = payload.settings || {};
    const settings = normalizeSettings(raw);

    let el = elements.get(context);
    if (el) {
      el.mode = mode;
      el.settings = settings;
      el.currentFolder = settings.startAnimation;
    } else {
      el = createElement(context, mode, settings);
      elements.set(context, el);
    }

    if (Object.keys(raw).length === 0) saveSettings(el); // записываем значения по умолчанию
    loadAndPlay(el);
  },

  onWillDisappear(jsn) {
    destroyElement(jsn.context);
  },

  onDidReceiveSettings(jsn) {
    const el = elements.get(jsn.context);
    if (el && jsn.payload && jsn.payload.settings) applySettings(el, jsn.payload.settings);
  },

  onKeyUp(jsn) {
    const el = elements.get(jsn.context);
    if (el && el.mode === 'Keypad') {
      el.failures = 0;
      switchFolder(el);
    }
  },

  onDialPress(jsn) {
    const el = elements.get(jsn.context);
    if (el && el.mode === 'Information' && jsn.payload && jsn.payload.pressed) {
      el.failures = 0;
      switchFolder(el);
    }
  },

  onDialRotate(jsn) {
    const el = elements.get(jsn.context);
    const ticks = jsn.payload && jsn.payload.ticks;
    if (!el || el.mode !== 'Information' || !ticks) return;

    const fps = clampInt(el.settings.fps + ticks, LIMITS.fps, DEFAULTS.fps);
    if (fps === el.settings.fps) return;

    applySettings(el, { fps });
    saveSettings(el, 300); // debounce: не засыпаем хост при быстром вращении
  },

  onSendToPlugin(jsn) {
    const el = elements.get(jsn.context);
    const setting = jsn.payload && jsn.payload.sdpi_collection;
    if (!el || !setting || !setting.key || setting.value === undefined) return;

    applySettings(el, { [setting.key]: setting.value }, { debounce: SETTINGS_RELOAD_DELAY });
    saveSettings(el);
  }
};

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

$SD.on('connected', () => {
  if (registered) return; // защита от двойной подписки при переподключении
  registered = true;

  const ns = 'com.mef.gifplayer.action';
  $SD.on(`${ns}.willAppear`, (j) => action.onWillAppear(j));
  $SD.on(`${ns}.willDisappear`, (j) => action.onWillDisappear(j));
  $SD.on(`${ns}.keyUp`, (j) => action.onKeyUp(j));
  $SD.on(`${ns}.sendToPlugin`, (j) => action.onSendToPlugin(j));
  $SD.on(`${ns}.didReceiveSettings`, (j) => action.onDidReceiveSettings(j));
  $SD.on(`${ns}.dialPress`, (j) => action.onDialPress(j));
  $SD.on(`${ns}.dialRotate`, (j) => action.onDialRotate(j));

  console.log('GIF Player ready');
});

window.addEventListener('beforeunload', () => {
  clearTimeout(loopTimer);
  for (const el of elements.values()) {
    el.loadId++;
    clearTimeout(el.reloadTimer);
    clearTimeout(el.saveTimer);
  }
  elements.clear();
  frameCache.clear();
  inflight.clear();
  folderInfoCache.clear();
});

// Для отладки из DevTools
window.GIFPlayer = {
  getAllElements: () => [...elements.values()],
  getCachedFolders: () => [...frameCache.keys()],
  clearCache: () => { frameCache.clear(); folderInfoCache.clear(); }
};
