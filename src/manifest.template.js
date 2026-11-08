import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

dotenv.config({ path: '.env.production' });
const baseRoute = (process.env.VITE_PWA_BASE_ROUTE || '/ng').replace(/\/$/, '');

// 🚨 ИСПРАВЛЕНИЕ: Указываем путь к папке public в корне проекта
const publicDir = path.resolve(process.cwd(), 'public');
// Если папка public лежит внутри src, то: path.resolve(process.cwd(), 'src/public')

const manifest = {
  "name": "Hub | Панель управления",
  "short_name": "Hub",
  "theme_color": "#0a0a0a",
  "background_color": "#0a0a0a",
  "display": "standalone",
  "orientation": "portrait",
  "scope": `${baseRoute}/`,
  "start_url": `${baseRoute}/`,
  "categories": ["utilities", "productivity"],
  "icons": [
    { "src": `${baseRoute}/assets/icons/manifest-icon-192.maskable.png`, "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": `${baseRoute}/assets/icons/manifest-icon-512.maskable.png`, "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": `${baseRoute}/assets/icons/apple-icon-180.png`, "sizes": "180x180", "type": "image/png", "purpose": "any" }
  ],
  "screenshots": [
    {
      "src": `${baseRoute}/assets/icons/apple-splash-750-1334.png`,
      "sizes": "750x1334",
      "type": "image/png",
      "form_factor": "narrow" // Для мобильных устройств
    },
    {
      "src": `${baseRoute}/assets/icons/apple-splash-1792-828.png`,
      "sizes": "1792x828",
      "type": "image/png",
      "form_factor": "wide" // 🚨 Для компьютеров (wide)
    }
  ]
};

// Проверяем существование папки public, если нет — создаем
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 🚨 Записываем манифест строго в public/
fs.writeFileSync(
  path.join(publicDir, 'manifest.webmanifest'),
  JSON.stringify(manifest, null, 2),
  'utf8'
);
console.log(`🟢 [PWA Builder]: Манифест сгенерирован в public/manifest.webmanifest`);

// Вторая часть скрипта (преобразование путей в src/index.html) остается БЕЗ ИЗМЕНЕНИЙ
const projectSrcDir = path.resolve(process.cwd(), 'src');
const indexPath = path.join(projectSrcDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  indexHtml = indexHtml.replace(/href="public\//g, `href="${baseRoute}/`);
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log(`🟢 [PWA Builder]: Пути в index.html изменены.`);
}

async function generateFavicon() {
  const svgPath = path.resolve(process.cwd(), 'public/energise.svg');
  const icoPath = path.resolve(process.cwd(), 'public/favicon.ico'); // Сохраняем сразу в public/

  try {
    if (fs.existsSync(svgPath)) {
      // Конвертируем векторный SVG в четкую растровую иконку размером 32x32
      await sharp(svgPath)
        .resize(32, 32)
        .toFile(icoPath);

      console.log('🟢 [PWA Builder]: Новый favicon.ico успешно сгенерирован из energise.svg!');
    }
  } catch (err) {
    console.error('🚨 [PWA Builder Error]: Не удалось сгенерировать favicon.ico:', err);
  }
}

// Запускаем генерацию фавиконки
generateFavicon();
