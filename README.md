# B站字幕提取器（V0 纯字幕版）

在 B 站视频页自动提取字幕的 Chrome/Edge 浏览器插件：字幕列表浏览、点击跳转、播放高亮同步、一键复制全文、导出 SRT。

## 功能

- 双源字幕接口：`player/wbi/v2`（aid）优先，`player/v2`（bvid）回退，中文 > 英文 > 其他语言排序
- 自动跟随 SPA 路由：切换视频 / 切换分 P 自动重新加载
- 播放高亮同步（可开关）+ 点击字幕跳转进度
- 复制全部文本 / 导出 SRT 文件
- 复制格式可配置（设置面板）：单段落不换行 / 逐行，逐行可带 `[mm:ss]` 时间戳，自动标点开关
- 多语言字幕轨切换（含 AI 字幕标识）
- 浮窗可拖拽、可收起，位置与偏好本地记忆；复制设置经 `chrome.storage.sync` 跨设备同步

## 开发

```bash
npm install
npm run dev     # 开发模式（HMR，需保持终端运行）
npm run build   # 产出 dist/ 生产构建
```

## 安装到浏览器

1. 执行 `npm run build`
2. 打开 `chrome://extensions/`（Edge 为 `edge://extensions/`）
3. 开启「开发者模式」
4. 点「加载已解压的扩展程序」，选择本项目 `dist/` 目录

## 使用

1. 登录 B 站（字幕接口需要登录态）
2. 打开任意带 CC / AI 字幕的视频页，右上角浮窗自动加载字幕
3. 「同步」开关控制滚动跟随；点字幕条跳转；「复制」「SRT」导出内容

## 项目结构

```
├── manifest.config.ts          # MV3 清单（CRXJS defineManifest）
├── src/
│   ├── shared/
│   │   ├── types.ts            # 共享类型
│   │   ├── protocol.ts         # content ↔ background 消息协议
│   │   ├── srt.ts              # SRT 生成 / 时间格式化
│   │   ├── copyText.ts         # 复制文本构建（自动标点 / 单段落 / 逐行）
│   │   └── settings.ts         # 复制设置持久化（chrome.storage.sync）
│   ├── background/
│   │   ├── index.ts            # Service Worker 消息入口
│   │   └── biliApi.ts          # B站 API 代理（view / 双源字幕 / 字幕JSON）
│   └── content/
│       ├── index.ts            # Shadow DOM 挂载 + SPA 路由监听 + video 绑定
│       ├── router.ts           # URL → bvid/p 解析与变更监听
│       ├── store.ts            # 响应式状态 + runId 竞态控制
│       ├── App.vue             # 面板外壳（工具栏 / 状态 / 拖拽）
│       ├── components/
│       │   └── SubtitleList.vue# 字幕列表 + 高亮同步 + 点击跳转
│       └── styles/panel.css    # 面板样式（注入 Shadow DOM）
```

## 已知限制（V0 范围）

- 仅支持 `www.bilibili.com/video/*`，番剧 / 课程页未接入
- 依赖视频已有 CC 或 AI 字幕；无字幕视频需等 V1 接入 ASR 兜底
- AI 字幕需播放器生成过才存在；冷门新视频可能无字幕
- `wbi/v2` 接口未做 WBI 签名（当前可匿名返回字幕列表；若后续 B 站收紧，会自动回退 `player/v2`）
- 高频切换视频可能触发接口限流，表现为字幕为空，稍后点「刷新」

## V1 规划（已预留接入点）

- 无字幕视频走 `playurl` 取音频流 → 云 ASR（Groq / 腾讯云）转写，结果复用同一面板
- Options 页配置 API Key 与默认行为
