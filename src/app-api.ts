/**
 * WEBTOON App API (linewebtoon global.apis.naver.com)
 * 签名与接口来自 3.9.6 APK 反编译 + 实测。
 */

const API_BASE = "https://global.apis.naver.com/lineWebtoon/webtoon";
export const IMAGE_CDN = "https://webtoon-phinf.pstatic.net";
const HMAC_SECRET =
  "gUtPzJFZch4ZyAGviiyH94P99lQ3pFdRTwpJWDlSGFfwgpr6ses5ALOxWHOIT7R1";
const WTU = "a1b2c3d4e5f6789012345678901234ab";
const UA = "nApps (Android 13; SM-G991B; en; 3.9.6)";

export type AppWebtoonType = "webtoon" | "canvas";

export type AppSearchHit = {
  titleNo: number;
  title: string;
  writingAuthorName?: string;
  pictureAuthorName?: string;
  thumbnail?: string;
  likeitCount?: number;
  readCount?: number;
  ageGradeNotice?: boolean;
  unsuitableForChildren?: boolean;
  type: AppWebtoonType;
};

export type AppEpisode = {
  episodeNo: number;
  episodeTitle: string;
  episodeSeq?: number;
  thumbnailImageUrl?: string;
  exposureYmdt?: number;
  serviceStatus?: string;
  exposureType?: string;
};

export type AppImage = {
  url: string;
  width?: number;
  height?: number;
  sortOrder?: number;
};

type BucketPage = {
  start: number;
  display: number;
  total: number;
  titleList: Array<Record<string, unknown>>;
};

type HmacLike = {
  update: (data: string) => HmacLike;
  digest: (encoding: "base64") => string;
};

function getCrypto(): {
  createHmac: (alg: string, key: string) => HmacLike;
} {
  const c = (globalThis as { crypto?: { createHmac?: unknown } }).crypto;
  if (c && typeof c.createHmac === "function") {
    return c as { createHmac: (alg: string, key: string) => HmacLike };
  }
  throw new Error("runtime crypto.createHmac is unavailable");
}

function commonQs(lang: string): string {
  const p = new URLSearchParams({
    platform: "APP_ANDROID",
    language: lang,
    locale: lang,
    v: "1",
    serviceZone: "GLOBAL",
  });
  return p.toString();
}

/** NHN API Gateway: md = Base64(HMAC-SHA1(secret, url[0..255] + msgpad)) */
export function signUrl(url: string): string {
  const msgpad = String(Date.now());
  const payload = url.substring(0, Math.min(255, url.length)) + msgpad;
  const md = getCrypto()
    .createHmac("sha1", HMAC_SECRET)
    .update(payload)
    .digest("base64");
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}msgpad=${msgpad}&md=${encodeURIComponent(md)}`;
}

export function absImageUrl(pathOrUrl: string | undefined | null): string {
  const s = String(pathOrUrl ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  // strip query type= for cleaner cache keys when needed; keep as-is for CDN
  return IMAGE_CDN + (s.startsWith("/") ? s : `/${s}`);
}

async function apiGet(
  pathAndQuery: string,
  uiLangError: (msg: string) => string = (m) => m,
): Promise<Record<string, unknown>> {
  const url = signUrl(`${API_BASE}/${pathAndQuery}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      wtu: WTU,
      Accept: "application/json",
      Referer: "http://m.webtoons.com/",
    },
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  let json: {
    message?: {
      code?: number;
      message?: string;
      result?: Record<string, unknown>;
    };
    errorMessage?: string;
    errorCode?: string;
  };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(uiLangError(`Non-JSON ${res.status}: ${text.slice(0, 160)}`));
  }
  if (!res.ok) {
    throw new Error(
      uiLangError(
        `HTTP ${res.status}: ${json.errorMessage || json.message?.message || text.slice(0, 160)}`,
      ),
    );
  }
  const code = json.message?.code;
  if (code != null && code !== 0 && json.message?.result == null) {
    throw new Error(
      uiLangError(
        `API ${code}: ${json.message?.message || "error"}`,
      ),
    );
  }
  return (json.message?.result ?? {}) as Record<string, unknown>;
}

function asBucket(raw: unknown): BucketPage {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const list = Array.isArray(o.titleList) ? o.titleList : [];
  return {
    start: Number(o.start ?? 1) || 1,
    display: Number(o.display ?? list.length) || list.length,
    total: Number(o.total ?? list.length) || 0,
    titleList: list as Array<Record<string, unknown>>,
  };
}

function mapHit(
  item: Record<string, unknown>,
  type: AppWebtoonType,
): AppSearchHit {
  return {
    titleNo: Number(item.titleNo) || 0,
    title: String(item.title ?? item.titleName ?? "").trim(),
    writingAuthorName: String(item.writingAuthorName ?? "").trim() || undefined,
    pictureAuthorName: String(item.pictureAuthorName ?? "").trim() || undefined,
    thumbnail: absImageUrl(
      String(item.thumbnail ?? item.titleThumbnail ?? item.iconImage ?? ""),
    ),
    likeitCount: Number(item.likeitCount ?? 0) || 0,
    readCount: Number(item.readCount ?? 0) || 0,
    ageGradeNotice: Boolean(item.ageGradeNotice),
    unsuitableForChildren: Boolean(item.unsuitableForChildren),
    type,
  };
}

/** 单次 searchAll：两边共用 startIndex / pageSize */
export async function searchAllBuckets(
  query: string,
  lang: string,
  startIndex: number,
  pageSize: number,
): Promise<{ webtoon: BucketPage; canvas: BucketPage }> {
  const qs = commonQs(lang);
  const result = await apiGet(
    `searchAll.json?query=${encodeURIComponent(query)}&startIndex=${startIndex}&pageSize=${pageSize}&${qs}`,
  );
  return {
    webtoon: asBucket(result.webtoonSearch),
    canvas: asBucket(result.challengeSearch),
  };
}

function acceptHit(hit: AppSearchHit, allowR18: boolean): boolean {
  if (!hit.titleNo || !hit.title) return false;
  if (!allowR18 && (hit.ageGradeNotice || hit.unsuitableForChildren)) {
    return false;
  }
  return true;
}

/**
 * 合并搜索：先全部 Original(webtoon)，再全部 Canvas。
 * 宿主 page（从 1 起）→ 合并流上的 skip/take，两边各算 startIndex。
 */
export async function searchMerged(
  query: string,
  lang: string,
  page: number,
  pageSize: number,
  allowR18: boolean,
): Promise<{
  hits: AppSearchHit[];
  total: number;
  webtoonTotal: number;
  canvasTotal: number;
  hasNext: boolean;
}> {
  const safePage = Math.max(1, page);
  const size = Math.max(1, Math.min(50, pageSize));
  const skip = (safePage - 1) * size;

  const probe = await searchAllBuckets(query, lang, 1, 1);
  const webtoonTotal = probe.webtoon.total;
  const canvasTotal = probe.canvas.total;
  const total = webtoonTotal + canvasTotal;

  if (skip >= total || total === 0) {
    return {
      hits: [],
      total,
      webtoonTotal,
      canvasTotal,
      hasNext: false,
    };
  }

  const hits: AppSearchHit[] = [];

  if (skip < webtoonTotal) {
    const wStart = skip + 1;
    const wTake = Math.min(size, webtoonTotal - skip);
    const batch = await searchAllBuckets(query, lang, wStart, wTake);
    for (const raw of batch.webtoon.titleList) {
      const hit = mapHit(raw, "webtoon");
      if (acceptHit(hit, allowR18)) hits.push(hit);
      if (hits.length >= size) break;
    }

    const need = size - hits.length;
    if (need > 0 && canvasTotal > 0) {
      // 本页漫画段结束后，从 Canvas 第 1 条起补满
      const cBatch = await searchAllBuckets(query, lang, 1, need);
      for (const raw of cBatch.canvas.titleList) {
        const hit = mapHit(raw, "canvas");
        if (acceptHit(hit, allowR18)) hits.push(hit);
        if (hits.length >= size) break;
      }
    }
  } else {
    const cSkip = skip - webtoonTotal;
    const cStart = cSkip + 1;
    const cTake = Math.min(size, canvasTotal - cSkip);
    if (cTake > 0) {
      const batch = await searchAllBuckets(query, lang, cStart, cTake);
      for (const raw of batch.canvas.titleList) {
        const hit = mapHit(raw, "canvas");
        if (acceptHit(hit, allowR18)) hits.push(hit);
        if (hits.length >= size) break;
      }
    }
  }

  return {
    hits: hits.slice(0, size),
    total,
    webtoonTotal,
    canvasTotal,
    hasNext: skip + size < total,
  };
}

export type AppTitleDetail = {
  titleNo: number;
  title: string;
  synopsis: string;
  author: string;
  genre: string;
  thumbnail: string;
  readCount: number;
  favoriteCount: number;
  mature: boolean;
  restTerminationStatus?: string;
};

function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export async function fetchTitleDetail(
  titleNo: number,
  type: AppWebtoonType,
  lang: string,
): Promise<AppTitleDetail> {
  const qs = commonQs(lang);
  if (type === "canvas") {
    const [main, detail] = await Promise.all([
      apiGet(`challengeTitleHomeMainV2?titleNo=${titleNo}&${qs}`),
      apiGet(`challengeTitleHomeDetailV2?titleNo=${titleNo}&${qs}`),
    ]);
    const t =
      (detail.challengeTitleDetail as Record<string, unknown> | undefined) ||
      (main.challengeTitle as Record<string, unknown> | undefined) ||
      {};
    const writing = pickStr(t.writingAuthorName, t.authorName);
    const picture = pickStr(t.pictureAuthorName);
    const author = [writing, picture].filter(Boolean).join(" / ") || writing;
    const rating = pickStr(t.contentRating, t.ageGrade).toUpperCase();
    return {
      titleNo,
      title: pickStr(t.readingTitle, t.sourceTitle, t.title),
      synopsis: pickStr(t.sourceSynopsis, t.readingSynopsis, t.synopsis),
      author,
      genre: pickStr(t.representGenre, t.genre, t.representGenreCode),
      thumbnail: absImageUrl(
        pickStr(t.titleThumbnailUrl, t.thumbnail, t.thumbnailUrl),
      ),
      readCount: Number(t.readCount ?? 0) || 0,
      favoriteCount: Number(t.favoriteCount ?? t.likeitCount ?? 0) || 0,
      mature:
        rating.includes("MATURE") ||
        rating.includes("19") ||
        Boolean(t.ageGradeNotice) ||
        Boolean(t.unsuitableForChildren),
      restTerminationStatus: pickStr(t.restTerminationStatus),
    };
  }

  const [main, detail] = await Promise.all([
    apiGet(`titleHomeMainV3?titleNo=${titleNo}&${qs}`),
    apiGet(`titleHomeDetailV2?titleNo=${titleNo}&${qs}`),
  ]);
  const t =
    (detail.titleDetail as Record<string, unknown> | undefined) ||
    (main.title as Record<string, unknown> | undefined) ||
    {};
  const writing = pickStr(t.writingAuthorName);
  const picture = pickStr(t.pictureAuthorName);
  const author =
    [writing, picture].filter(Boolean).join(" / ") ||
    pickStr(t.authorName, t.author);
  const rating = pickStr(t.contentRating, t.ageGrade).toUpperCase();
  return {
    titleNo,
    title: pickStr(t.title, t.titleName),
    synopsis: pickStr(t.synopsis, t.summary),
    author,
    genre: pickStr(t.representGenre, t.genre),
    thumbnail: absImageUrl(
      pickStr(t.thumbnail, t.titleThumbnail, t.thumbnailUrl, t.imageUrl),
    ),
    readCount: Number(t.readCount ?? 0) || 0,
    favoriteCount: Number(t.favoriteCount ?? t.likeitCount ?? 0) || 0,
    mature:
      rating.includes("MATURE") ||
      rating.includes("19") ||
      Boolean(t.ageGradeNotice) ||
      Boolean(t.unsuitableForChildren),
    restTerminationStatus: pickStr(t.restTerminationStatus),
  };
}

function mapEpisode(raw: Record<string, unknown>): AppEpisode {
  return {
    episodeNo: Number(raw.episodeNo) || 0,
    episodeTitle: String(raw.episodeTitle ?? raw.title ?? "").trim(),
    episodeSeq: Number(raw.episodeSeq ?? 0) || undefined,
    thumbnailImageUrl: absImageUrl(
      String(raw.thumbnailImageUrl ?? raw.thumbnail ?? ""),
    ),
    exposureYmdt: Number(raw.exposureYmdt ?? 0) || undefined,
    serviceStatus: String(raw.serviceStatus ?? ""),
    exposureType: String(raw.exposureType ?? ""),
  };
}

/** 拉全量章节（App 侧比 Web 更全），返回从旧到新 */
export async function fetchAllEpisodes(
  titleNo: number,
  type: AppWebtoonType,
  lang: string,
): Promise<AppEpisode[]> {
  const qs = commonQs(lang);
  const path =
    type === "canvas"
      ? `challengeEpisodeList.json?titleNo=${titleNo}&startIndex=0&pageSize=99999&${qs}`
      : `episodeList.json?titleNo=${titleNo}&startIndex=0&pageSize=99999&${qs}`;
  const result = await apiGet(path);
  const el = (result.episodeList || {}) as Record<string, unknown>;
  const list = Array.isArray(el.episode) ? el.episode : [];
  const episodes = list
    .map((x) => mapEpisode(x as Record<string, unknown>))
    .filter((e) => e.episodeNo > 0);
  // API 默认新→旧，阅读列表改为旧→新
  if (
    episodes.length > 1 &&
    episodes[0].episodeNo > episodes[episodes.length - 1].episodeNo
  ) {
    episodes.reverse();
  }
  return episodes;
}

export async function fetchEpisodeImages(
  titleNo: number,
  episodeNo: number,
  type: AppWebtoonType,
  lang: string,
): Promise<{ episodeTitle: string; images: AppImage[] }> {
  const qs = commonQs(lang);
  if (type === "canvas") {
    const result = await apiGet(
      `challengeViewerEpisodeV1?readingRequestLanguage=${encodeURIComponent(lang)}&titleNo=${titleNo}&episodeNo=${episodeNo}&${qs}`,
    );
    const ep = (result.challengeEpisode || {}) as Record<string, unknown>;
    const list = Array.isArray(ep.imageList) ? ep.imageList : [];
    const images = list
      .map((raw, idx) => {
        const o = raw as Record<string, unknown>;
        return {
          url: absImageUrl(String(o.url ?? "")),
          width: Number(o.width ?? 0) || undefined,
          height: Number(o.height ?? 0) || undefined,
          sortOrder: Number(o.sortOrder ?? idx + 1) || idx + 1,
        };
      })
      .filter((i) => i.url)
      .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
    return {
      episodeTitle: pickStr(
        ep.readingEpisodeTitle,
        ep.sourceEpisodeTitle,
        ep.episodeTitle,
      ),
      images,
    };
  }

  const result = await apiGet(
    `downloadImageList.json?titleNo=${titleNo}&episodeNoList=${episodeNo}&${qs}`,
  );
  const pack = (result.downloadImageList || {}) as Record<string, unknown>;
  const eps = Array.isArray(pack.episodeList) ? pack.episodeList : [];
  const ep = (eps[0] || {}) as Record<string, unknown>;
  const list = Array.isArray(ep.imageInfo) ? ep.imageInfo : [];
  const images = list
    .map((raw, idx) => {
      const o = raw as Record<string, unknown>;
      return {
        url: absImageUrl(String(o.url ?? "")),
        width: Number(o.width ?? 0) || undefined,
        height: Number(o.height ?? 0) || undefined,
        sortOrder: Number(o.sortOrder ?? idx + 1) || idx + 1,
      };
    })
    .filter((i) => i.url)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  return {
    episodeTitle: pickStr(ep.episodeTitle),
    images,
  };
}
