# Breeze Plugin · WEBTOON

Breeze 的 [WEBTOON](https://www.webtoons.com) 源插件，走官方 **Web 端** 接口。

## 能力

| 功能 | 状态 |
|------|------|
| 搜索（多语言） | ✅ |
| 漫画详情 + 章节列表 | ✅ |
| 在线阅读 | ✅ |
| 章节下载 | ✅ |
| 语言设置 / 高级搜索语言 | ✅ |

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

## 流程说明

```
搜索 (www.webtoons.com/{lang}/search)
  → 详情页 HTML
  → 章节列表 (m.webtoons.com/api/v1/{webtoon|canvas}/{titleNo}/episodes)
  → 章节图片 (mobile viewer 页 imageList)
  → 下载图片 (webtoon-phinf.pstatic.net + Referer)
```

## 设置

- **默认搜索语言**（与官网一致）：  
  跟随系统 / English / 中文(繁體) / ไทย / Indonesia / Español / Français / Deutsch  
  未设置时按宿主 locale 映射；无简体分区时回退 `zh-hant`
- **显示 R18 / 成人内容**：关闭时过滤 mature 结果，请求不带 `ageGatePass=true`
- 插件 UI 文案按 App 语言 i18n：官网 7 种 + 简体（`zh-CN` / `zh-Hans` 显示简体，搜索内容仍用 `zh-hant`）
