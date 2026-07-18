import type { InfoContract } from "breeze-plugin-kit";
import { PLUGIN_ID } from "./common";
import { type UiLang, resolveUiLang, t } from "./i18n";

function buildInfo(uiLang: UiLang): InfoContract {
  return {
    name: "WEBTOON",
    uuid: PLUGIN_ID,
    iconUrl: "https://webtoons-static.pstatic.net/image/favicon/favicon.ico",
    creator: {
      name: "",
      describe: "",
    },
    describe: t(uiLang, "plugin.describe"),
    version: "0.0.3",
    home: "https://www.webtoons.com",
    updateUrl: "",
    npmName: "breeze-plugin-webtoon",
    function: [],
  };
}

/** 运行时：按 App 语言返回插件信息 */
export async function buildPluginInfo(): Promise<InfoContract> {
  return buildInfo(await resolveUiLang());
}

/** 构建产物 manifest：默认英文描述 */
export function buildManifestInfo(): InfoContract {
  return buildInfo("en");
}
