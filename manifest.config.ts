import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'B站字幕提取器',
  version: '0.1.0',
  description: '在 B 站视频页一键提取字幕：列表浏览、点击跳转、高亮同步、复制全文、导出 SRT。',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  content_scripts: [
    {
      matches: ['https://www.bilibili.com/video/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  host_permissions: [
    '*://*.bilibili.com/*',
    '*://*.hdslb.com/*',
    '*://*.bilivideo.com/*',
    '*://*.bilivideo.cn/*',
    '*://*.akamaized.net/*',
    '*://*.szbdyd.com/*',
    'https://api.groq.com/*',
    'https://api.openai.com/*',
    'https://api.siliconflow.cn/*',
  ],
  permissions: ['storage', 'offscreen', 'declarativeNetRequest'],
})
