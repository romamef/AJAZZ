<div align="center">
  <h1>🎬 GIF Player Plugin</h1>
  <h3>StreamDock/AJAZZ AKP153</h3>
</div>

https://github.com/user-attachments/assets/b1fc7e00-3986-473e-a9c5-dd0825158263

<p align="center">
  <a href="#-русский">🇷🇺 Русский</a> • 
  <a href="#-english">🇺🇸 English</a>
</p>

---

## 🔄 Обновления / Updates

### 🇷🇺 Русская версия
**Обновление плагина выполняется путем изменения файла `app.js` в каталоге плагина.**

> **Важно:** После обновления файла `app.js` необходимо перезапустить StreamDock для применения изменений.

**История изменений:**
- **V 0.03** - Улучшена производительность: уменьшены тормоза при скорости FPS ≤ 12
- **V 0.02** - Улучшена производительность: уменьшены тормоза при скорости FPS ≤ 12
- **V 0.01** - Первоначальный релиз

---

### 🇺🇸 English Version
**Plugin updates are applied by modifying the `app.js` file in the plugin directory.**

> **Important:** After updating the `app.js` file, you need to restart StreamDock for changes to take effect.

**Changelog:**
- **V 0.02** - Performance improved: reduced lag at FPS ≤ 12
- **V 0.01** - Initial release

---

## 🇷🇺 Русский

<details>
<summary><b>📋 Содержание</b></summary>

1. [Описание](#-описание)
2. [Возможности](#-возможности)
3. [Структура папок](#-структура-папок-1)
4. [Настройки](#-настройки-1)
5. [Управление](#-управление-1)
6. [Особенности работы](#-особенности-работы)
7. [Производительность](#-производительность-1)
8. [Создание анимаций](#-создание-анимаций-1)
9. [Цикличность переключения](#-цикличность-переключения)
10. [Известные особенности](#-известные-особенности)
11. [Установка](#-установка-1)
12. [Советы](#-советы-1)

</details>

### 🎯 Описание

**Создал плагин (на основе плагина 
`fail.marc.onairclock.sdPlugin`) плеер 
для проигрывания "ВИДЕО"**

Плагин `com.ymp_yuri.streamdock.sdPlugin` 
мне не понравился, из-за того что при 
использовании на AJAZZ AKP153 вызывает 
тормоза и не работают кнопки.

Плагин можно назначить на кнопки или экран.
При нажатии на кнопки происходит переключение 
анимации из "пака".
Лучше не делать больше 1 плагина на страницу, 
так как вызывает тормоза.
Лучше не задавать больше 8-9 FPS, так как это 
тоже вызывает тормоза.

Так как я не являюсь программистом JS, все 
скрипты были написаны через ИИ и бутылку 
пива))) Также описание создано ИИ, ибо мне лень.
Также в zip лежит файл от пользователя ymp_yuri 
(https://ymp-co.github.io/ru/) для конвертации 
видео в .png `convert_video.py` — использование:

```bash
python convert_video.py "...\file_example_MP4_1280_10MG.mp4" ./gif/НОМЕР_ПАПКИ --fps 15 --size 144

```

### ⚠️ Важные ограничения (из опыта)

- **Не назначайте больше 1-2 кнопок с этим 
  плагином на одной странице** — может 
  вызвать тормоза
- **Используйте FPS не выше 8-9** — 
  оптимально для производительности

  ### 🎯 Возможности

✅ Проигрывание анимаций из `.gif`, 
`.png`, `.jpg`, `.jpeg` файлов  
✅ Работа как кнопка (Keypad) и как 
экран (Information mode)  
✅ Циклическое переключение папок 
с анимациями  
✅ Настройка FPS, стартовой папки, 
максимального числа кадров  
✅ Автоопределение формата файлов 
(можно миксовать разные форматы)

### 📁 Структура папок

```text
plugin_folder/
├── gif/                    ← Папка анимаций
│   ├── 001/               ← Папка анимации 1
│   │   ├── 0.gif          ← Кадр 0
│   │   ├── 1.gif          ← Кадр 1
│   │   ├── 2.gif          ← Кадр 2
│   │   └── ...            ← До 999 кадров
│   ├── 002/               ← Папка анимации 2
│   ├── 003/               ← Папка анимации 3
│   └── ...                ← До 999 папок
└── com.mef.gifplayer.sdPlugin/ ← Плагин

```

### ⚙️ Настройки (Property Inspector)

- **FPS** (5-30) - кадров в секунду 
  (рекомендуется 8-9)
- **Start Animation** (1-999) - 
  стартовая папка
- **Animations Folder** - имя папки 
  с анимациями (по умолчанию "gif")
- **Max Frames** (10-999) - максимальное 
  количество кадров для загрузки
  
### 🎮 Управление

**Для кнопки (Keypad mode):**
- Одно нажатие - переключение на 
  следующую существующую папку
- Циклическое переключение: 
  001 → 002 → ... → 999 → 001

  ### 🔧 Особенности работы

- **Автоопределение формата**: плагин 
  сам определяет `.gif`, `.png`, `.jpg`
- **Проверка существования папок**: 
  переключается только на существующие папки
- **Кэширование**: загруженные кадры 
  кэшируются для быстрого переключения
- **Память**: автоматическая очистка 
  при удалении кнопки
  
  ### ⚡ Производительность

- Единый цикл рендеринга для всех кнопок
- Управление FPS для баланса качества/скорости
- Оптимизированная загрузка кадров
- Автоматическая очистка ресурсов

  ### 🚀 Рекомендации по созданию анимаций

- **Размер**: 144×144 пикселей 
  (стандарт Stream Deck)
- **Формат**: PNG для качества, JPG для 
  фото, GIF для простых анимаций
- **Длительность**: до 999 кадров 
  (при 10 FPS = 99 секунд)
- **Именование**: `0.gif`, `1.gif`, 
  `2.gif`... (начинать с 0 или 1)
  
### 🔄 Цикличность переключения

- После последней папки (например, 005) 
  идет поиск следующих папок (006-999)
- Если других папок нет, через несколько 
  секунд возвращается к первой (001)
- Полный круг проходит за 2-3 секунды 
  при отсутствии других папок
  
  ### ⚠️ Известные особенности

- При первом открытии папки загрузка 
  может занять 1-2 секунды
- Одновременное использование 2+ кнопок 
  может вызвать тормоза
- Рекомендуется использовать PNG вместо 
  GIF для лучшего качества
- Настройки сохраняются автоматически 
  при изменении
  
  ### 📦 Установка

1. Скопировать папку `com.mef.gifplayer.sdPlugin` 
   в папку плагинов StreamDock
2. Перезапустить StreamDock
3. Добавить кнопку или экран с плагином 
   "GIF Player"
4. Настроить параметры через Property 
   Inspector (шестеренка)
   
   ### 🎨 Создание анимаций

1. Создайте папку `gif` в папке плагина
2. Внутри создайте папки `001`, `002`, и т.д.
3. В каждой папке разместите кадры: 
   `0.png`, `1.png`, `2.png`...
4. Можно использовать любой графический 
   редактор для создания кадров
   
   ### 💡 Советы

- Для плавной анимации: 10-20 кадров 
  при 8-10 FPS
- Для статических "анимаций": 1-5 кадров
- Для экономии памяти: уменьшайте `Max Frames` 
  если анимации короткие
- Лучшая производительность: одна кнопка 
  на странице, FPS=8
  
  ---

## 🇺🇸 English

<details>
<summary><b>📋 Table of Contents</b></summary>

1. [Description](#-description)
2. [Features](#-features)
3. [Folder Structure](#-folder-structure)
4. [Settings](#-settings)
5. [Controls](#-controls)
6. [How It Works](#-how-it-works)
7. [Performance](#-performance)
8. [Creating Animations](#-creating-animations)
9. [Cyclic Switching](#-cyclic-switching)
10. [Known Issues](#-known-issues)
11. [Installation](#-installation)
12. [Tips](#-tips)

</details>

### 🎯 Description

**Created a plugin (based on the 
`fail.marc.onairclock.sdPlugin`) for 
playing "VIDEO"**

I didn't like the `com.ymp_yuri.streamdock.sdPlugin` 
because when used on AJAZZ AKP153 it causes 
lag and buttons stop working.

The plugin can be assigned to buttons or the screen.
When you press buttons, it switches animations 
from a "pack."
It's better not to have more than 1 plugin 
per page, as it causes lag.
It's also better not to set FPS higher than 
8-9, as that causes lag too.

Since I'm not a JS programmer, all scripts 
were written with AI and a bottle of beer))) 
Also, this description was created by AI 
because I'm too lazy.

Also included in the zip is a file from user 
ymp_yuri (https://ymp-co.github.io/ru/) for 
converting video to .png `convert_video.py` — usage:

```bash
python convert_video.py "...\file_example_MP4_1280_10MG.mp4" ./gif/FOLDER_NUMBER --fps 15 --size 144

```

### ⚠️ Important Limitations (from experience)

- **Do not assign more than 1-2 buttons with 
  this plugin on one page** — it may cause lag
- **Use FPS no higher than 8-9** — optimal 
  for performance
  
  ### 🎯 Features

✅ Plays animations from `.gif`, `.png`, 
`.jpg`, `.jpeg` files  
✅ Works as a button (Keypad) and as a 
screen (Information mode)  
✅ Cyclic switching between animation folders  
✅ Configurable FPS, starting folder, 
maximum frame count  
✅ Auto-detection of file formats (you can 
mix different formats)

### 📁 Folder Structure

```text
plugin_folder/
├── gif/                    ← Animations folder
│   ├── 001/               ← Animation folder 1
│   │   ├── 0.gif          ← Frame 0
│   │   ├── 1.gif          ← Frame 1
│   │   ├── 2.gif          ← Frame 2
│   │   └── ...            ← Up to 999 frames
│   ├── 002/               ← Animation folder 2
│   ├── 003/               ← Animation folder 3
│   └── ...                ← Up to 999 folders
└── com.mef.gifplayer.sdPlugin/ ← Plugin

```

### ⚙️ Settings (Property Inspector)

- **FPS** (5-30) – frames per second 
  (recommended 8-9)
- **Start Animation** (1-999) – starting folder
- **Animations Folder** – name of animations 
  folder (default "gif")
- **Max Frames** (10-999) – maximum number 
  of frames to load

### 🎮 Controls

**For button (Keypad mode):**
- Single press – switch to next existing folder
- Cyclic switching: 001 → 002 → ... → 999 → 001

### 🔧 How It Works

- **Auto-format detection**: plugin automatically 
  detects `.gif`, `.png`, `.jpg`
- **Folder existence check**: only switches to 
  existing folders
- **Caching**: loaded frames are cached for 
  fast switching
- **Memory**: automatic cleanup when button 
  is removed
  
### ⚡ Performance

- Single rendering loop for all buttons
- FPS control for quality/speed balance
- Optimized frame loading
- Automatic resource cleanup

 ### 🚀 Animation Creation Recommendations

- **Size**: 144×144 pixels (Stream Deck standard)
- **Format**: PNG for quality, JPG for photos, 
  GIF for simple animations
- **Duration**: up to 999 frames (at 10 FPS = 99 seconds)
- **Naming**: `0.gif`, `1.gif`, `2.gif`... 
  (start with 0 or 1)

### 🔄 Cyclic Switching

- After the last folder (e.g., 005), it searches 
  for next folders (006-999)
- If no other folders exist, it returns to the 
  first folder (001) after a few seconds
- Full cycle takes 2-3 seconds when no other 
  folders exist

     ### ⚠️ Known Issues

- First-time folder loading may take 1-2 seconds
- Using 2+ buttons simultaneously may cause lag
- Recommended to use PNG instead of GIF for better quality
- Settings are saved automatically when changed

  ### 📦 Installation

1. Copy the `com.mef.gifplayer.sdPlugin` folder 
   to the StreamDock plugins folder
2. Restart StreamDock
3. Add a button or screen with the "GIF Player" plugin
4. Configure parameters via Property Inspector 
   (gear icon)

  ### 🎨 Creating Animations

1. Create a `gif` folder in the plugin folder
2. Inside, create folders `001`, `002`, etc.
3. Place frames in each folder: `0.png`, `1.png`, `2.png`...
4. You can use any graphics editor to create frames

   ### 💡 Tips

- For smooth animation: 10-20 frames at 8-10 FPS
- For static "animations": 1-5 frames
- To save memory: reduce `Max Frames` if animations are short
- Best performance: one button per page, FPS=8

---

<div align="center">
<sub>Created with ❤️, AI, and 🍺 | Создано с ❤️, ИИ и 🍺</sub>
</div>  
    
