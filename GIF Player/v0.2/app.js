/* global $SD */

// ============================================
// КОНСТАНТЫ ПО УМОЛЧАНИЮ
// ============================================

const DEFAULT_CONFIG = {
    FPS: 8,
    ANIMATIONS_FOLDER: 'gif',
    MAX_ANIMATIONS: 999,
    MAX_FRAMES: 999,
    START_ANIMATION: 1
};

// ============================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================

let allElements = [];
let frameCache = new Map();
let availableFolders = new Set(); // Кэш существующих папок
let lastSendTime = 0; // Для ограничения частоты отправки

// ============================================
// ИНИЦИАЛИЗАЦИЯ (БЕЗ ИЗМЕНЕНИЙ)
// ============================================

$SD.on('connected', (jsonObj) => connected(jsonObj));

function connected(jsn) {
    console.log('🎬 GIF Player connected');
    
    // Регистрируем события
    $SD.on('com.mef.gifplayer.action.willAppear', (jsonObj) => action.onWillAppear(jsonObj));
    $SD.on('com.mef.gifplayer.action.willDisappear', (jsonObj) => action.onWillDisappear(jsonObj));
    $SD.on('com.mef.gifplayer.action.keyUp', (jsonObj) => action.onKeyUp(jsonObj));
    $SD.on('com.mef.gifplayer.action.sendToPlugin', (jsonObj) => action.onSendToPlugin(jsonObj));
    $SD.on('com.mef.gifplayer.action.didReceiveSettings', (jsonObj) => action.onDidReceiveSettings(jsonObj));
    
    // События для Information mode
    $SD.on('com.mef.gifplayer.action.dialPress', (jsonObj) => action.onDialPress(jsonObj));
    $SD.on('com.mef.gifplayer.action.dialRotate', (jsonObj) => action.onDialRotate(jsonObj));
    
    console.log('✅ GIF Player ready');
}

// ============================================
// ACTION ОБРАБОТЧИКИ (БЕЗ ИЗМЕНЕНИЙ)
// ============================================

const action = {
    elementSettings: {},
    elementModes: {},
    
    onDidReceiveSettings: function(jsn) {
        const context = jsn.context;
        
        if (jsn.payload && jsn.payload.settings) {
            this.elementSettings[context] = jsn.payload.settings;
            applySettingsToElement(context, this.elementSettings[context]);
        }
    },

    onWillAppear: function(jsn) {
        const context = jsn.context;
        const controller = jsn.payload.controller || 'Keypad';
        
        console.log(`[GIF Player] onWillAppear: ${context} (${controller} mode)`);
        
        // Сохраняем режим
        this.elementModes[context] = controller;
        
        // Инициализируем настройки
        if (!this.elementSettings[context]) {
            this.elementSettings[context] = {};
        }
        
        // Загружаем настройки
        if (jsn.payload && jsn.payload.settings) {
            this.elementSettings[context] = {
                fps: DEFAULT_CONFIG.FPS,
                startAnimation: DEFAULT_CONFIG.START_ANIMATION,
                animationsFolder: DEFAULT_CONFIG.ANIMATIONS_FOLDER,
                maxFrames: DEFAULT_CONFIG.MAX_FRAMES,
                ...jsn.payload.settings
            };
        } else {
            this.elementSettings[context] = {
                fps: DEFAULT_CONFIG.FPS,
                startAnimation: DEFAULT_CONFIG.START_ANIMATION,
                animationsFolder: DEFAULT_CONFIG.ANIMATIONS_FOLDER,
                maxFrames: DEFAULT_CONFIG.MAX_FRAMES
            };
            
            $SD.api.setSettings(context, this.elementSettings[context]);
        }
        
        // Создаем/обновляем элемент
        createOrUpdateElement(context, this.elementSettings[context], controller);
    },

    onWillDisappear: function(jsn) {
        const context = jsn.context;
        destroyElement(context);
        
        if (this.elementModes[context]) {
            delete this.elementModes[context];
        }
    },

    onKeyUp: function(jsn) {
        const context = jsn.context;
        
        // Только для Keypad mode
        if (this.elementModes[context] === 'Keypad') {
            switchToNextAvailableFolder(context);
        }
    },

    onDialPress: function(jsn) {
        const context = jsn.context;
        const pressed = jsn.payload.pressed;
        
        // Для Information mode - переключение при нажатии
        if (pressed && this.elementModes[context] === 'Information') {
            switchToNextAvailableFolder(context);
        }
    },

    onDialRotate: function(jsn) {
        const context = jsn.context;
        const ticks = jsn.payload.ticks;
        
        // Для Information mode - изменение FPS при вращении
        if (this.elementModes[context] === 'Information' && ticks !== 0) {
            const element = getElementByContext(context);
            if (element && this.elementSettings[context]) {
                const currentFPS = element.fps || DEFAULT_CONFIG.FPS;
                const newFPS = Math.max(5, Math.min(30, currentFPS + ticks));
                
                if (newFPS !== currentFPS) {
                    this.elementSettings[context].fps = newFPS;
                    element.fps = newFPS;
                    
                    $SD.api.setSettings(context, this.elementSettings[context]);
                    restartElementAnimation(element);
                }
            }
        }
    },

    onSendToPlugin: function(jsn) {
        const context = jsn.context;
        
        if (!this.elementSettings[context]) {
            this.elementSettings[context] = {};
        }
        
        if (jsn.payload && jsn.payload.sdpi_collection) {
            const setting = jsn.payload.sdpi_collection;
            
            if (setting.key && setting.value !== undefined) {
                this.elementSettings[context][setting.key] = setting.value;
                $SD.api.setSettings(context, this.elementSettings[context]);
                applySingleSetting(context, setting.key, setting.value);
            }
        }
    }
};

// ============================================
// ОСНОВНЫЕ ФУНКЦИИ (БЕЗ ИЗМЕНЕНИЙ)
// ============================================

function getElementByContext(context) {
    return allElements.find(item => item.context === context);
}

function createOrUpdateElement(context, settings, mode = 'Keypad') {
    let element = getElementByContext(context);
    
    if (element) {
        updateElementSettings(element, settings);
        restartElementAnimation(element);
    } else {
        element = createElement(context, settings, mode);
        allElements.push(element);
        startElementAnimation(element);
    }
}

function createElement(context, settings, mode = 'Keypad') {
    const startFolder = parseInt(settings.startAnimation) || DEFAULT_CONFIG.START_ANIMATION;
    
    return {
        context: context,
        mode: mode,
        fps: parseInt(settings.fps) || DEFAULT_CONFIG.FPS,
        startAnimation: startFolder,
        currentFolder: startFolder,
        animationsFolder: settings.animationsFolder || DEFAULT_CONFIG.ANIMATIONS_FOLDER,
        maxFrames: parseInt(settings.maxFrames) || DEFAULT_CONFIG.MAX_FRAMES,
        currentFrame: 0,
        frames: [],
        timer: null,
        canvas: null,
        ctx: null,
        settings: { ...settings },
        lastDrawTime: 0 // Добавляем для оптимизации отрисовки
    };
}

function updateElementSettings(element, settings) {
    const oldFPS = element.fps;
    
    element.fps = parseInt(settings.fps) || element.fps;
    element.startAnimation = parseInt(settings.startAnimation) || element.startAnimation;
    element.animationsFolder = settings.animationsFolder || element.animationsFolder;
    element.maxFrames = parseInt(settings.maxFrames) || element.maxFrames;
    element.settings = { ...settings };
    
    if (element.startAnimation !== element.currentFolder) {
        element.currentFolder = element.startAnimation;
        element.currentFrame = 0;
    }
    
    return oldFPS !== element.fps;
}

function applySettingsToElement(context, settings) {
    const element = getElementByContext(context);
    if (!element) return;
    
    const fpsChanged = updateElementSettings(element, settings);
    
    if (fpsChanged || element.startAnimation !== element.currentFolder) {
        restartElementAnimation(element);
    }
}

function applySingleSetting(context, key, value) {
    const element = getElementByContext(context);
    if (!element) return;
    
    let needRestart = false;
    
    switch (key) {
        case 'fps':
            const oldFPS = element.fps;
            element.fps = parseInt(value) || DEFAULT_CONFIG.FPS;
            element.settings.fps = element.fps;
            needRestart = (oldFPS !== element.fps);
            break;
            
        case 'startAnimation':
            const oldStart = element.startAnimation;
            element.startAnimation = parseInt(value) || DEFAULT_CONFIG.START_ANIMATION;
            element.settings.startAnimation = element.startAnimation;
            
            if (element.startAnimation !== element.currentFolder) {
                element.currentFolder = element.startAnimation;
                element.currentFrame = 0;
                needRestart = true;
            }
            break;
            
        case 'animationsFolder':
            element.animationsFolder = value || DEFAULT_CONFIG.ANIMATIONS_FOLDER;
            element.settings.animationsFolder = element.animationsFolder;
            needRestart = true;
            break;
            
        case 'maxFrames':
            element.maxFrames = parseInt(value) || DEFAULT_CONFIG.MAX_FRAMES;
            element.settings.maxFrames = element.maxFrames;
            break;
    }
    
    if (needRestart) {
        restartElementAnimation(element);
    }
}

// ============================================
// ПЕРЕКЛЮЧЕНИЕ ПАПОК (БЕЗ ИЗМЕНЕНИЙ)
// ============================================

async function switchToNextAvailableFolder(context) {
    const element = getElementByContext(context);
    if (!element) return;
    
    const currentFolder = element.currentFolder;
    const animationsFolder = element.animationsFolder;
    
    console.log(`[switchToNextAvailableFolder] Current: ${currentFolder}`);
    
    // 1. Сначала пробуем найти следующую папку
    let nextFolder = findNextFolder(currentFolder);
    let found = false;
    
    while (!found) {
        // Проверяем в кэше
        if (availableFolders.has(`${animationsFolder}_${nextFolder}`)) {
            found = true;
            console.log(`Found cached folder: ${nextFolder}`);
            break;
        }
        
        // Проверяем существует ли папка
        const folderExists = await checkFolderExists(nextFolder, animationsFolder);
        
        if (folderExists) {
            found = true;
            availableFolders.add(`${animationsFolder}_${nextFolder}`);
            console.log(`Found existing folder: ${nextFolder}`);
            break;
        } else {
            console.log(`Folder ${nextFolder} doesn't exist, trying next...`);
            
            // Пробуем следующую папку
            const prevFolder = nextFolder;
            nextFolder = findNextFolder(nextFolder);
            
            // Если вернулись к исходной папке - значит папок больше нет
            if (nextFolder === currentFolder) {
                console.log(`No other folders found, staying at ${currentFolder}`);
                return; // Не меняем папку
            }
            
            // Если прошли полный круг и ничего не нашли
            if (nextFolder === prevFolder) {
                console.log(`Full circle completed, no other folders`);
                return;
            }
        }
    }
    
    // 2. Обновляем элемент
    element.currentFolder = nextFolder;
    element.currentFrame = 0;
    
    // 3. Сохраняем настройки
    if (action.elementSettings[context]) {
        action.elementSettings[context].startAnimation = nextFolder;
        element.startAnimation = nextFolder;
        element.settings.startAnimation = nextFolder;
        $SD.api.setSettings(context, action.elementSettings[context]);
    }
    
    // 4. Перезагружаем анимацию
    restartElementAnimation(element);
    console.log(`🔄 Switched to folder: ${nextFolder}`);
}

function findNextFolder(currentFolder) {
    let next = currentFolder + 1;
    
    // Если достигли максимума - начинаем с 1
    if (next > DEFAULT_CONFIG.MAX_ANIMATIONS) {
        next = 1;
    }
    
    return next;
}

// ============================================
// ПРОВЕРКА ПАПКИ (БЕЗ ИЗМЕНЕНИЙ)
// ============================================

async function checkFolderExists(folderNumber, animationsFolder) {
    const folderName = folderNumber.toString().padStart(3, '0');
    
    // Пробуем все форматы в порядке приоритета
    const formats = ['gif', 'png', 'jpg', 'jpeg', 'webp'];
    
    for (const format of formats) {
        const exists = await checkSingleFormat(folderName, animationsFolder, format);
        if (exists) {
            console.log(`✓ Folder exists: ${folderName} (.${format})`);
            return true;
        }
    }
    
    console.log(`✗ Folder doesn't exist: ${folderName}`);
    return false;
}

function checkSingleFormat(folderName, animationsFolder, format) {
    return new Promise((resolve) => {
        const url1 = `./${animationsFolder}/${folderName}/0.${format}`;
        const img1 = new Image();
        
        img1.onload = () => resolve(true);
        img1.onerror = () => {
            const url2 = `./${animationsFolder}/${folderName}/1.${format}`;
            const img2 = new Image();
            
            img2.onload = () => resolve(true);
            img2.onerror = () => resolve(false);
            img2.src = url2;
        };
        
        img1.src = url1;
        setTimeout(() => resolve(false), 1000);
    });
}

// ============================================
// ОПТИМИЗИРОВАННАЯ ЗАГРУЗКА КАДРОВ (БАТЧАМИ)
// ============================================

async function loadFrames(folderNumber, animationsFolder, maxFrames) {
    const cacheKey = `${animationsFolder}_${folderNumber}`;
    
    if (frameCache.has(cacheKey)) {
        return frameCache.get(cacheKey);
    }
    
    const folderName = folderNumber.toString().padStart(3, '0');
    
    // 1. Определяем формат файлов в папке
    const format = await detectFileFormat(folderName, animationsFolder);
    if (!format) {
        throw new Error(`No supported files found in ${animationsFolder}/${folderName}`);
    }
    
    console.log(`[LOAD] Loading: ${animationsFolder}/${folderName} (.${format})`);
    
    // 2. Загружаем кадры БАТЧАМИ (оптимизация №4)
    const frames = await loadAllFramesBatched(folderName, animationsFolder, format, maxFrames);
    
    if (frames.length === 0) {
        throw new Error(`No frames loaded from ${folderName}`);
    }
    
    // 3. Кэшируем результат
    frameCache.set(cacheKey, frames);
    cleanCache();
    
    console.log(`✅ Loaded ${frames.length} frames from ${folderName}`);
    return frames;
}

async function detectFileFormat(folderName, animationsFolder) {
    const formats = ['gif', 'png', 'jpg', 'jpeg', 'webp'];
    
    for (const format of formats) {
        const url0 = `./${animationsFolder}/${folderName}/0.${format}`;
        const url1 = `./${animationsFolder}/${folderName}/1.${format}`;
        
        const exists0 = await checkFileExists(url0);
        if (exists0) return format;
        
        const exists1 = await checkFileExists(url1);
        if (exists1) return format;
    }
    
    return null;
}

// ОПТИМИЗАЦИЯ №4: Загрузка батчами
async function loadAllFramesBatched(folderName, animationsFolder, format, maxFrames) {
    const frames = [];
    
    // Определяем начальный индекс
    let startIndex = 0;
    const testUrl = `./${animationsFolder}/${folderName}/0.${format}`;
    let exists = await checkFileExists(testUrl);
    
    if (!exists) {
        startIndex = 1;
        console.log(`Starting from frame ${startIndex}`);
    }
    
    // Размер батча
    const BATCH_SIZE = 4;
    
    // Загружаем батчами
    for (let batchStart = startIndex; batchStart < maxFrames + startIndex; batchStart += BATCH_SIZE) {
        const batchPromises = [];
        
        // Создаем промисы для текущего батча
        for (let i = 0; i < BATCH_SIZE; i++) {
            const frameIndex = batchStart + i;
            if (frameIndex >= maxFrames + startIndex) break;
            
            const url = `./${animationsFolder}/${folderName}/${frameIndex}.${format}`;
            batchPromises.push(
                loadImage(url).catch(() => null) // Возвращаем null при ошибке
            );
        }
        
        // Загружаем весь батч параллельно
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Обрабатываем результаты батча
        let batchLoaded = false;
        for (const result of batchResults) {
            if (result.status === 'fulfilled' && result.value) {
                frames.push(result.value);
                batchLoaded = true;
            } else {
                // Если это первый батч и ничего не загрузилось
                if (batchStart === startIndex && !batchLoaded) {
                    throw new Error(`First frame not found`);
                }
                // В остальных случаях просто прекращаем загрузку
                return frames;
            }
        }
        
        // Небольшая пауза между батчами для разгрузки UI
        if (batchLoaded && (batchStart + BATCH_SIZE) < (maxFrames + startIndex)) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    }
    
    return frames;
}

function checkFileExists(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
        setTimeout(() => resolve(false), 500);
    });
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Can't load ${url}`));
        img.src = url;
        setTimeout(() => reject(new Error(`Timeout: ${url}`)), 3000);
    });
}

function cleanCache() {
    const MAX_CACHE_SIZE = 5;
    while (frameCache.size > MAX_CACHE_SIZE) {
        const firstKey = frameCache.keys().next().value;
        frameCache.delete(firstKey);
    }
}

// ============================================
// ОПТИМИЗИРОВАННЫЕ ФУНКЦИИ АНИМАЦИИ
// ============================================

async function startElementAnimation(element) {
    console.log(`[startElementAnimation] Starting: ${element.currentFolder}`);
    
    try {
        stopElementTimer(element);
        
        // Загружаем кадры (оптимизированно батчами)
        element.frames = await loadFrames(element.currentFolder, element.animationsFolder, element.maxFrames);
        
        // Добавляем в кэш существующих папок
        availableFolders.add(`${element.animationsFolder}_${element.currentFolder}`);
        
        // Создаем canvas
        if (!element.canvas) {
            element.canvas = document.createElement('canvas');
            element.canvas.width = 144;
            element.canvas.height = 144;
            element.ctx = element.canvas.getContext('2d', { alpha: false }); // Оставляем отключение альфа-канала
        }
        
        // Запускаем таймер
        startElementTimer(element);
        
        // Показываем первый кадр
        drawElementFrameOptimized(element);
        
        console.log(`✅ Animation started: ${element.currentFolder}`);
        
    } catch (error) {
        console.error(`❌ Failed to load animation ${element.currentFolder}:`, error.message);
        
        // Удаляем из кэша существующих папок
        availableFolders.delete(`${element.animationsFolder}_${element.currentFolder}`);
        
        // Пробуем следующую доступную папку
        setTimeout(() => {
            switchToNextAvailableFolder(element.context);
        }, 500);
    }
}

function startElementTimer(element) {
    stopElementTimer(element);
    
    // Ограничиваем FPS максимум 30 для производительности
    const targetFPS = Math.min(element.fps, 30);
    const interval = Math.max(16, Math.floor(1000 / targetFPS));
    
    element.timer = setInterval(() => {
        element.currentFrame = (element.currentFrame + 1) % element.frames.length;
        drawElementFrameOptimized(element);
    }, interval);
}

function stopElementTimer(element) {
    if (element.timer) {
        clearInterval(element.timer);
        element.timer = null;
    }
}

// ОПТИМИЗАЦИЯ №5: Ограничение частоты отрисовки
function drawElementFrameOptimized(element) {
    if (!element.frames || element.frames.length === 0) return;
    
    const frame = element.frames[element.currentFrame];
    if (!frame || !frame.complete) return;
    
    // Проверка 1: Не слишком ли часто рисуем для этого элемента?
    const now = Date.now();
    const minInterval = 1000 / Math.min(element.fps, 30); // Минимальный интервал в ms
    
    if (now - element.lastDrawTime < minInterval - 2) {
        return; // Пропускаем этот кадр, рисуем слишком часто
    }
    
    // Очищаем и рисуем
    element.ctx.clearRect(0, 0, 144, 144);
    element.ctx.drawImage(frame, 0, 0, 144, 144);
    
    // Проверка 2: Не слишком ли часто отправляем изображения (глобально)?
    const minSendInterval = 33; // ~30 FPS максимум для отправки
    
    if (now - lastSendTime >= minSendInterval) {
        try {
            $SD.api.setImage(element.context, element.canvas.toDataURL('image/png'));
            lastSendTime = now;
        } catch (error) {
            console.error(`[${element.context}] Send error:`, error);
        }
    }
    
    element.lastDrawTime = now;
}

function restartElementAnimation(element) {
    stopElementTimer(element);
    element.currentFrame = 0;
    element.lastDrawTime = 0;
    startElementAnimation(element);
}

function destroyElement(context) {
    const element = getElementByContext(context);
    if (element) {
        stopElementTimer(element);
        
        if (element.canvas) {
            element.canvas.width = 0;
            element.canvas.height = 0;
            element.canvas = null;
            element.ctx = null;
        }
        
        const index = allElements.indexOf(element);
        if (index > -1) {
            allElements.splice(index, 1);
        }
        
        if (action.elementSettings[context]) {
            delete action.elementSettings[context];
        }
    }
}

// ============================================
// ОЧИСТКА
// ============================================

window.addEventListener('beforeunload', () => {
    allElements.forEach(element => {
        stopElementTimer(element);
    });
    
    allElements = [];
    frameCache.clear();
    availableFolders.clear();
    action.elementSettings = {};
    action.elementModes = {};
    lastSendTime = 0;
});

// Экспорт для отладки
if (typeof window !== 'undefined') {
    window.GIFPlayer = {
        getAllElements: () => allElements,
        getAvailableFolders: () => Array.from(availableFolders),
        getCacheSize: () => frameCache.size,
        clearCache: () => {
            frameCache.clear();
            availableFolders.clear();
            console.log('Cache cleared');
        }
    };
}

console.log('✨ GIF Player script loaded (optimized: batched loading + frame rate limiting)');
