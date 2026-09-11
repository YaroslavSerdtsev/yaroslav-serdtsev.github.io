// parse-games.mjs
// Запуск:             node parse-games.mjs
// С отладкой:         node parse-games.mjs --debug
// Посмотреть браузер: node parse-games.mjs --show
//
// Ссылки берутся из файла my_games_portfolio.txt (рядом со скриптом).
//
// Результат:
//   games-data.json      — для случая, когда сайт открыт через HTTP
//   games-data.js        — для случая, когда сайт открыт через file://
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
const SOURCE_TXT = path.join(__dirname, 'my_games_portfolio.txt');

const DEBUG = process.argv.includes('--debug');

/* =========================================================
   Парсинг my_games_portfolio.txt
   ========================================================= */

function slugToTitle(slug) {
  if (!slug) return null;
  const small = /^(the|and|of|for|in|on|a|an|to|vs|at|by|de|la|le)$/i;
  const parts = slug.split(/[-_]+/).filter(Boolean);
  return parts
    .map((w, i) => {
      if (w.length === 0) return '';
      if (i > 0 && small.test(w)) return w.toLowerCase();
      if (w === w.toUpperCase() && w.length <= 6) return w;
      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function classifyUrl(url, periodLabel) {
  // AppMagic (Google Play)
  let m = url.match(/appmagic\.rocks\/google-play\/([^/]+)\/([^/?#]+)/);
  if (m) {
    const slug = m[1];
    const pkg  = decodeURIComponent(m[2]);
    return {
      t: slugToTitle(slug),
      pkg,
      platform: 'googleplay',
      store: `https://play.google.com/store/apps/details?id=${pkg}`,
      appmagic: url,
      period: periodLabel
    };
  }

  // Steam
  m = url.match(/store\.steampowered\.com\/app\/(\d+)(?:\/([^/?#]+))?/);
  if (m) {
    const appid = m[1];
    const slug  = m[2] || `app-${appid}`;
    return {
      t: slugToTitle(slug),
      pkg: `app/${appid}`,
      platform: 'steam',
      store: url,
      icon: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
      period: periodLabel
    };
  }

  // RuStore
  m = url.match(/rustore\.ru\/catalog\/app\/([^/?#]+)/);
  if (m) {
    const pkg  = decodeURIComponent(m[1]);
    const tail = pkg.split('.').pop() || pkg;
    return {
      t: slugToTitle(tail),
      pkg,
      platform: 'rustore',
      store: url,
      period: periodLabel
    };
  }

  return null;
}

async function loadGamesFromTxt() {
  let txt;
  try {
    txt = await fs.readFile(SOURCE_TXT, 'utf8');
  } catch (e) {
    console.error(`\n✗ Не удалось прочитать файл:\n  ${SOURCE_TXT}\n`);
    console.error('  Убедитесь, что my_games_portfolio.txt лежит рядом со скриптом.');
    process.exit(1);
  }

  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const games = [];
  const seenPkg = new Set();
  const periodsOrdered = [];
  let periodLabel = null;

  for (const line of lines) {
    if (/^https?:\/\//i.test(line)) {
      const g = classifyUrl(line, periodLabel);
      if (!g) {
        console.warn(`  ⚠ пропускаю незнакомый URL: ${line}`);
        continue;
      }
      if (seenPkg.has(g.pkg)) continue;
      seenPkg.add(g.pkg);
      games.push(g);
      continue;
    }
    if (/\d{4}/.test(line)) {
      periodLabel = line;
      if (!periodsOrdered.includes(line)) periodsOrdered.push(line);
    }
  }

  return { games, periods: periodsOrdered };
}

/* =========================================================
   Файловые утилиты
   ========================================================= */
const safeName = s => s.replace(/[^a-zA-Z0-9._-]+/g, '_');

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'
};

function guessExtFromUrl(url) {
  const clean = url.split('?')[0].split('#')[0];
  const m = clean.match(/\.([a-z0-9]{2,5})$/i);
  const ext = m ? m[1].toLowerCase() : null;
  return ['jpg','jpeg','png','webp','gif','avif'].includes(ext)
    ? (ext === 'jpeg' ? 'jpg' : ext) : null;
}

function isImageUrl(u) {
  if (!u || typeof u !== 'string') return false;
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\.svgz?(\?|#|$)/i.test(u)) return false;
  if (/\.ico(\?|#|$)/i.test(u)) return false;
  return true;
}

function upscaleSteamShot(url) {
  return url.replace(/(\/ss_[a-f0-9]+)\.\d+x\d+(\.jpg)(\?.*)?$/i, '$1$2$3');
}

async function downloadImage(url, destDir, baseName, referer) {
  await fs.mkdir(destDir, { recursive: true });
  for (const ext of ['jpg','png','webp','gif','avif']) {
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
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct === 'image/svg+xml' || /\.svgz?(\?|#|$)/i.test(url)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return null;
    const ext = MIME_EXT[ct] || guessExtFromUrl(url) || 'jpg';
    const filePath = path.join(destDir, `${baseName}.${ext}`);
    await fs.writeFile(filePath, buf);
    return path.relative(__dirname, filePath).split(path.sep).join('/');
  } catch { return null; }
}

/* =========================================================
   AppMagic
   ========================================================= */
function setGoogleSize(url, spec) {
  const base = url.replace(/=[a-z0-9-]+(\?.*)?$/i, '');
  return `${base}${spec}`;
}

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

    let title = getMeta('og:title') || getMeta('twitter:title') || null;
    if (!title) {
      const h1 = document.querySelector('h1');
      if (h1) title = h1.textContent.trim();
    }
    if (!title) title = document.title || null;

    let description = getMeta('og:description') || getMeta('description');
    if (!description) {
      const c = [...document.querySelectorAll('main p, main div')]
        .map(el => el.textContent.trim())
        .filter(t => t.length > 120 && t.length < 4000);
      c.sort((a, b) => b.length - a.length);
      if (c[0]) description = c[0];
    }

    return { title, description };
  });

  const { icon, screenshots } = await extractAppMagicMedia(page);

  const iconFinal  = icon ? setGoogleSize(icon, '=w240-h480') : null;
  const shotsFinal = screenshots.filter(isImageUrl).map(u => setGoogleSize(u, '=w720'));

  if (DEBUG && debugKey) {
    await fs.writeFile(
      path.join(DEBUG_DIR, `${safeName(debugKey)}.urls.json`),
      JSON.stringify({ titleRaw: meta.title, iconRaw: icon, iconFinal, screenshotsRaw: screenshots, screenshotsFinal: shotsFinal }, null, 2),
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
async function parseSteam(page, url, fallbackIcon, debugKey) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await preparePage(page);

  if (DEBUG && debugKey) {
    await fs.mkdir(DEBUG_DIR, { recursive: true });
    await fs.writeFile(path.join(DEBUG_DIR, `${safeName(debugKey)}.html`), await page.content(), 'utf8');
    try { await page.screenshot({ path: path.join(DEBUG_DIR, `${safeName(debugKey)}.png`), fullPage: true }); } catch {}
  }

  const data = await page.evaluate(() => {
    const getMeta = (prop) => {
      const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
      return el?.getAttribute('content')?.trim() || null;
    };

    const shots = new Set();

    const addIfShot = (u) => {
      if (!u) return;
      u = String(u).trim();
      if (!/^https?:\/\//i.test(u)) return;
      if (!/steamstatic\.com\/.+\/ss_[a-f0-9]+(?:\.\d+x\d+)?\.jpg/i.test(u)) return;
      shots.add(u);
    };

    const selectors = [
      '#highlight_strip img',
      '.highlight_screenshot',
      '.highlight_screenshot img',
      '.highlight_strip_item img',
      '.highlight_selector img',
      '.screenshot_thumbnail img',
      '[id^="highlight_app"] img',
      '.apphub_HeaderStandardTop img',
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(img => {
        addIfShot(img.getAttribute('src'));
        addIfShot(img.getAttribute('data-src'));
        addIfShot(img.getAttribute('data-lazy-src'));
        addIfShot(img.currentSrc);
        const ss = img.getAttribute('srcset') || '';
        ss.split(',').map(p => p.trim().split(/\s+/)[0]).forEach(addIfShot);
      });
    });

    document.querySelectorAll('img').forEach(img => {
      addIfShot(img.currentSrc);
      addIfShot(img.getAttribute('src'));
      addIfShot(img.getAttribute('data-src'));
      addIfShot(img.getAttribute('data-lazy-src'));
      const ss = img.getAttribute('srcset') || '';
      ss.split(',').map(p => p.trim().split(/\s+/)[0]).forEach(addIfShot);
    });

    const html = document.documentElement.outerHTML;
    const re = /https?:\/\/[^"'\s]+steamstatic\.com\/[^"'\s]+\/ss_[a-f0-9]+(?:\.\d+x\d+)?\.jpg(?:\?[^"'\s]*)?/gi;
    for (const m of html.matchAll(re)) shots.add(m[0]);

    const dev  = document.querySelector('#developers_list a, .dev_row .summary.column a')?.textContent.trim();
    const date = document.querySelector('.release_date .date')?.textContent.trim();
    const tags = [...document.querySelectorAll('.glance_tags.popular_tags a')]
      .slice(0, 6).map(a => a.textContent.trim()).filter(Boolean).join(', ');
    const extra = {};
    if (dev) extra['Разработчик'] = dev;
    if (date) extra['Дата выхода'] = date;
    if (tags) extra['Теги'] = tags;

    return {
      title: getMeta('og:title') || getMeta('twitter:title') || null,
      description: getMeta('og:description') || getMeta('description'),
      icon: getMeta('og:image') || getMeta('og:image:secure_url'),
      screenshots: [...shots],
      extra,
    };
  });

  const cleaned = [...new Set(
    (data.screenshots || []).filter(isImageUrl).map(upscaleSteamShot)
  )].slice(0, 8);

  if (DEBUG && debugKey) {
    await fs.writeFile(
      path.join(DEBUG_DIR, `${safeName(debugKey)}.urls.json`),
      JSON.stringify({ titleRaw: data.title, screenshotsRaw: data.screenshots, screenshotsFinal: cleaned }, null, 2),
      'utf8'
    );
  }

  return { ...data, icon: data.icon || fallbackIcon || null, screenshots: cleaned };
}

/* =========================================================
   RuStore
   ========================================================= */
async function parseRuStore(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await preparePage(page);

  const data = await page.evaluate(() => {
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
      title: getMeta('og:title') || getMeta('twitter:title') || null,
      description: getMeta('og:description') || getMeta('description'),
      icon: getMeta('og:image') || [...shots][0] || null,
      screenshots: [...shots],
    };
  });

  const cleaned = [...new Set((data.screenshots || []).filter(isImageUrl))].slice(0, 6);
  return { ...data, screenshots: cleaned };
}

/* =========================================================
   Диспетчер
   ========================================================= */
async function scrape(page, g) {
  if (g.platform === 'googleplay') {
    if (!g.appmagic) throw new Error('нет ссылки на AppMagic');
    return await parseAppMagic(page, g.appmagic, g.pkg);
  }
  if (g.platform === 'steam') {
    return await parseSteam(page, g.store, g.icon, g.pkg);
  }
  if (g.platform === 'rustore') {
    return await parseRuStore(page, g.store);
  }
  throw new Error('неизвестная платформа');
}

/* =========================================================
   Скачивание
   ========================================================= */
async function downloadAssets(g, raw) {
  const dir = path.join(ASSETS_DIR, safeName(g.pkg));
  const result = { ...raw };

  const referer = g.platform === 'steam' ? 'https://store.steampowered.com/'
                : g.platform === 'rustore' ? 'https://www.rustore.ru/'
                : 'https://appmagic.rocks/';

  async function downloadWithFallback(url, baseName) {
    if (!isImageUrl(url)) return null;

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
   Очистка названия
   ========================================================= */
function decodeEntities(s) {
  if (!s) return s;
  const map = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', '#39':"'" };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, k) => map[k] ?? _)
    .replace(/[\u00A0\u2007\u2009\u200A\u202F\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_SUFFIXES = [
  /\s*[-–—|·:]\s*Data\s+Overview\s*$/i,
  /\s*[-–—|·:]\s*Overview\s*$/i,
  /\s*[-–—|·:]\s*App\s*Magic\b.*$/i,
  /\s*[-–—|·:]\s*AppMagic\b.*$/i,
  /\s*[-–—|·:]\s*Apps? on Google Play\s*$/i,
  /\s*[-–—|·:]\s*Google Play\s*$/i,
  /\s+on\s+Steam\s*$/i,
  /\s*[-–—|·:]\s*Steam\s*$/i,
  /\s*[-–—|·:]\s*RuStore\s*$/i,
  /\s*[-–—|·:]\s*RuStore[:\s].*$/i,
  /\s*[-–—|·]\s*$/,
  /^\s*[-–—|·:]\s*/,
];

const TITLE_BLACKLIST = /^(app\s*magic|appmagic|data\s+overview|overview|google\s+play|steam|rustore|app|приложение|игра)$/i;
const TITLE_REJECT_SUBSTR = /\bdata\s+overview\b|\bappmagic\b/i;

function cleanTitle(rawTitle) {
  if (!rawTitle) return null;
  let t = decodeEntities(rawTitle);

  let prev;
  do {
    prev = t;
    for (const re of TITLE_SUFFIXES) t = t.replace(re, '');
    t = t.trim();
  } while (t !== prev && t.length > 0);

  t = t.replace(/^[«"'`\u201C\u2018]+|[»"'`\u201D\u2019]+$/g, '').trim();

  const m = t.match(/^([^:|]{1,60}?)\s*[:|]\s*(.{20,})$/);
  if (m) t = m[1].trim();

  if (!t || t.length < 2) return null;
  if (TITLE_BLACKLIST.test(t)) return null;
  if (TITLE_REJECT_SUBSTR.test(t)) return null;

  if (t.length > 120) {
    const cut = t.split(/\s*[-–—|]\s*/)[0].trim();
    if (cut && cut.length >= 2 && cut.length <= 120) return cut;
    return t.slice(0, 120).trim();
  }
  return t;
}

/* =========================================================
   Публичный API
   ========================================================= */
export async function parseAll({ onProgress, headless = true } = {}) {
  const { games: GAMES, periods } = await loadGamesFromTxt();

  if (!GAMES.length) {
    console.error('\n✗ В файле не нашлось ни одной ссылки.\n');
    process.exit(1);
  }

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
      const cleanedTitle = cleanTitle(raw.title) || g.t;

      entry = await downloadAssets(g, { ...raw, title: cleanedTitle });
      entry = {
        ...entry,
        store: g.store,
        appmagic: g.appmagic || null,
        platform: g.platform,
        period: g.period || null,
        loaded: !!(cleanedTitle || entry.icon),
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
  return { generatedAt: Date.now(), count: GAMES.length, periods, games };
}

/* =========================================================
   Запись
   ========================================================= */
async function writeOutputs(data) {
  await fs.writeFile(OUT_FILE, JSON.stringify(data, null, 2), 'utf8');

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

  const preview = await loadGamesFromTxt();
  const byPlatform = preview.games.reduce((a, g) => {
    a[g.platform] = (a[g.platform] || 0) + 1;
    return a;
  }, {});

  console.log(`Источник: ${path.relative(process.cwd(), SOURCE_TXT)}`);
  console.log(`Игр найдено: ${preview.games.length}`);
  console.log(`Периодов в файле: ${preview.periods.length}`);
  console.log('По платформам:');
  Object.entries(byPlatform).forEach(([k, v]) => console.log(`  • ${k}: ${v}`));
  console.log(`Браузер: ${showBrowser ? 'видимый' : 'headless'}`);
  console.log('');

  const started = Date.now();
  const data = await parseAll({
    headless: !showBrowser,
    onProgress: (done, total, g, entry) => {
      const mark = entry?.loaded ? '✔' : '✗';
      const icon = entry?.icon ? 'иконка' : 'НЕТ иконки';
      const shots = entry?.screenshots?.length ?? 0;
      const titleShown = entry?.title && entry.title !== g.t ? ` «${entry.title}»` : '';
      process.stdout.write(
        `  [${String(done).padStart(2)}/${total}] ${mark} ${g.t}${titleShown} — ${icon}, ${shots} скр.\n`
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