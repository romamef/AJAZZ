/* global addDynamicStyles, $SD, Utils */
/* eslint-disable no-extra-boolean-cast */

/**
 * GIF Player Property Inspector
 *
 * Исправления:
 *  1. saveSetting больше не шлёт в setSettings весь (возможно устаревший) объект.
 *     Плагин сам сохраняет настройки в onSendToPlugin, поэтому выбор папки,
 *     сделанный кнопкой, не затирается старым значением из PI.
 *     Подмена $SD.on убрана - вместо неё нормальная подписка на didReceiveSettings.
 *  2. Обработчики UI навешиваются ровно один раз, даже если onSDConnected
 *     вызывается несколько раз (initializePI / событие connected / fallback).
 */

const PLUGIN_ACTION_UUID = 'com.mef.gifplayer.action';

// Глобальные переменные
let currentSettings = {};
let isInitialized = false;
let isConnected = false;
let uiListenersReady = false;

// Подписки на $SD делаем сразу: скрипт подключён в конце <body>, $SD уже существует,
// а событие connected не должно пройти мимо нас.
setupSDHandlers();

document.addEventListener('DOMContentLoaded', function() {
    console.log('GIF Player Property Inspector loaded');
    initializePI();
});

function initializePI() {
    if (isInitialized) return;
    isInitialized = true;

    console.log('Initializing PI...');

    // Если $SD уже подключен, запускаем инициализацию
    if ($SD && $SD.uuid) {
        isConnected = true;
        onSDConnected();
    }
}

function setupSDHandlers() {
    if (!$SD) {
        console.warn('$SD not available yet');
        return;
    }

    // Подключение
    $SD.on('connected', function(data) {
        console.log('PI connected to StreamDock');
        isConnected = true;
        onSDConnected(data);
    });

    // Динамические стили
    if (typeof addDynamicStyles !== 'undefined') {
        $SD.on('connected', function() {
            addDynamicStyles($SD.applicationInfo.colors, 'connectSocket');
        });
    }

    // Локализация
    $SD.on('localizationLoaded', function() {
        console.log('Localization loaded');
        localizeUI();
    });

    // Настройки, пришедшие от хоста (в том числе после переключения папки кнопкой)
    $SD.on('didReceiveSettings', handleSettingsEvent);

    // В common.js любое событие с полем "action" приходит в PI как sendToPropertyInspector,
    // поэтому didReceiveSettings может прилететь и так.
    $SD.on('sendToPropertyInspector', function(data) {
        if (data && data.event === 'didReceiveSettings') {
            handleSettingsEvent(data);
        } else {
            console.log('Message from plugin:', data);
        }
    });
}

function handleSettingsEvent(data) {
    console.log('didReceiveSettings event:', data);
    if (data && data.payload && data.payload.settings) {
        loadSavedSettings(data.payload.settings);
    }
}

function onSDConnected(data) {
    console.log('onSDConnected called');

    // ИСПРАВЛЕНИЕ 2: обработчики UI - строго один раз
    setupUIEventListeners();

    // Локализация
    localizeUI();

    // Настройки: из данных подключения или из $SD.actionInfo
    const info = (data && data.actionInfo) || $SD.actionInfo;
    const settings = info && info.payload && info.payload.settings;

    if (settings) {
        console.log('Settings from connection:', settings);
        loadSavedSettings(settings);
    } else if (Object.keys(currentSettings).length === 0) {
        console.log('No settings in connection data, requesting...');
        setTimeout(requestSettings, 100);
    }
}

function requestSettings() {
    if ($SD && $SD.api && $SD.uuid) {
        console.log('Requesting settings from plugin...');
        $SD.api.getSettings($SD.uuid);
    }
}

/**
 * Загрузка сохраненных настроек
 */
function loadSavedSettings(savedSettings) {
    console.log('Loading saved settings:', savedSettings);

    if (!savedSettings || typeof savedSettings !== 'object') {
        console.log('No valid settings to load');
        return;
    }

    // Всегда актуальная копия того, что реально хранится на хосте
    currentSettings = { ...savedSettings };
    updateUIWithSettings(savedSettings);
}

// Не перезаписываем поле, в котором пользователь сейчас печатает
function setFieldValue(el, value) {
    if (el && document.activeElement !== el) {
        el.value = value;
    }
}

function updateUIWithSettings(settings) {
    console.log('Updating UI with settings:', settings);

    // FPS
    if (settings.fps !== undefined) {
        const fpsSlider = document.getElementById('fps');
        const fpsValue = document.getElementById('fps-value');

        if (fpsSlider && fpsValue) {
            const fps = parseInt(settings.fps) || 10;
            setFieldValue(fpsSlider, fps);
            fpsValue.textContent = fps;
        }
    }

    // Start Animation
    if (settings.startAnimation !== undefined) {
        setFieldValue(
            document.getElementById('startAnimation'),
            parseInt(settings.startAnimation) || 1
        );
    }

    // Animations Folder
    if (settings.animationsFolder !== undefined) {
        setFieldValue(
            document.getElementById('animationsFolder'),
            settings.animationsFolder
        );
    }

    // Max Frames
    if (settings.maxFrames !== undefined) {
        setFieldValue(
            document.getElementById('maxFrames'),
            parseInt(settings.maxFrames) || 100
        );
    }
}

/**
 * Локализация интерфейса
 */
function localizeUI() {
    if (!window.$localizedStrings) {
        console.log('No localization strings available');
        return;
    }

    const el = document.querySelector('.sdpi-wrapper') || document;

    // Локализация элементов с data-locale
    Array.from(el.querySelectorAll('[data-locale]')).forEach(e => {
        const localeKey = e.getAttribute('data-locale');
        if (localeKey && window.$localizedStrings[localeKey]) {
            const translated = window.$localizedStrings[localeKey];
            if (e.textContent !== translated) {
                e.textContent = translated;
            }
        }
    });

    // Локализация текстовых узлов
    Array.from(el.querySelectorAll('*:not(script):not(style)')).forEach(e => {
        if (e.childNodes && e.childNodes.length > 0) {
            const textNode = e.childNodes[0];
            if (textNode.nodeType === Node.TEXT_NODE) {
                const text = textNode.nodeValue.trim();
                if (text && window.$localizedStrings[text]) {
                    const translated = window.$localizedStrings[text];
                    if (text !== translated) {
                        textNode.nodeValue = textNode.nodeValue.replace(text, translated);
                    }
                }
            }
        }
    });
}

/**
 * Настройка обработчиков UI событий (выполняется ОДИН раз)
 */
function setupUIEventListeners() {
    if (uiListenersReady) return;
    uiListenersReady = true;

    console.log('Setting up UI event listeners');

    // FPS слайдер
    const fpsSlider = document.getElementById('fps');
    const fpsValue = document.getElementById('fps-value');

    if (fpsSlider && fpsValue) {
        let fpsTimeout;

        fpsSlider.addEventListener('input', function() {
            const value = parseInt(this.value) || 10;
            fpsValue.textContent = value;

            // Дебаунс для сохранения
            clearTimeout(fpsTimeout);
            fpsTimeout = setTimeout(() => {
                saveSetting('fps', value);
            }, 300);
        });

        fpsSlider.addEventListener('change', function() {
            // change приходит после input - отменяем отложенное сохранение, чтобы не слать дубль
            clearTimeout(fpsTimeout);
            saveSetting('fps', parseInt(this.value) || 10);
        });
    }

    // Остальные поля
    const fields = [
        { id: 'startAnimation', type: 'number', default: 1 },
        { id: 'animationsFolder', type: 'string', default: 'gif' },
        { id: 'maxFrames', type: 'number', default: 100 }
    ];

    fields.forEach(field => {
        const input = document.getElementById(field.id);
        if (!input) return;

        let timeoutId;

        const commit = function() {
            let value = input.value;

            if (field.type === 'number') {
                value = parseInt(value) || field.default;
                input.value = value; // Обновляем поле
            }

            saveSetting(field.id, value);
        };

        input.addEventListener('input', function() {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(commit, 500);
        });

        input.addEventListener('change', function() {
            clearTimeout(timeoutId); // не слать дубль после input
            commit();
        });
    });
}

/**
 * Сохранение настройки
 *
 * ИСПРАВЛЕНИЕ 1: отправляем плагину только изменившийся ключ.
 * Плагин сам объединяет его со своими актуальными настройками и вызывает setSettings.
 * Раньше PI дополнительно слал setSettings со всем currentSettings, и устаревший
 * startAnimation возвращал папку назад после переключения кнопкой.
 */
function saveSetting(key, value) {
    console.log(`Saving setting: ${key} = ${value} (type: ${typeof value})`);

    // Локальная копия - только для отображения
    currentSettings[key] = value;

    if ($SD && $SD.api && $SD.uuid) {
        $SD.api.sendToPlugin($SD.uuid, PLUGIN_ACTION_UUID, {
            sdpi_collection: {
                key: key,
                value: value,
                group: false,
                index: 0,
                selection: [],
                checked: false
            }
        });

        console.log(`Setting "${key}" sent to plugin:`, value);
    }
}

// Fallback инициализация
setTimeout(function() {
    if (!isConnected && $SD && $SD.uuid) {
        console.log('Fallback initialization');
        isConnected = true;
        onSDConnected(); // безопасно: UI-обработчики уже защищены от повторной установки
    }
}, 1000);

console.log('GIF Player PI script loaded');
