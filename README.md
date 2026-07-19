# Breeze Plugin · WEBTOON

Breeze 的 [WEBTOON](https://www.webtoons.com) 源插件，走官方 **App API**（`global.apis.naver.com`），章节列表比 Web 端更全。

## 能力

| 功能 | 状态 |
|------|------|
| 搜索（Original 在前 + Canvas 在后，多语言） | ✅ |
| 漫画详情 + 全量章节 | ✅ |
| 在线阅读 | ✅ |
| 章节下载 | ✅ |
| 语言设置 / 高级搜索语言 | ✅ |
| R18 过滤 | ✅ |

## 开发

```bash
pnpm install
pnpm dev
```

在 Breeze 中用 dev server 输出的 bundle 地址进行网络安装，并打开调试模式。

## 构建

```bash
pnpm build
```

产物在 `dist/`。

## 流程说明（App API）

```
搜索 searchAll.json
  → 客户端合并：先 webtoonSearch，再 challengeSearch
  → 详情 titleHome* / challengeTitleHome*
  → 章节 episodeList.json / challengeEpisodeList.json（pageSize=99999）
  → 图片 downloadImageList.json / challengeViewerEpisodeV1
  → 下载 webtoon-phinf.pstatic.net + Referer
```

### 搜索分页（双桶合并）

App 一次返回两桶，各有 `total` / `start`：

- `webtoonSearch` → Original
- `challengeSearch` → Canvas

插件把宿主 `page` 映射到合并流：

1. 先用 `startIndex=1&pageSize=1` 取两边 `total`
2. `skip = (page - 1) * pageSize`
3. 若仍在漫画段：拉 `webtoon` 再不够则从 Canvas 第 1 条补满
4. 若已越过漫画段：只拉 Canvas，`startIndex = skip - webtoonTotal + 1`

保证列表顺序始终是：**全部 Original → 全部 Canvas**。

### 鉴权

NHN API Gateway HMAC-SHA1：`msgpad` + `md`（密钥来自 App `apigw_key`）。

## 设置

- **默认搜索语言**（与官网一致）：  
  跟随系统 / English / 中文(繁體) / ไทย / Indonesia / Español / Français / Deutsch  
  未设置时按宿主 locale 映射；无简体分区时回退 `zh-hant`
- **显示 R18 / 成人内容**：关闭时过滤 mature 结果
- 插件 UI 文案按 App 语言 i18n：官网 7 种 + 简体
