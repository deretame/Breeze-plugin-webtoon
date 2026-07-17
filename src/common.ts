export const PLUGIN_ID = "7efa2a7c-da0f-4db1-9167-98045ae37fdb";
export const NOT_FOUND_IMAGE_URL =
  "https://webtoons-static.pstatic.net/image/favicon/favicon.ico";
export const PLACEHOLDER_IMAGE_PATH = "placeholder/image-404.png";
export const WEBTOON_REFERER = "https://m.webtoons.com/";
export const PC_BASE = "https://www.webtoons.com";
export const MOBILE_BASE = "https://m.webtoons.com";

import type {
  ActionItem,
  ComicListItem,
  ImageItem,
  MetadataListItem,
  PagingInfo,
  StringMap,
} from "breeze-plugin-kit";

export function toStringMap(value: unknown): StringMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function readString(value: unknown): string {
  return String(value ?? "").trim();
}

/** 删除尾部空白（含普通空白、NBSP、全角空格、换行） */
export function trimTrailing(value: unknown): string {
  return String(value ?? "").replace(/[\s\u00a0\u3000]+$/u, "");
}

export function createActionItem(
  name: unknown,
  onTap: StringMap = {},
  extern: StringMap = {},
): ActionItem {
  return {
    name: trimTrailing(name),
    onTap,
    extern,
  };
}

export function createImage(
  input: {
    id?: string;
    url?: string;
    name?: string;
    path?: string;
    extern?: StringMap;
  } = {},
): ImageItem {
  return {
    id: String(input.id ?? ""),
    url: String(input.url ?? "").trim() || NOT_FOUND_IMAGE_URL,
    name: String(input.name ?? ""),
    path: String(input.path ?? "").trim() || PLACEHOLDER_IMAGE_PATH,
    extern: input.extern ?? {},
  };
}

export function createBasicMetadata(
  type: string,
  name: string,
  values: unknown,
): MetadataListItem {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  return {
    type,
    name,
    value: list
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .map((item) => createActionItem(item)),
  };
}

export function createComicItem(id: string, title: string): ComicListItem {
  const path = `comic/${id}/cover.png`;
  return {
    source: PLUGIN_ID,
    id,
    title,
    subtitle: "",
    finished: false,
    likesCount: 0,
    viewsCount: 0,
    updatedAt: "",
    cover: {
      id,
      url: NOT_FOUND_IMAGE_URL,
      path,
      name: "",
      extern: { path },
    },
    metadata: [],
    raw: { id, name: title },
    extern: {},
  } satisfies ComicListItem;
}

export function createPaging(
  page = 1,
  pages = 1,
  total = 0,
  hasReachedMax = true,
): PagingInfo {
  return {
    page,
    pages: Math.max(1, pages),
    total,
    hasReachedMax,
  };
}
