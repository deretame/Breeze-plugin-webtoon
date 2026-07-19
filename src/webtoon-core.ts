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
  fetchAllEpisodes,
  fetchEpisodeImages,
  fetchTitleDetail,
  searchMerged,
  type AppEpisode,
  type AppWebtoonType,
} from "./app-api";
import {
  IMAGE_REFERER,
  NOT_FOUND_IMAGE_URL,
  PLUGIN_ID,
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

export type WebtoonType = AppWebtoonType;

export type ComicIdParts = {
  titleNo: string;
  type: WebtoonType;
  lang: string;
  href: string;
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
const LANG_AUTO = "auto";
const SEARCH_PAGE_SIZE = 20;

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";

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

function isSupportedLang(lang: string): boolean {
  return SUPPORTED_LANGS.has(lang as (typeof LANG_OPTIONS)[number]["value"]);
}

function mapLocaleToWebtoonLang(localeRaw: string): string {
  const raw = readString(localeRaw).toLowerCase().replace(/_/g, "-");
  if (!raw) return DEFAULT_LANG;
  if (isSupportedLang(raw)) return raw;
  if (raw.startsWith("zh")) {
    if (
      raw.includes("hant") ||
      raw.includes("tw") ||
      raw.includes("hk") ||
      raw.includes("mo")
    ) {
      return "zh-hant";
    }
    return "zh-hant";
  }
  const primary = raw.split("-")[0] || "";
  if (isSupportedLang(primary)) return primary;
  return DEFAULT_LANG;
}

async function resolveLocaleLang(): Promise<string> {
  const raw = await getHostLocaleRaw();
  if (!raw) return DEFAULT_LANG;
  return mapLocaleToWebtoonLang(raw);
}

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

function decodeComicId(
  comicId: string,
  fallbackLang = DEFAULT_LANG,
): ComicIdParts {
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

  return {
    lang: fallbackLang,
    type: "webtoon",
    titleNo: raw,
    href: "",
  };
}

function imageFileName(url: string, index: number): string {
  try {
    const path = new URL(url).pathname;
    const name = path.split("/").filter(Boolean).pop() || "";
    if (name) return name.split("?")[0] || name;
  } catch {
    // ignore
  }
  return `${String(index + 1).padStart(4, "0")}.jpg`;
}

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

function createTitleMetaItems(
  names: Array<string | number | null | undefined>,
) {
  return names
    .map((n) => trimTrailing(n))
    .filter((n) => n.length > 0)
    .map((n) => createActionItem(n));
}

function mapEpisodesToChapters(
  episodes: AppEpisode[],
  comicId: string,
): ChapterSummary[] {
  return episodes.map((ep, index) => {
    const id = String(ep.episodeNo);
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
        thumbnail: ep.thumbnailImageUrl ?? "",
        exposureDateMillis: ep.exposureYmdt ?? 0,
        exposureType: ep.exposureType ?? "",
      },
    };
  });
}

function pagesFromImages(
  comicId: string,
  chapterId: string,
  images: Array<{
    url: string;
    width?: number;
    height?: number;
    sortOrder?: number;
  }>,
): ChapterPage[] {
  return images.map((img, idx) => {
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

  const preferred = await resolveSearchLang();
  const fromExtern = readString(extern.lang);
  const lang =
    (fromExtern && isSupportedLang(fromExtern) ? fromExtern : "") ||
    preferred ||
    DEFAULT_LANG;

  const { hits, hasNext, total, webtoonTotal, canvasTotal } =
    await searchMerged(keyword, lang, page, SEARCH_PAGE_SIZE, allowR18);

  const results: ComicListItem[] = hits.map((hit) => {
    const titleNo = String(hit.titleNo);
    const type = hit.type;
    const comicId = encodeComicId({
      titleNo,
      type,
      lang,
      href: "",
    });
    const author =
      [hit.writingAuthorName, hit.pictureAuthorName]
        .filter(Boolean)
        .join(" / ") ||
      hit.writingAuthorName ||
      "";
    const coverPath = `comic/${titleNo}/cover.jpg`;
    const typeLabel = t(
      uiLang,
      type === "canvas" ? "type.canvas" : "type.original",
    );

    return {
      source: PLUGIN_ID,
      id: comicId,
      title: hit.title,
      subtitle: author,
      finished: false,
      likesCount: hit.likeitCount ?? 0,
      viewsCount: hit.readCount ?? 0,
      updatedAt: "",
      cover: createImage({
        id: titleNo,
        url: hit.thumbnail || NOT_FOUND_IMAGE_URL,
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
        createClickableMetadata(
          "type",
          t(uiLang, "meta.type"),
          [typeLabel],
          lang,
        ),
      ].filter((item): item is NonNullable<typeof item> => item != null),
      raw: {
        title: hit.title,
        author,
        titleNo,
        type,
        lang,
        mature: Boolean(hit.ageGradeNotice || hit.unsuitableForChildren),
      },
      extern: {
        type,
        lang,
        titleNo,
        mature: Boolean(hit.ageGradeNotice || hit.unsuitableForChildren),
      },
    };
  });

  const pages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE) || 1);
  const paging = createPaging(page, pages, total, !hasNext);

  return {
    source: PLUGIN_ID,
    extern: {
      ...extern,
      keyword,
      lang,
      page,
      webtoonTotal,
      canvasTotal,
      api: "app",
    },
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

  if (readString(extern.type) === "canvas") parts.type = "canvas";
  if (readString(extern.type) === "webtoon") parts.type = "webtoon";
  if (readString(extern.lang)) parts.lang = readString(extern.lang);
  if (readString(extern.titleNo)) parts.titleNo = readString(extern.titleNo);

  const titleNoNum = Number(parts.titleNo);
  if (!titleNoNum) {
    throw new Error(t(uiLang, "error.comicIdRequired"));
  }

  const [detail, episodes] = await Promise.all([
    fetchTitleDetail(titleNoNum, parts.type, parts.lang),
    fetchAllEpisodes(titleNoNum, parts.type, parts.lang),
  ]);

  if (detail.mature && !allowR18) {
    throw new Error(t(uiLang, "error.r18Blocked"));
  }

  parts.titleNo = String(detail.titleNo || parts.titleNo);
  const stableId = encodeComicId(parts);
  const chapters = mapEpisodesToChapters(episodes, stableId);
  const genres = detail.genre
    ? detail.genre
        .split(/[,/|]/)
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
      type: parts.type,
      lang: parts.lang,
      titleNo: parts.titleNo,
      mature: detail.mature,
      api: "app",
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
          titleMeta: createTitleMetaItems([
            t(uiLang, "titleMeta.type", { type: typeLabel }),
            t(uiLang, "titleMeta.chapters", { count: chapters.length }),
            t(uiLang, "titleMeta.lang", { lang: parts.lang }),
          ]),
          creator: emptyCreator(),
          description: detail.synopsis || "",
          cover: createImage({
            id: parts.titleNo,
            url: detail.thumbnail || NOT_FOUND_IMAGE_URL,
            name: "cover.jpg",
            path: `comic/${parts.titleNo}/cover.jpg`,
          }),
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
            type: parts.type,
            lang: parts.lang,
            titleNo: parts.titleNo,
            mature: detail.mature,
          },
        },
        eps: chapters,
        recommend: [],
        totalViews: detail.readCount,
        totalLikes: detail.favoriteCount,
        totalComments: 0,
        isFavourite: false,
        isLiked: false,
        allowComments: false,
        allowLike: false,
        allowCollected: false,
        allowDownload: true,
        extern: {
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
  type: WebtoonType;
  lang: string;
  titleNo: string;
}> {
  const uiLang = await resolveUiLang();
  const comicId = readString(payload.comicId);
  if (!comicId) throw new Error(t(uiLang, "error.comicIdRequired"));

  const detail = await getComicDetail({
    comicId,
    extern: payload.extern,
  });
  const chapters = detail.data.normal.eps;
  if (!chapters.length) throw new Error(t(uiLang, "error.noEpisodes"));

  const chapterId = readString(payload.chapterId);
  let chapter = chapters.find(
    (c) => c.requestId === chapterId || c.id === chapterId,
  );

  if (!chapter) {
    const extern = toStringMap(payload.extern);
    const episodeNo = Number(extern.episodeNo);
    if (episodeNo > 0) {
      chapter = chapters.find((c) => {
        const cExtern = toStringMap(c.extern);
        return Number(cExtern.episodeNo) === episodeNo;
      });
    }
  }

  chapter = chapter ?? chapters[0];
  const chapterExtern = toStringMap(chapter.extern);
  const episodeNo =
    Number(chapterExtern.episodeNo) || Number(chapter.id) || 0;
  if (!episodeNo) {
    throw new Error(t(uiLang, "error.noViewerLink", { id: chapter.id }));
  }

  const configLang = await resolveSearchLang();
  const parts = decodeComicId(detail.comicId, configLang);
  const type = parts.type;
  const lang = parts.lang;
  const titleNo = parts.titleNo;

  const { images, episodeTitle } = await fetchEpisodeImages(
    Number(titleNo),
    episodeNo,
    type,
    lang,
  );
  if (!images.length) {
    throw new Error(t(uiLang, "error.emptyImageList"));
  }

  const pages = pagesFromImages(
    detail.comicId,
    chapter.storageChapterId,
    images,
  );

  return {
    comicId: detail.comicId,
    title: detail.data.normal.comicInfo.title,
    chapter: {
      ...chapter,
      name: episodeTitle || chapter.name,
      pages,
      extern: { ...chapterExtern, episodeNo, api: "app" },
    },
    chapters,
    extern: payload.extern ?? null,
    type,
    lang,
    titleNo,
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
      Referer: IMAGE_REFERER,
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
