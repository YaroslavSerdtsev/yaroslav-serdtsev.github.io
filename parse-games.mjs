// parse-games.mjs
// Запуск:             node parse-games.mjs
// С отладкой:         node parse-games.mjs --debug
// Посмотреть браузер: node parse-games.mjs --show
//
// Результат:
//   games-data.json      — для случая, когда сайт открыт через HTTP
//   games-data.js        — для случая, когда страница открыта через file://
//   assets/<pkg>/{icon.*, shot-1.*, ...}
//   debug/<pkg>.{html,png,urls.json}   — только с --debug

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const OUT_FILE   = path.join(__dirname, 'games-data.json');
const OUT_JS     = path.join(__dirname, 'games-data.js');
const ASSETS_DIR = path.join(__dirname, 'assets');
const DEBUG_DIR  = path.join(__dirname, 'debug');

const DEBUG = process.argv.includes('--debug');

/* =========================================================
   Список игр
   ========================================================= */
export const GAMES = [
  { t:'Clash of Monsters',        pkg:'com.exorid.ClashOfMonsters',       platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.ClashOfMonsters',       appmagic:'https://appmagic.rocks/google-play/clash-of-monsters/com.exorid.ClashOfMonsters' },
  { t:'Catch the Enemy\'s Flag',  pkg:'com.exorid.Catchtheenemysflag',    platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.Catchtheenemysflag',    appmagic:'https://appmagic.rocks/google-play/satch-the-enemy-s-flag/com.exorid.Catchtheenemysflag' },
  { t:'Stickman\'s Color Race',   pkg:'stickmens.coloring.gates.runner',  platform:'googleplay', store:'https://play.google.com/store/apps/details?id=stickmens.coloring.gates.runner',  appmagic:'https://appmagic.rocks/google-play/stickmans-color-race/stickmens.coloring.gates.runner' },
  { t:'Sling Ducks',              pkg:'com.exorid.SlingDucks',            platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.SlingDucks',            appmagic:'https://appmagic.rocks/google-play/sling-ducks/com.exorid.SlingDucks' },
  { t:'My Food Farm',             pkg:'com.exorid.MyFoodFarm',            platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.MyFoodFarm',            appmagic:'https://appmagic.rocks/google-play/my-food-farm/com.exorid.MyFoodFarm' },
  { t:'Peekaboo Rush',            pkg:'com.exorid.Peekaboo3D',            platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.Peekaboo3D',            appmagic:'https://appmagic.rocks/google-play/peekaboo-rush/com.exorid.Peekaboo3D' },
  { t:'Push Islands',             pkg:'com.exorid.PushIslands',           platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.PushIslands',           appmagic:'https://appmagic.rocks/google-play/push-islands/com.exorid.PushIslands' },
  { t:'Push Color',               pkg:'com.exorid.PushColor',             platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.PushColor',             appmagic:'https://appmagic.rocks/google-play/push-color/com.exorid.PushColor' },
  { t:'Conquest Masters',         pkg:'com.exorid.ConquestMasters',       platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.ConquestMasters',       appmagic:'https://appmagic.rocks/google-play/conquest-masters/com.exorid.ConquestMasters' },
  { t:'Lord\'s Land',             pkg:'com.exorid.LordsLands',            platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.LordsLands',            appmagic:'https://appmagic.rocks/google-play/lord-s-land/com.exorid.LordsLands' },
  { t:'Trash Factory',            pkg:'com.exorid.TrashFactory',          platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.TrashFactory',          appmagic:'https://appmagic.rocks/google-play/trash-factory/com.exorid.TrashFactory' },
  { t:'Dino Evo',                 pkg:'com.exorid.DinoEvo',               platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.DinoEvo',               appmagic:'https://appmagic.rocks/google-play/dino-evo/com.exorid.DinoEvo' },
  { t:'Island Invaders 3D',       pkg:'com.exorid.IslandInvaders3D',      platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.IslandInvaders3D',      appmagic:'https://appmagic.rocks/google-play/island-invaders-3d/com.exorid.IslandInvaders3D' },
  { t:'Psycho Clinic',            pkg:'com.exorid.PsychoClinic',          platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.PsychoClinic',          appmagic:'https://appmagic.rocks/google-play/psycho-clinic/com.exorid.PsychoClinic' },
  { t:'Balloon Hit Master',       pkg:'com.exorid.BalloonHitMaster',      platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.BalloonHitMaster',      appmagic:'https://appmagic.rocks/google-play/balloon-hit-master/com.exorid.BalloonHitMaster' },
  { t:'Grapple Up',               pkg:'com.exorid.GrappleUP',             platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.GrappleUP',             appmagic:'https://appmagic.rocks/google-play/grapple-up/com.exorid.GrappleUP' },
  { t:'Towers on Plains',         pkg:'com.exorid.TowersOnPlains',        platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.TowersOnPlains',        appmagic:'https://appmagic.rocks/google-play/towers-on-plains/com.exorid.TowersOnPlains' },
  { t:'Cube Flip',                pkg:'com.exorid.CubeFlip',              platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.CubeFlip',              appmagic:'https://appmagic.rocks/google-play/cube-flip/com.exorid.CubeFlip' },
  { t:'Knights Clash',            pkg:'com.exorid.KnightsClash',          platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.KnightsClash',          appmagic:'https://appmagic.rocks/google-play/knights-clash/com.exorid.KnightsClash' },
  { t:'Prison Maze',              pkg:'com.exorid.Prison',                platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.Prison',                appmagic:'https://appmagic.rocks/google-play/prison-maze/com.exorid.Prison' },
  { t:'Tower Raid',               pkg:'com.exorid.TowerRaid',             platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.TowerRaid',             appmagic:'https://appmagic.rocks/google-play/tower-raid/com.exorid.TowerRaid' },
  { t:'Twisted Roads',            pkg:'com.exorid.TwistedRoads',          platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.TwistedRoads',          appmagic:'https://appmagic.rocks/google-play/twisted-roads/com.exorid.TwistedRoads' },
  { t:'Farm Corp',                pkg:'com.exorid.FarmCorp',              platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.FarmCorp',              appmagic:'https://appmagic.rocks/google-play/farm-corp/com.exorid.FarmCorp' },
  { t:'My Dino Ranch',            pkg:'com.exorid.MyDinoRanch',           platform:'googleplay', store:'https://play.google.com/store/apps/details?id=com.exorid.MyDinoRanch',           appmagic:'https://appmagic.rocks/google-play/my-dinoranch/com.exorid.MyDinoRanch' },
  { t:'SUMO TATAMI',              pkg:'app/3395290',                      platform:'steam',      store:'https://store.steampowered.com/app/3395290/SUMO_TATAMI/', icon:'https://cdn.cloudflare.steamstatic.com/steam/apps/3395290/header.jpg' },
  { t:'Car Out Jam',              pkg:'com.Playgineers.CarOutJam',        platform:'rustore',    store:'https://www.rustore.ru/catalog/app/com.Playgineers.CarOutJam' },
  { t:'Boat Escape',              pkg:'com.playgineers.boatescape',       platform:'rustore',    store:'https://www.rustore.ru/catalog/app/com.playgineers.boatescape' }
];

/* =========================================================
   Файловые утилиты
   ========================================================= */
const safeName = s => s.replace(/[^a-zA-Z0-9._-]+/g, '_');

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg'
};

function guessExtFromUrl(url) {
  const clean = url.split('?')[0].split('#')[0];
  const m = clean.match(/\.([a-z0-9]{2,5})$/i);
  const ext = m ? m[1].toLowerCase() : null;
  return ['jpg','jpeg','png','webp','gif','avif','svg'].includes(ext)
    ? (ext === 'jpeg' ? 'jpg' : ext) : null;
}

async function downloadImage(url, destDir, baseName, referer) {
  await fs.mkdir(destDir, { recursive: true });
  for (const ext of ['jpg','png','webp','gif','avif','svg']) {
    const existing = path.join(destDir, `${baseName}.${ext}`);
    try {
      const stat = await fs.stat(existing);
      if (stat.size > 0) return path.relative(__dirname, existing).split(path.sep).join('/');
    } catch {}
  }
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': referer || 'https://appmagic.rocks/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return null;
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = MIME_EXT[ct] || guessExtFromUrl(url) || 'jpg';
    const filePath = path.join(destDir, `${baseName}.${ext}`);
    await fs.writeFile(filePath, buf);
    return path.relative(__dirname, filePath).split(path.sep).join('/');
  } catch { return null; }
}

/* =========================================================
   AppMagic: разворачивание прокси-URL
   ========================================================= */
function unwrapAppMagicUrl(src) {
  if (!src) return null;
  const m = src.match(/[?&]uri=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return src;
}

function setGoogleSize(url, spec) {
  const base = url.replace(/=[a-z0-9-]+(\?.*)?$/i, '');
  return `${base}${spec}`;
}

/* =========================================================
   AppMagic: извлечение иконки и скриншотов
   ========================================================= */
async function extractAppMagicMedia(page) {
  return await page.evaluate(() => {
    const unwrap = (src) => {
      if (!src) return null;
      const m = src.match(/[?&]uri=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
      return src;
    };

    const iconEl = document.querySelector(
      'img.app-info-main-icon, img.g-app-icon, img[data-e2e-icon].app-info-main-icon'
    );
    const iconRaw = iconEl ? (iconEl.currentSrc || iconEl.src) : null;
    const iconUrl = iconRaw ? unwrap(iconRaw) : null;

    const all = [...document.querySelectorAll('img')];
    const screenshots = [];
    const seen = new Set();

    for (const img of all) {
      if (img.classList.contains('app-info-main-icon')) continue;
      if (img.classList.contains('g-app-icon')) continue;

      const raw = img.currentSrc || img.src;
      const real = unwrap(raw);
      if (!real) continue;
      if (!/play-lh\.googleusercontent\.com|ggpht\.com|lh\d\.googleusercontent\.com/.test(real)) continue;

      const isSquare = /=s\d+(-c)?(\?|$)/i.test(real) && !/[hw]\d+/i.test(real);
      if (isSquare) continue;

      const hasHW = /[?=&][hw]\d+/i.test(real) || /=[hw]\d+/i.test(real);
      if (!hasHW) continue;

      const key = real.split('=')[0];
      if (seen.has(key)) continue;
      seen.add(key);

      screenshots.push(real);
    }

    return { icon: iconUrl, screenshots };
  });
}

/* =========================================================
   Подготовка страницы
   ========================================================= */
async function preparePage(page) {
  try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}
  await page.waitForTimeout(1500);

  await page.evaluate(async () => {
    const kw = /screenshot|media|show all|show more|see all|expand|preview|показать|ещё|развернуть|скриншот/i;
    const btns = [...document.querySelectorAll('button, [role="tab"], [role="button"], a')];
    for (const b of btns) {
      const t = (b.textContent || '').trim();
      if (!t || t.length > 60 || !kw.test(t)) continue;
      try { b.scrollIntoView({ block: 'center' }); b.click(); await new Promise(r => setTimeout(r, 400)); } catch {}
    }
  });

  await page.evaluate(async () => {
    const H = document.body.scrollHeight;
    for (let y = 0; y < H; y += 350) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 110)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);

  await page.evaluate(async () => {
    const scrollables = [...document.querySelectorAll('*')].filter(el => {
      const s = getComputedStyle(el);
      return (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 40;
    });
    for (const el of scrollables) {
      const max = el.scrollWidth - el.clientWidth;
      const step = Math.max(180, el.clientWidth * 0.7);
      for (let x = 0; x <= max; x += step) { el.scrollLeft = x; await new Promise(r => setTimeout(r, 220)); }
      el.scrollLeft = 0;
      await new Promise(r => setTimeout(r, 100));
    }
  });

  await page.evaluate(async () => {
    const H = document.body.scrollHeight;
    for (let y = 0; y < H; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
}

/* =========================================================
   AppMagic
   ========================================================= */
async function parseAppMagic(page, url, debugKey) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await preparePage(page);

  if (DEBUG && debugKey) {
    await fs.mkdir(DEBUG_DIR, { recursive: true });
    await fs.writeFile(path.join(DEBUG_DIR, `${safeName(debugKey)}.html`), await page.content(), 'utf8');
    try { await page.screenshot({ path: path.join(DEBUG_DIR, `${safeName(debugKey)}.png`), fullPage: true }); } catch {}
  }

  const meta = await page.evaluate(() => {
    const getMeta = (prop) => {
      const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
      return el?.getAttribute('content')?.trim() || null;
    };
    let description = getMeta('og:description') || getMeta('description');
    if (!description) {
      const c = [...document.querySelectorAll('main p, main div')]
        .map(el => el.textContent.trim())
        .filter(t => t.length > 120 && t.length < 4000);
      c.sort((a, b) => b.length - a.length);
      if (c[0]) description = c[0];
    }
    const title = (getMeta('og:title') || document.title || '')
      .replace(/\s*[-–—]\s*AppMagic.*$/i, '')
      .replace(/\s*\|\s*AppMagic.*$/i, '')
      .trim() || null;
    return { title, description };
  });

  const { icon, screenshots } = await extractAppMagicMedia(page);

  const iconFinal = icon ? setGoogleSize(icon, '=w240-h480') : null;
  const shotsFinal = screenshots.map(u => setGoogleSize(u, '=w720'));

  if (DEBUG && debugKey) {
    await fs.writeFile(
      path.join(DEBUG_DIR, `${safeName(debugKey)}.urls.json`),
      JSON.stringify({ iconRaw: icon, iconFinal, screenshotsRaw: screenshots, screenshotsFinal: shotsFinal }, null, 2),
      'utf8'
    );
  }

  return {
    title: meta.title,
    description: meta.description,
    icon: iconFinal,
    screenshots: shotsFinal,
    _found: screenshots.length
  };
}

/* =========================================================
   Steam
   ========================================================= */
async function parseSteam(page, url, fallbackIcon) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await preparePage(page);

  const data = await page.evaluate(() => {
    const getMeta = (prop) => {
      const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
      return el?.getAttribute('content')?.trim() || null;
    };
    const shots = new Set();
    document.querySelectorAll('#highlight_strip img, .highlight_screenshot img, .highlight_strip_item img')
      .forEach(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-src');
        if (src) shots.add(src);
      });
    if (shots.size === 0) {
      document.querySelectorAll('img').forEach(img => {
        const u = img.currentSrc || img.src;
        if (u && /steamstatic\.com\/steam\/apps\/\d+\/ss_/i.test(u)) shots.add(u);
      });
    }
    const dev = document.querySelector('#developers_list a, .dev_row .summary.column a')?.textContent.trim();
    const date = document.querySelector('.release_date .date')?.textContent.trim();
    const tags = [...document.querySelectorAll('.glance_tags.popular_tags a')]
      .slice(0, 6).map(a => a.textContent.trim()).filter(Boolean).join(', ');
    const extra = {};
    if (dev) extra['Разработчик'] = dev;
    if (date) extra['Дата выхода'] = date;
    if (tags) extra['Теги'] = tags;
    return {
      title: (getMeta('og:title') || document.title || '').replace(/\s+on Steam\s*$/i, '').trim(),
      description: getMeta('og:description') || getMeta('description'),
      icon: getMeta('og:image') || getMeta('og:image:secure_url'),
      screenshots: [...shots].slice(0, 6),
      extra
    };
  });

  return { ...data, title: data.title || 'SUMO TATAMI', icon: data.icon || fallbackIcon || null };
}

/* =========================================================
   RuStore
   ========================================================= */
async function parseRuStore(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await preparePage(page);

  return await page.evaluate(() => {
    const getMeta = (prop) => {
      const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
      return el?.getAttribute('content')?.trim() || null;
    };
    const shots = new Set();
    document.querySelectorAll('img').forEach(img => {
      const u = img.currentSrc || img.src;
      if (!u) return;
      if (/icon|logo|sprite|favicon|avatar/i.test(u)) return;
      if (img.naturalWidth && img.naturalWidth < 200) return;
      shots.add(u);
    });
    return {
      title: (getMeta('og:title') || document.title || '').replace(/\s*[-–—]\s*RuStore\s*$/i, '').trim(),
      description: getMeta('og:description') || getMeta('description'),
      icon: getMeta('og:image') || [...shots][0] || null,
      screenshots: [...shots].slice(0, 6)
    };
  });
}

/* =========================================================
   Диспетчер
   ========================================================= */
async function scrape(page, g) {
  if (g.platform === 'googleplay') {
    if (!g.appmagic) throw new Error('нет ссылки на AppMagic');
    return await parseAppMagic(page, g.appmagic, g.pkg);
  }
  if (g.platform === 'steam') return await parseSteam(page, g.store, g.icon);
  if (g.platform === 'rustore') return await parseRuStore(page, g.store);
  throw new Error('неизвестная платформа');
}

/* =========================================================
   Скачивание с фолбэком через AppMagic-прокси
   ========================================================= */
async function downloadAssets(g, raw) {
  const dir = path.join(ASSETS_DIR, safeName(g.pkg));
  const result = { ...raw };

  const referer = g.platform === 'steam' ? 'https://store.steampowered.com/'
                : g.platform === 'rustore' ? 'https://www.rustore.ru/'
                : 'https://appmagic.rocks/';

  async function downloadWithFallback(url, baseName) {
    let local = await downloadImage(url, dir, baseName, referer);
    if (local) return local;

    if (/play-lh\.googleusercontent\.com|ggpht\.com|lh\d\.googleusercontent\.com/.test(url)) {
      const proxied = `https://images.appmagic.rocks/?uri=${encodeURIComponent(url)}`;
      local = await downloadImage(proxied, dir, baseName, referer);
      if (local) return local;
    }
    return null;
  }

  if (raw.icon) {
    const local = await downloadWithFallback(raw.icon, 'icon');
    if (local) result.icon = local;
  }

  const localShots = [];
  for (let i = 0; i < (raw.screenshots || []).length; i++) {
    const local = await downloadWithFallback(raw.screenshots[i], `shot-${i + 1}`);
    if (local) localShots.push(local);
  }
  result.screenshots = localShots;

  return result;
}

/* =========================================================
   Публичный API
   ========================================================= */
export async function parseAll({ onProgress, headless = true } = {}) {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  if (DEBUG) await fs.mkdir(DEBUG_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' }
  });
  const page = await context.newPage();

  const games = {};
  let done = 0;

  for (const g of GAMES) {
    let entry;
    try {
      const raw = await scrape(page, g);
      entry = await downloadAssets(g, raw);
      entry = {
        ...entry,
        title: entry.title || g.t,
        store: g.store,
        appmagic: g.appmagic || null,
        platform: g.platform,
        loaded: !!(entry.title || entry.icon),
        parsedAt: Date.now()
      };
    } catch (e) {
      entry = { title: g.t, loaded: false, error: String(e.message || e), parsedAt: Date.now() };
    }
    games[g.pkg] = entry;
    done++;
    if (typeof onProgress === 'function') onProgress(done, GAMES.length, g, entry);
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
  }

  await browser.close();
  return { generatedAt: Date.now(), count: GAMES.length, games };
}

/* =========================================================
   Запись результатов: JSON + JS
   ========================================================= */
async function writeOutputs(data) {
  // 1. JSON — на случай, если сайт открыт через HTTP
  await fs.writeFile(OUT_FILE, JSON.stringify(data, null, 2), 'utf8');

  // 2. JS — чтобы работало через file:// без CORS
  //    обрезаем длинные описания, чтобы файл не раздувался
  const lean = JSON.parse(JSON.stringify(data));
  for (const g of Object.values(lean.games)) {
    if (g.description && g.description.length > 500) {
      g.description = g.description.slice(0, 500).trimEnd() + '…';
    }
  }
  const jsBody =
    '/* Автоматически сгенерировано parse-games.mjs.\n' +
    '   Не редактируйте вручную — перезапишется при следующем запуске. */\n' +
    'window.__GAMES_DATA = ' + JSON.stringify(lean) + ';\n';
  await fs.writeFile(OUT_JS, jsBody, 'utf8');

  return { jsonBytes: (await fs.stat(OUT_FILE)).size, jsBytes: (await fs.stat(OUT_JS)).size };
}

/* =========================================================
   CLI
   ========================================================= */
const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  const showBrowser = process.argv.includes('--show');
  console.log(`Парсер запущен. Игр: ${GAMES.length}. Браузер: ${showBrowser ? 'видимый' : 'headless'}`);
  console.log(`Картинки: ${path.relative(process.cwd(), ASSETS_DIR)}/`);
  if (DEBUG) console.log(`Debug: ${path.relative(process.cwd(), DEBUG_DIR)}/`);
  console.log('');

  const started = Date.now();
  const data = await parseAll({
    headless: !showBrowser,
    onProgress: (done, total, g, entry) => {
      const mark = entry?.loaded ? '✔' : '✗';
      const icon = entry?.icon ? 'иконка' : 'НЕТ иконки';
      const shots = entry?.screenshots?.length ?? 0;
      const found = entry?._found != null ? ` (найдено ${entry._found})` : '';
      process.stdout.write(
        `  [${String(done).padStart(2)}/${total}] ${mark} ${g.t} — ${icon}, ${shots} скр.${found}\n`
      );
    }
  });

  const sizes = await writeOutputs(data);

  const ok = Object.values(data.games).filter(v => v.loaded).length;
  const withIcon = Object.values(data.games).filter(v => v.icon).length;
  const withShots = Object.values(data.games).filter(v => v.screenshots?.length).length;
  const totalShots = Object.values(data.games).reduce((n, v) => n + (v.screenshots?.length || 0), 0);
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  const kb = b => (b / 1024).toFixed(1) + ' КБ';

  console.log('\n──────────────────────────────────');
  console.log(`Готово:       ${ok} / ${data.count} игр с данными`);
  console.log(`С иконкой:    ${withIcon}`);
  console.log(`Со скринами:  ${withShots} игр, ${totalShots} изображений`);
  console.log(`games-data.json: ${kb(sizes.jsonBytes)}`);
  console.log(`games-data.js:   ${kb(sizes.jsBytes)}`);
  console.log(`Картинки:     ${path.relative(process.cwd(), ASSETS_DIR)}/`);
  console.log(`Время:        ${sec} с`);
  console.log('──────────────────────────────────');
}