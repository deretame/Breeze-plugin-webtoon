import type {
  ChapterContentContract,
  ChapterPage,
  ChapterPayload,
  ChapterSummary,
  ComicDetailContract,
  ComicDetailPayload,
  ComicListItem,
  FetchImageBytesPayload,
  FetchImageBytesResult,
  ReadSnapshotContract,
  ReadSnapshotPayload,
  SearchComicPayload,
  SearchResultContract,
  SettingsBundleContract,
  StringMap,
} from "breeze-plugin-kit";
import { pluginConfig, runtime } from "breeze-plugin-kit";
import {
  MOBILE_BASE,
  NOT_FOUND_IMAGE_URL,
  PC_BASE,
  PLUGIN_ID,
  WEBTOON_REFERER,
  createActionItem,
  createImage,
  createPaging,
  readString,
  toStringMap,
  trimTrailing,
} from "./common";
import {
  type UiLang,
  getHostLocaleRaw,
  resolveUiLang,
  t,
} from "./i18n";

export type WebtoonType = "webtoon" | "canvas";

export type ComicIdParts = {
  titleNo: string;
  type: WebtoonType;
  lang: string;
  href: string;
};

export type WebtoonEpisode = {
  episodeNo: number;
  episodeTitle: string;
  viewerLink: string;
  thumbnail?: string;
  exposureDateMillis?: number;
};

export type WebtoonImage = {
  url: string;
  width?: number;
  height?: number;
  sortOrder?: number;
};

/** 与 www.webtoons.com 语言切换一致（无简体 / 日韩） */
const LANG_OPTIONS = [
  { label: "English", value: "en" },
  { label: "中文 (繁體)", value: "zh-hant" },
  { label: "ภาษาไทย", value: "th" },
  { label: "Indonesia", value: "id" },
  { label: "Español", value: "es" },
  { label: "Français", value: "fr" },
  { label: "Deutsch", value: "de" },
] as const;

const SUPPORTED_LANGS = new Set(LANG_OPTIONS.map((item) => item.value));
const DEFAULT_LANG = "en";
/** 设置项：auto = 未手动指定，跟随后台语言 */
const LANG_AUTO = "auto";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36";

type RequestOpts = {
  allowR18?: boolean;
  uiLang?: UiLang;
};

function buildCookie(allowR18: boolean): string {
  // Tachiyomi / 官方 Web：ageGatePass 控制成人内容访问
  return [
    `ageGatePass=${allowR18 ? "true" : "false"}`,
    "needGDPR=false",
  ].join("; ");
}

function desktopHeaders(allowR18 = false): Record<string, string> {
  return {
    "User-Agent": DESKTOP_UA,
    Referer: WEBTOON_REFERER,
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: buildCookie(allowR18),
  };
}

function mobileHeaders(allowR18 = false): Record<string, string> {
  return {
    "User-Agent": MOBILE_UA,
    Referer: WEBTOON_REFERER,
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: buildCookie(allowR18),
  };
}

async function fetchText(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 20000,
  uiLang: UiLang = "en",
): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(t(uiLang, "error.http", { status: res.status, url }));
  }
  return res.text();
}

async function fetchJson<T = unknown>(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 20000,
  uiLang: UiLang = "en",
): Promise<T> {
  const text = await fetchText(url, headers, timeoutMs, uiLang);
  return JSON.parse(text) as T;
}

async function loadR18Preference(): Promise<boolean> {
  try {
    const raw = await pluginConfig.load("content.r18", "");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { value?: unknown };
    return parsed.value === true || parsed.value === "true";
  } catch {
    return false;
  }
}

/** 搜索结果 / 详情 HTML 粗判是否 mature */
function detectMatureFromNode($el: {
  find: (s: string) => { length: number };
  attr: (s: string) => string | undefined;
  html: () => string | null | undefined;
}): boolean {
  if ($el.find(".ico_age19, .age19, .ico_mature, .mature").length > 0) {
    return true;
  }
  const cls = readString($el.attr("class")).toLowerCase();
  if (cls.includes("age19") || cls.includes("mature")) return true;
  const html = readString($el.html() ?? "").toLowerCase();
  if (
    html.includes("ico_age19") ||
    html.includes("age19") ||
    html.includes("grade19") ||
    html.includes("mature")
  ) {
    return true;
  }
  return false;
}

function detectMatureFromDetailHtml(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("ico_age19") ||
    lower.includes("agegate") ||
    lower.includes("age_gate") ||
    lower.includes("mature") ||
    /grade\s*[=:]\s*["']?19/.test(lower)
  );
}

function isSupportedLang(lang: string): boolean {
  return SUPPORTED_LANGS.has(lang as (typeof LANG_OPTIONS)[number]["value"]);
}

/** 把宿主 / 系统 locale 映射到 Webtoon content-language */
function mapLocaleToWebtoonLang(localeRaw: string): string {
  const raw = readString(localeRaw).toLowerCase().replace(/_/g, "-");
  if (!raw) return DEFAULT_LANG;

  // 直接命中 content-language
  if (isSupportedLang(raw)) return raw;

  // zh-TW / zh-HK / zh-Hant* → 繁体；简体站没有对应语言，回退繁体
  if (raw.startsWith("zh")) {
    if (
      raw.includes("hant") ||
      raw.includes("tw") ||
      raw.includes("hk") ||
      raw.includes("mo")
    ) {
      return "zh-hant";
    }
    // zh-CN / zh-Hans 等
    return "zh-hant";
  }

  const primary = raw.split("-")[0] || "";
  if (isSupportedLang(primary)) return primary;

  return DEFAULT_LANG;
}

/** 搜索用 content-language：未设置则用宿主 locale 映射 */
async function resolveLocaleLang(): Promise<string> {
  const raw = await getHostLocaleRaw();
  if (!raw) return DEFAULT_LANG;
  return mapLocaleToWebtoonLang(raw);
}

/** 读取设置里的「默认搜索语言」原始值（auto / 具体语言） */
async function loadLangPreference(): Promise<string> {
  try {
    const raw = await pluginConfig.load("content.lang", "");
    if (!raw) return LANG_AUTO;
    const parsed = JSON.parse(raw) as { value?: unknown };
    const lang = readString(parsed.value);
    if (!lang || lang === LANG_AUTO) return LANG_AUTO;
    if (isSupportedLang(lang)) return lang;
    return LANG_AUTO;
  } catch {
    return LANG_AUTO;
  }
}

/**
 * 解析实际用于搜索的语言：
 * 1. 用户在设置中指定了具体语言 → 用该语言
 * 2. 未设置 / auto → 用宿主本地化信息映射
 */
async function resolveSearchLang(): Promise<string> {
  const pref = await loadLangPreference();
  if (pref !== LANG_AUTO && isSupportedLang(pref)) return pref;
  return resolveLocaleLang();
}

function encodeComicId(parts: ComicIdParts): string {
  const href = parts.href || "";
  return [parts.lang, parts.type, parts.titleNo, href]
    .map((s) => encodeURIComponent(s))
    .join("|");
}

function decodeComicId(comicId: string, fallbackLang = DEFAULT_LANG): ComicIdParts {
  const raw = readString(comicId);
  if (!raw) {
    throw new Error("comicId 不能为空");
  }

  if (raw.includes("|")) {
    const segs = raw.split("|").map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
    const lang = segs[0] || fallbackLang;
    const type = (segs[1] === "canvas" ? "canvas" : "webtoon") as WebtoonType;
    const titleNo = segs[2] || "";
    const href = segs[3] || "";
    if (!titleNo) throw new Error(`无效 comicId: ${comicId}`);
    return { lang, type, titleNo, href };
  }

  // 兼容纯 titleNo
  return {
    lang: fallbackLang,
    type: "webtoon",
    titleNo: raw,
    href: "",
  };
}

/**
 * 判断 Original / Canvas。
 * PC 路径多为 `/canvas/`，部分 deep link 为 `/challenge/`；
 * 移动端 API 类型名一律用 `canvas`。
 */
function inferType(href: string): WebtoonType {
  const s = readString(href).toLowerCase();
  if (
    s.includes("/canvas/") ||
    s.includes("/challenge/") ||
    s.includes("episodelist/challenge") ||
    s.includes("type=challenge") ||
    s.includes("type=canvas")
  ) {
    return "canvas";
  }
  return "webtoon";
}

function normalizeHref(href: string): string {
  const s = readString(href);
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return `${PC_BASE}${s}`;
  return s;
}

function normalizeViewerUrl(viewerLink: string): string {
  const s = readString(viewerLink);
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return `${MOBILE_BASE}${s}`;
  return `${MOBILE_BASE}/${s}`;
}

function listUrlFromViewer(viewerLink: string): string {
  const full = normalizeViewerUrl(viewerLink);
  if (!full) return "";
  try {
    const u = new URL(full);
    const parts = u.pathname.split("/").filter(Boolean);
    // en / fantasy / slug / ep-xxx / viewer
    // en / challenge / slug / ep-xxx / viewer
    if (parts.length >= 3) {
      const titleNo = u.searchParams.get("title_no") || "";
      return `${PC_BASE}/${parts[0]}/${parts[1]}/${parts[2]}/list?title_no=${titleNo}`;
    }
  } catch {
    // ignore
  }
  return "";
}

function imageFileName(url: string, index: number): string {
  try {
    const path = new URL(url).pathname;
    const name = path.split("/").filter(Boolean).pop() || "";
    if (name) return name;
  } catch {
    // ignore
  }
  return `${String(index + 1).padStart(4, "0")}.jpg`;
}

/** metadata 点击：打开本插件搜索 */
function createSearchAction(keyword: string, lang?: string): StringMap {
  return {
    type: "openSearch",
    payload: {
      source: PLUGIN_ID,
      keyword,
      extern: lang ? { lang } : {},
    },
  };
}

function emptyCreator() {
  return {
    id: "",
    name: "",
    avatar: {
      id: "",
      url: "",
      name: "",
      path: "",
      extern: {},
    },
    onTap: {},
    extern: {},
  };
}

/** 可点击 metadata 行（作者 / 分类等）；name 与各项均去尾部空白 */
function createClickableMetadata(
  type: string,
  name: string,
  values: string[],
  lang?: string,
) {
  const list = values
    .map((v) => trimTrailing(v).trimStart())
    .map((v) => v.trim())
    .filter(Boolean);
  if (!list.length) return null;
  return {
    type,
    name: trimTrailing(name),
    value: list.map((item) =>
      createActionItem(item, createSearchAction(item, lang)),
    ),
  };
}

/** titleMeta 展示项：去掉尾部空白，空串丢弃 */
function createTitleMetaItems(
  names: Array<string | number | null | undefined>,
) {
  return names
    .map((n) => trimTrailing(n))
    .filter((n) => n.length > 0)
    .map((n) => createActionItem(n));
}

// ---------------------------------------------------------------------------
// Webtoon API
// ---------------------------------------------------------------------------

export async function webSearch(
  query: string,
  lang: string,
  page = 1,
  opts: RequestOpts = {},
): Promise<{ results: ComicListItem[]; hasNext: boolean }> {
  const allowR18 = Boolean(opts.allowR18);
  const uiLang = opts.uiLang ?? "en";
  const u = new URL(`${PC_BASE}/${lang}/search`);
  u.searchParams.set("keyword", query);
  u.searchParams.set("page", String(page));

  const html = await fetchText(
    u.toString(),
    desktopHeaders(allowR18),
    20000,
    uiLang,
  );
  const $ = BreezeHtml.load(html);
  const results: ComicListItem[] = [];

  $(".webtoon_list li a").each((_, el) => {
    const $el = $(el);
    const title = trimTrailing($el.find(".title").text()).trim();
    const author = trimTrailing($el.find(".author").text()).trim();
    const href = normalizeHref(readString($el.attr("href")));
    const img = readString($el.find("img").attr("src"));
    const titleNo = readString($el.attr("data-title-no"));
    if (!title || !titleNo) return;

    const mature = detectMatureFromNode($el);
    if (mature && !allowR18) return;

    const type = inferType(href);
    const comicId = encodeComicId({ titleNo, type, lang, href });
    const coverPath = `comic/${titleNo}/cover.jpg`;

    results.push({
      source: PLUGIN_ID,
      id: comicId,
      title,
      subtitle: author,
      finished: false,
      likesCount: 0,
      viewsCount: 0,
      updatedAt: "",
      cover: createImage({
        id: titleNo,
        url: img || NOT_FOUND_IMAGE_URL,
        name: "cover.jpg",
        path: coverPath,
        extern: {},
      }),
      metadata: [
        createClickableMetadata(
          "author",
          t(uiLang, "meta.author"),
          author ? [author] : [],
          lang,
        ),
      ].filter((item): item is NonNullable<typeof item> => item != null),
      raw: { title, author, href, img, titleNo, type, lang, mature },
      extern: { href, type, lang, titleNo, mature },
    });
  });

  const hasNext = $("a.pagination[aria-current=true] + a").length > 0;
  return { results, hasNext };
}

export async function webDetail(
  detailUrl: string,
  opts: RequestOpts = {},
): Promise<{
  title: string;
  author: string;
  genre: string;
  summary: string;
  thumbnail: string;
  titleNo: string;
  url: string;
  mature: boolean;
}> {
  const allowR18 = Boolean(opts.allowR18);
  const uiLang = opts.uiLang ?? "en";
  const url = normalizeHref(detailUrl);
  if (!url) throw new Error(t(uiLang, "error.detailUrlEmpty"));

  const html = await fetchText(url, desktopHeaders(allowR18), 20000, uiLang);
  const mature = detectMatureFromDetailHtml(html);
  if (mature && !allowR18) {
    throw new Error(t(uiLang, "error.r18Blocked"));
  }

  const $ = BreezeHtml.load(html);

  const title = trimTrailing($("h1.subj, h3.subj").first().text()).trim();
  const author = trimTrailing(
    $(".detail_header .info .author_area")
      .first()
      .text()
      .replace(/author info/gi, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
  const genres: string[] = [];
  $(".detail_header .info .genre").each((_, el) => {
    const g = trimTrailing($(el).text()).trim();
    if (g) genres.push(g);
  });
  const summary =
    trimTrailing($("#_asideDetail p.summary").text()).trim() ||
    trimTrailing($(".detail_header p.summary").text()).trim();
  const thumbnail =
    readString($(".detail_header .thmb img").attr("src")) ||
    readString($('head meta[property="og:image"]').attr("content"));

  let titleNo = "";
  try {
    titleNo = new URL(url).searchParams.get("title_no") || "";
  } catch {
    titleNo = "";
  }

  return {
    title,
    author,
    genre: genres.join(", "),
    summary,
    thumbnail,
    titleNo,
    url,
    mature,
  };
}

export async function webEpisodeList(
  titleNo: string,
  type: WebtoonType = "webtoon",
  lang = DEFAULT_LANG,
  opts: RequestOpts = {},
): Promise<WebtoonEpisode[]> {
  const allowR18 = Boolean(opts.allowR18);
  const uiLang = opts.uiLang ?? "en";
  const u = new URL(`${MOBILE_BASE}/api/v1/${type}/${titleNo}/episodes`);
  u.searchParams.set("pageSize", "99999");
  if (type === "canvas") {
    u.searchParams.set("readingLanguageCode", lang);
  }

  const data = await fetchJson<{
    result?: { episodeList?: WebtoonEpisode[] };
  }>(u.toString(), mobileHeaders(allowR18), 20000, uiLang);

  const list = data?.result?.episodeList;
  return Array.isArray(list) ? list : [];
}

export async function webChapterPages(
  viewerLink: string,
  opts: RequestOpts = {},
): Promise<{ viewerUrl: string; imageList: WebtoonImage[] }> {
  const allowR18 = Boolean(opts.allowR18);
  const uiLang = opts.uiLang ?? "en";
  const viewerUrl = normalizeViewerUrl(viewerLink);
  if (!viewerUrl) throw new Error(t(uiLang, "error.noViewerLink", { id: "?" }));

  const html = await fetchText(
    viewerUrl,
    mobileHeaders(allowR18),
    20000,
    uiLang,
  );
  const match = html.match(/var\s+imageList\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error(t(uiLang, "error.noImageList"));
  }

  // JS object-like → JSON
  const jsonLike = match[1].replace(
    /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
    '$1"$2":',
  );
  const imageList = JSON.parse(jsonLike) as WebtoonImage[];
  if (!Array.isArray(imageList) || imageList.length === 0) {
    throw new Error(t(uiLang, "error.emptyImageList"));
  }

  imageList.sort(
    (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
  );

  return { viewerUrl, imageList };
}

function mapEpisodesToChapters(
  episodes: WebtoonEpisode[],
  comicId: string,
): ChapterSummary[] {
  return episodes.map((ep, index) => {
    const id = String(ep.episodeNo);
    const viewerLink = readString(ep.viewerLink);
    return {
      id,
      requestId: id,
      logicalKey: id,
      storageChapterId: id,
      name: readString(ep.episodeTitle) || `Ep. ${ep.episodeNo}`,
      order: index + 1,
      extern: {
        comicId,
        episodeNo: ep.episodeNo,
        viewerLink,
        thumbnail: ep.thumbnail ?? "",
        exposureDateMillis: ep.exposureDateMillis ?? 0,
      },
    };
  });
}

function pagesFromImageList(
  comicId: string,
  chapterId: string,
  imageList: WebtoonImage[],
): ChapterPage[] {
  return imageList.map((img, idx) => {
    const url = readString(img.url);
    const name = imageFileName(url, idx);
    return {
      id: `${chapterId}-p-${idx}`,
      name,
      path: `comic/${comicId}/${chapterId}/${name}`,
      url,
      extern: {
        width: img.width ?? 0,
        height: img.height ?? 0,
        sortOrder: img.sortOrder ?? idx,
      },
    };
  });
}

async function resolveDetailUrl(
  parts: ComicIdParts,
  opts: RequestOpts = {},
): Promise<string> {
  const uiLang = opts.uiLang ?? "en";
  if (parts.href) return normalizeHref(parts.href);

  // 从章节列表反推详情 URL
  const episodes = await webEpisodeList(
    parts.titleNo,
    parts.type,
    parts.lang,
    opts,
  );
  if (episodes.length > 0) {
    const fromViewer = listUrlFromViewer(episodes[0].viewerLink);
    if (fromViewer) return fromViewer;
  }

  throw new Error(
    t(uiLang, "error.cannotResolveDetail", { titleNo: parts.titleNo }),
  );
}

// ---------------------------------------------------------------------------
// Breeze fnPath
// ---------------------------------------------------------------------------

export async function searchComic(
  payload: SearchComicPayload = {},
): Promise<SearchResultContract> {
  const uiLang = await resolveUiLang();
  const allowR18 = await loadR18Preference();
  const extern = toStringMap(payload.extern);
  const page = Math.max(1, Number(payload.page ?? 1) || 1);
  const keyword = readString(payload.keyword ?? extern.keyword);
  if (!keyword) throw new Error(t(uiLang, "error.keywordRequired"));

  // 高级搜索 / extern 优先，否则用设置默认语言（未设置则跟随后台语言）
  const preferred = await resolveSearchLang();
  const fromExtern = readString(extern.lang);
  const lang =
    (fromExtern && isSupportedLang(fromExtern) ? fromExtern : "") ||
    preferred ||
    DEFAULT_LANG;

  const { results, hasNext } = await webSearch(keyword, lang, page, {
    allowR18,
    uiLang,
  });
  const paging = createPaging(
    page,
    hasNext ? page + 1 : page,
    results.length,
    !hasNext,
  );

  return {
    source: PLUGIN_ID,
    extern: { ...extern, keyword, lang, page },
    scheme: {
      version: "1.0.0",
      type: "searchResult",
      source: PLUGIN_ID,
      list: "comicGrid",
    },
    data: { paging, items: results },
    paging,
    items: results,
  };
}

export async function getComicDetail(
  payload: ComicDetailPayload = {},
): Promise<ComicDetailContract> {
  const uiLang = await resolveUiLang();
  const allowR18 = await loadR18Preference();
  const comicId = readString(payload.comicId);
  if (!comicId) throw new Error(t(uiLang, "error.comicIdRequired"));

  const configLang = await resolveSearchLang();
  const parts = decodeComicId(comicId, configLang);
  const extern = toStringMap(payload.extern);
  const reqOpts: RequestOpts = { allowR18, uiLang };

  // extern 可覆盖 href / type / lang
  if (readString(extern.href)) parts.href = readString(extern.href);
  if (readString(extern.type) === "canvas") parts.type = "canvas";
  if (readString(extern.lang)) parts.lang = readString(extern.lang);

  const detailUrl = await resolveDetailUrl(parts, reqOpts);
  parts.href = detailUrl;
  parts.type = inferType(detailUrl);

  const [detail, episodes] = await Promise.all([
    webDetail(detailUrl, reqOpts),
    webEpisodeList(parts.titleNo, parts.type, parts.lang, reqOpts),
  ]);

  if (detail.titleNo) parts.titleNo = detail.titleNo;

  const stableId = encodeComicId(parts);
  const chapters = mapEpisodesToChapters(episodes, stableId);
  const genres = detail.genre
    ? detail.genre
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const typeLabel = t(
    uiLang,
    parts.type === "canvas" ? "type.canvas" : "type.original",
  );

  return {
    source: PLUGIN_ID,
    comicId: stableId,
    extern: {
      ...extern,
      href: detailUrl,
      type: parts.type,
      lang: parts.lang,
      titleNo: parts.titleNo,
      mature: detail.mature,
    },
    scheme: {
      version: "1.0.0",
      type: "comicDetail",
      source: PLUGIN_ID,
    },
    data: {
      normal: {
        comicInfo: {
          id: stableId,
          title: detail.title || `WEBTOON #${parts.titleNo}`,
          // titleMeta：标题旁纯展示信息（不可点），统一去尾部空白
          titleMeta: createTitleMetaItems([
            t(uiLang, "titleMeta.type", { type: typeLabel }),
            t(uiLang, "titleMeta.chapters", { count: chapters.length }),
            t(uiLang, "titleMeta.lang", { lang: parts.lang }),
          ]),
          // 不使用独立作者卡片，作者放进 metadata
          creator: emptyCreator(),
          description: detail.summary || "",
          cover: createImage({
            id: parts.titleNo,
            url: detail.thumbnail || NOT_FOUND_IMAGE_URL,
            name: "cover.jpg",
            path: `comic/${parts.titleNo}/cover.jpg`,
          }),
          // metadata：可点击，跳转本插件搜索
          metadata: [
            createClickableMetadata(
              "author",
              t(uiLang, "meta.author"),
              detail.author ? [detail.author] : [],
              parts.lang,
            ),
            createClickableMetadata(
              "categories",
              t(uiLang, "meta.categories"),
              genres,
              parts.lang,
            ),
          ].filter((item): item is NonNullable<typeof item> => item != null),
          extern: {
            href: detailUrl,
            type: parts.type,
            lang: parts.lang,
            titleNo: parts.titleNo,
            mature: detail.mature,
          },
        },
        eps: chapters,
        recommend: [],
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        isFavourite: false,
        isLiked: false,
        allowComments: false,
        allowLike: false,
        allowCollected: false,
        allowDownload: true,
        extern: {
          href: detailUrl,
          type: parts.type,
          lang: parts.lang,
          titleNo: parts.titleNo,
          mature: detail.mature,
        },
      },
      raw: { detail, episodes, parts },
    },
  };
}

async function loadChapterPages(
  payload: ChapterPayload | ReadSnapshotPayload,
): Promise<{
  comicId: string;
  title: string;
  chapter: ChapterSummary & { pages: ChapterPage[] };
  chapters: ChapterSummary[];
  extern: StringMap | null;
}> {
  const uiLang = await resolveUiLang();
  const allowR18 = await loadR18Preference();
  const comicId = readString(payload.comicId);
  if (!comicId) throw new Error(t(uiLang, "error.comicIdRequired"));

  const detail = await getComicDetail({
    comicId,
    extern: payload.extern,
  });
  const chapters = detail.data.normal.eps;
  if (!chapters.length) throw new Error(t(uiLang, "error.noEpisodes"));

  const chapterId = readString(payload.chapterId);
  const chapter =
    chapters.find((c) => c.requestId === chapterId || c.id === chapterId) ??
    chapters[0];

  const chapterExtern = toStringMap(chapter.extern);
  let viewerLink = readString(chapterExtern.viewerLink);

  // 兜底：重新拉章节列表拿 viewerLink
  if (!viewerLink) {
    const configLang = await resolveSearchLang();
    const parts = decodeComicId(comicId, configLang);
    const episodes = await webEpisodeList(parts.titleNo, parts.type, parts.lang, {
      allowR18,
      uiLang,
    });
    const ep = episodes.find((e) => String(e.episodeNo) === chapter.id);
    viewerLink = readString(ep?.viewerLink);
  }

  if (!viewerLink) {
    throw new Error(t(uiLang, "error.noViewerLink", { id: chapter.id }));
  }

  const { imageList } = await webChapterPages(viewerLink, { allowR18, uiLang });
  const pages = pagesFromImageList(
    detail.comicId,
    chapter.storageChapterId,
    imageList,
  );

  return {
    comicId: detail.comicId,
    title: detail.data.normal.comicInfo.title,
    chapter: {
      ...chapter,
      pages,
      extern: { ...chapterExtern, viewerLink },
    },
    chapters,
    extern: payload.extern ?? null,
  };
}

export async function getChapter(
  payload: ChapterPayload = {},
): Promise<ChapterContentContract> {
  const loaded = await loadChapterPages(payload);
  return {
    source: PLUGIN_ID,
    comicId: loaded.comicId,
    chapterId: loaded.chapter.id,
    extern: loaded.extern,
    scheme: {
      version: "1.0.0",
      type: "chapterContent",
      source: PLUGIN_ID,
    },
    data: {
      comic: {
        id: loaded.comicId,
        source: PLUGIN_ID,
        title: loaded.title,
        extern: {},
      },
      chapter: loaded.chapter,
      chapters: loaded.chapters.map((item) => ({
        id: item.id,
        requestId: item.requestId,
        logicalKey: item.logicalKey,
        storageChapterId: item.storageChapterId,
        name: item.name,
        order: item.order,
        extern: item.extern,
      })),
    },
  };
}

export async function getReadSnapshot(
  payload: ReadSnapshotPayload = {},
): Promise<ReadSnapshotContract> {
  const loaded = await loadChapterPages(payload);
  return {
    source: PLUGIN_ID,
    extern: loaded.extern,
    data: {
      comic: {
        id: loaded.comicId,
        source: PLUGIN_ID,
        title: loaded.title,
        extern: {},
      },
      chapter: loaded.chapter,
      chapters: loaded.chapters.map((item) => ({
        id: item.id,
        name: item.name,
        order: item.order,
        extern: item.extern,
      })),
    },
  };
}

export async function fetchImageBytes(
  payload: FetchImageBytesPayload = {},
): Promise<FetchImageBytesResult> {
  const uiLang = await resolveUiLang();
  const allowR18 = await loadR18Preference();
  const targetUrl = readString(payload.url);
  if (!targetUrl) throw new Error(t(uiLang, "error.urlRequired"));

  const timeoutMs = Number(payload.timeoutMs ?? 30000) || 30000;
  const taskGroupKey = readString(payload.taskGroupKey);

  if (taskGroupKey && (await runtime.isTaskGroupCancelled(taskGroupKey))) {
    return new Uint8Array(0);
  }

  const res = await fetch(targetUrl, {
    method: "GET",
    headers: {
      "User-Agent": DESKTOP_UA,
      Referer: WEBTOON_REFERER,
      Cookie: buildCookie(allowR18),
      "x-rquickjs-host-offload-binary-v1": "1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(
      t(uiLang, "error.downloadFailed", {
        status: res.status,
        statusText: res.statusText,
      }),
    );
  }

  return new Uint8Array(await res.arrayBuffer());
}

export async function getSettingsBundle(): Promise<SettingsBundleContract> {
  const uiLang = await resolveUiLang();
  const pref = await loadLangPreference();
  const resolved = await resolveSearchLang();
  const r18 = await loadR18Preference();
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "settings",
      sections: [
        {
          title: t(uiLang, "settings.section.content"),
          fields: [
            {
              key: "content.lang",
              kind: "choice",
              label: t(uiLang, "settings.lang.label"),
              options: [
                {
                  label: t(uiLang, "settings.lang.followSystem", {
                    lang: resolved,
                  }),
                  value: LANG_AUTO,
                },
                ...LANG_OPTIONS.map((item) => ({
                  label: item.label,
                  value: item.value,
                })),
              ],
              fnPath: "onLangChanged",
              persist: true,
            },
            {
              key: "content.r18",
              kind: "switch",
              label: t(uiLang, "settings.r18.label"),
              fnPath: "onR18Changed",
              persist: true,
            },
          ],
        },
      ],
    },
    data: {
      canShowUserInfo: false,
      values: {
        "content.lang": pref,
        "content.r18": r18,
      },
    },
  };
}

export async function onLangChanged(payload: {
  key?: string;
  value?: unknown;
  extern?: StringMap;
}): Promise<Record<string, unknown>> {
  const key = readString(payload.key) || "content.lang";
  let value = readString(payload.value) || LANG_AUTO;
  if (value !== LANG_AUTO && !isSupportedLang(value)) {
    value = LANG_AUTO;
  }
  await pluginConfig.save(key, JSON.stringify({ value }));
  return { ok: true, value };
}

export async function onR18Changed(payload: {
  key?: string;
  value?: unknown;
  extern?: StringMap;
}): Promise<Record<string, unknown>> {
  const key = readString(payload.key) || "content.r18";
  const value = payload.value === true || payload.value === "true";
  await pluginConfig.save(key, JSON.stringify({ value }));
  return { ok: true, value };
}

export async function getAdvancedSearchScheme(): Promise<{
  source: string;
  scheme: {
    version: "1.0.0";
    type: "advancedSearch";
    title: string;
    fields: Array<{
      key: string;
      kind: "choice";
      label: string;
      options: Array<{ label: string; value: string }>;
    }>;
  };
  data: { values: Record<string, unknown> };
}> {
  const uiLang = await resolveUiLang();
  const lang = await resolveSearchLang();
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "advancedSearch",
      title: t(uiLang, "advancedSearch.title"),
      fields: [
        {
          key: "lang",
          kind: "choice",
          label: t(uiLang, "advancedSearch.lang"),
          options: LANG_OPTIONS.map((item) => ({
            label: item.label,
            value: item.value,
          })),
        },
      ],
    },
    data: { values: { lang } },
  };
}
