import { readString } from "./common";

/**
 * 插件 UI 语言。
 * - 内容搜索仍只用官网语言（无简体区）
 * - UI 额外支持简体：App 为 zh-CN / zh-Hans 时用 zh-hans 文案
 */
export type UiLang =
  | "en"
  | "zh-hant"
  | "zh-hans"
  | "th"
  | "id"
  | "es"
  | "fr"
  | "de";

export const UI_LANGS: UiLang[] = [
  "en",
  "zh-hant",
  "zh-hans",
  "th",
  "id",
  "es",
  "fr",
  "de",
];

type Dict = Record<string, string>;

const en: Dict = {
  "plugin.describe": "WEBTOON official web source",
  "settings.section.content": "Content",
  "settings.lang.label": "Default search language",
  "settings.lang.followSystem": "Follow system (current: {lang})",
  "settings.r18.label": "Show R18 / mature content",
  "advancedSearch.title": "Advanced search",
  "advancedSearch.lang": "Language",
  "meta.author": "Author",
  "meta.categories": "Genre",
  "titleMeta.type": "Type: {type}",
  "titleMeta.chapters": "Chapters: {count}",
  "titleMeta.lang": "Language: {lang}",
  "type.original": "Original",
  "type.canvas": "Canvas",
  "error.keywordRequired": "Please enter a search keyword",
  "error.comicIdRequired": "comicId is required",
  "error.noEpisodes": "No episodes available",
  "error.noViewerLink": "Episode {id} is missing viewerLink",
  "error.noImageList": "imageList not found on viewer page",
  "error.emptyImageList": "imageList is empty",
  "error.detailUrlEmpty": "Detail page URL is empty",
  "error.cannotResolveDetail":
    "Cannot resolve detail URL (titleNo={titleNo}). Open again from search.",
  "error.downloadFailed": "Download failed: {status} {statusText}",
  "error.http": "HTTP {status}: {url}",
  "error.r18Blocked": "This title is mature content. Enable R18 in plugin settings.",
  "error.urlRequired": "url is required",
};

const zhHant: Dict = {
  "plugin.describe": "WEBTOON 官方 Web 端源",
  "settings.section.content": "內容",
  "settings.lang.label": "預設搜尋語言",
  "settings.lang.followSystem": "跟隨系統（目前 {lang}）",
  "settings.r18.label": "顯示 R18 / 成人內容",
  "advancedSearch.title": "進階搜尋",
  "advancedSearch.lang": "語言",
  "meta.author": "作者",
  "meta.categories": "分類",
  "titleMeta.type": "類型：{type}",
  "titleMeta.chapters": "章節：{count}",
  "titleMeta.lang": "語言：{lang}",
  "type.original": "Original",
  "type.canvas": "Canvas",
  "error.keywordRequired": "請輸入搜尋關鍵字",
  "error.comicIdRequired": "comicId 不能為空",
  "error.noEpisodes": "該作品暫無章節",
  "error.noViewerLink": "章節 {id} 缺少 viewerLink",
  "error.noImageList": "未在 viewer 頁面找到 imageList",
  "error.emptyImageList": "imageList 為空",
  "error.detailUrlEmpty": "詳情頁 URL 為空",
  "error.cannotResolveDetail":
    "無法解析詳情頁 URL (titleNo={titleNo})，請從搜尋結果重新開啟",
  "error.downloadFailed": "下載失敗：{status} {statusText}",
  "error.http": "HTTP {status}: {url}",
  "error.r18Blocked": "此作品為成人內容，請在外掛設定中開啟 R18",
  "error.urlRequired": "url 不能為空",
};

const zhHans: Dict = {
  "plugin.describe": "WEBTOON 官方 Web 端源",
  "settings.section.content": "内容",
  "settings.lang.label": "默认搜索语言",
  "settings.lang.followSystem": "跟随系统（当前 {lang}）",
  "settings.r18.label": "显示 R18 / 成人内容",
  "advancedSearch.title": "高级搜索",
  "advancedSearch.lang": "语言",
  "meta.author": "作者",
  "meta.categories": "分类",
  "titleMeta.type": "类型：{type}",
  "titleMeta.chapters": "章节：{count}",
  "titleMeta.lang": "语言：{lang}",
  "type.original": "Original",
  "type.canvas": "Canvas",
  "error.keywordRequired": "请输入搜索关键词",
  "error.comicIdRequired": "comicId 不能为空",
  "error.noEpisodes": "该作品暂无章节",
  "error.noViewerLink": "章节 {id} 缺少 viewerLink",
  "error.noImageList": "未在 viewer 页面找到 imageList",
  "error.emptyImageList": "imageList 为空",
  "error.detailUrlEmpty": "详情页 URL 为空",
  "error.cannotResolveDetail":
    "无法解析详情页 URL (titleNo={titleNo})，请从搜索结果重新打开",
  "error.downloadFailed": "下载失败：{status} {statusText}",
  "error.http": "HTTP {status}: {url}",
  "error.r18Blocked": "此作品为成人内容，请在插件设置中开启 R18",
  "error.urlRequired": "url 不能为空",
};

const th: Dict = {
  ...en,
  "plugin.describe": "แหล่ง WEBTOON เว็บอย่างเป็นทางการ",
  "settings.section.content": "เนื้อหา",
  "settings.lang.label": "ภาษาค้นหาเริ่มต้น",
  "settings.lang.followSystem": "ตามระบบ (ปัจจุบัน: {lang})",
  "settings.r18.label": "แสดงเนื้อหา R18 / 18+",
  "advancedSearch.title": "ค้นหาขั้นสูง",
  "advancedSearch.lang": "ภาษา",
  "meta.author": "ผู้แต่ง",
  "meta.categories": "ประเภท",
  "titleMeta.type": "ประเภท: {type}",
  "titleMeta.chapters": "ตอน: {count}",
  "titleMeta.lang": "ภาษา: {lang}",
  "error.keywordRequired": "กรุณาใส่คำค้นหา",
  "error.comicIdRequired": "ต้องระบุ comicId",
  "error.noEpisodes": "ยังไม่มีตอน",
  "error.r18Blocked": "เรื่องนี้เป็นเนื้อหาสำหรับผู้ใหญ่ เปิด R18 ในการตั้งค่าปลั๊กอิน",
};

const id: Dict = {
  ...en,
  "plugin.describe": "Sumber web resmi WEBTOON",
  "settings.section.content": "Konten",
  "settings.lang.label": "Bahasa pencarian default",
  "settings.lang.followSystem": "Ikuti sistem (saat ini: {lang})",
  "settings.r18.label": "Tampilkan konten R18 / dewasa",
  "advancedSearch.title": "Pencarian lanjutan",
  "advancedSearch.lang": "Bahasa",
  "meta.author": "Penulis",
  "meta.categories": "Genre",
  "titleMeta.type": "Tipe: {type}",
  "titleMeta.chapters": "Episode: {count}",
  "titleMeta.lang": "Bahasa: {lang}",
  "error.keywordRequired": "Masukkan kata kunci pencarian",
  "error.comicIdRequired": "comicId wajib diisi",
  "error.noEpisodes": "Belum ada episode",
  "error.r18Blocked":
    "Judul ini konten dewasa. Aktifkan R18 di pengaturan plugin.",
};

const es: Dict = {
  ...en,
  "plugin.describe": "Fuente web oficial de WEBTOON",
  "settings.section.content": "Contenido",
  "settings.lang.label": "Idioma de búsqueda predeterminado",
  "settings.lang.followSystem": "Seguir el sistema (actual: {lang})",
  "settings.r18.label": "Mostrar contenido R18 / adulto",
  "advancedSearch.title": "Búsqueda avanzada",
  "advancedSearch.lang": "Idioma",
  "meta.author": "Autor",
  "meta.categories": "Género",
  "titleMeta.type": "Tipo: {type}",
  "titleMeta.chapters": "Capítulos: {count}",
  "titleMeta.lang": "Idioma: {lang}",
  "error.keywordRequired": "Introduce una palabra clave",
  "error.comicIdRequired": "comicId es obligatorio",
  "error.noEpisodes": "No hay episodios",
  "error.r18Blocked":
    "Este título es contenido adulto. Activa R18 en la configuración del plugin.",
};

const fr: Dict = {
  ...en,
  "plugin.describe": "Source web officielle WEBTOON",
  "settings.section.content": "Contenu",
  "settings.lang.label": "Langue de recherche par défaut",
  "settings.lang.followSystem": "Suivre le système (actuel : {lang})",
  "settings.r18.label": "Afficher le contenu R18 / mature",
  "advancedSearch.title": "Recherche avancée",
  "advancedSearch.lang": "Langue",
  "meta.author": "Auteur",
  "meta.categories": "Genre",
  "titleMeta.type": "Type : {type}",
  "titleMeta.chapters": "Chapitres : {count}",
  "titleMeta.lang": "Langue : {lang}",
  "error.keywordRequired": "Veuillez saisir un mot-clé",
  "error.comicIdRequired": "comicId est requis",
  "error.noEpisodes": "Aucun épisode disponible",
  "error.r18Blocked":
    "Ce titre est réservé aux adultes. Activez R18 dans les paramètres du plugin.",
};

const de: Dict = {
  ...en,
  "plugin.describe": "Offizieller WEBTOON-Web-Quell",
  "settings.section.content": "Inhalt",
  "settings.lang.label": "Standard-Suchsprache",
  "settings.lang.followSystem": "System folgen (aktuell: {lang})",
  "settings.r18.label": "R18- / Mature-Inhalte anzeigen",
  "advancedSearch.title": "Erweiterte Suche",
  "advancedSearch.lang": "Sprache",
  "meta.author": "Autor",
  "meta.categories": "Genre",
  "titleMeta.type": "Typ: {type}",
  "titleMeta.chapters": "Kapitel: {count}",
  "titleMeta.lang": "Sprache: {lang}",
  "error.keywordRequired": "Bitte Suchbegriff eingeben",
  "error.comicIdRequired": "comicId ist erforderlich",
  "error.noEpisodes": "Keine Episoden verfügbar",
  "error.r18Blocked":
    "Dieser Titel ist Mature-Inhalt. R18 in den Plugin-Einstellungen aktivieren.",
};

const TABLES: Record<UiLang, Dict> = {
  en,
  "zh-hant": zhHant,
  "zh-hans": zhHans,
  th,
  id,
  es,
  fr,
  de,
};

/** App / 系统 locale → 插件 UI 语言 */
export function mapLocaleToUiLang(localeRaw: string): UiLang {
  const raw = readString(localeRaw).toLowerCase().replace(/_/g, "-");
  if (!raw) return "en";

  if ((UI_LANGS as string[]).includes(raw)) return raw as UiLang;

  // 中文：中国大陆 / 简体 → 简体文案；台港澳 / 繁体 → 繁体文案
  if (raw.startsWith("zh")) {
    if (
      raw.includes("hant") ||
      raw.includes("tw") ||
      raw.includes("hk") ||
      raw.includes("mo")
    ) {
      return "zh-hant";
    }
    // zh / zh-CN / zh-Hans / zh-SG 等
    return "zh-hans";
  }

  const primary = raw.split("-")[0] || "";
  if ((UI_LANGS as string[]).includes(primary)) return primary as UiLang;

  return "en";
}

export async function getHostLocaleRaw(): Promise<string> {
  try {
    const bridge = (
      globalThis as { bridge?: { call?: (...args: unknown[]) => unknown } }
    ).bridge;
    if (typeof bridge?.call !== "function") return "";
    const raw = await Promise.resolve(bridge.call("dart.getLocaleInfo"));
    const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
    if (!text) return "";
    const info = JSON.parse(text) as {
      locale?: unknown;
      systemLocale?: unknown;
      language?: unknown;
    };
    return (
      readString(info.locale) ||
      readString(info.systemLocale) ||
      readString(info.language) ||
      ""
    );
  } catch {
    return "";
  }
}

/** 按宿主 App 语言解析插件 UI 语言 */
export async function resolveUiLang(): Promise<UiLang> {
  return mapLocaleToUiLang(await getHostLocaleRaw());
}

export function t(
  lang: UiLang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const table = TABLES[lang] || en;
  let text = table[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}
