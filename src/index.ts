import type {
  CapabilitiesBundleContract,
  InfoContract,
} from "breeze-plugin-kit";
import { PLUGIN_ID } from "./common";
import { buildPluginInfo } from "./get-info";
import {
  fetchImageBytes,
  getAdvancedSearchScheme,
  getChapter,
  getComicDetail,
  getReadSnapshot,
  getSettingsBundle,
  onLangChanged,
  onR18Changed,
  searchComic,
} from "./webtoon-core";

async function getInfo(): Promise<InfoContract> {
  return await buildPluginInfo();
}

async function getCapabilitiesBundle(): Promise<CapabilitiesBundleContract> {
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "capabilities",
      actions: [],
    },
    data: {},
  };
}

export default {
  getInfo,
  searchComic,
  getComicDetail,
  getChapter,
  getReadSnapshot,
  fetchImageBytes,
  getSettingsBundle,
  getCapabilitiesBundle,
  getAdvancedSearchScheme,
  onLangChanged,
  onR18Changed,
};
