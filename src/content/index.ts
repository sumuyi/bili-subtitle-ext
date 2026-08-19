import { createApp } from 'vue'
import App from './App.vue'
import panelCss from './styles/panel.css?raw'
import { onRouteChange, parseRoute } from './router'
import { loadSubtitles, state } from './store'
import { MSG } from '../shared/protocol'

// background → content script 音频下载回退：SW 被 CDN 403 时，用页面上下文（origin=bilibili.com）下载
chrome.runtime.onMessage.addListener((req: any, _sender, sendResponse: (r: any) => void) => {
  if (req?.type === MSG.FETCH_AUDIO) {
    void (async () => {
      try {
        const res = await fetch(req.url, { credentials: 'include' })
        if (!res.ok) {
          sendResponse({ ok: false, message: `HTTP ${res.status}` })
          return
        }
        const buf = await res.arrayBuffer()
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          sendResponse({ ok: true, data: base64 })
        }
        reader.onerror = () => sendResponse({ ok: false, message: 'FileReader error' })
        reader.readAsDataURL(new Blob([buf]))
      } catch (e: any) {
        sendResponse({ ok: false, message: `${e?.name ?? 'Error'}: ${e?.message ?? 'fetch failed'}` })
      }
    })()
    return true
  }
})

const host = document.createElement('div')
host.id = 'bili-subtitle-ext-host'
const shadow = host.attachShadow({ mode: 'open' })
const styleEl = document.createElement('style')
styleEl.textContent = panelCss
const mountEl = document.createElement('div')
shadow.append(styleEl, mountEl)
document.documentElement.appendChild(host)

createApp(App).mount(mountEl)

function applyRoute() {
  const route = parseRoute()
  if (route) {
    state.visible = true
    void loadSubtitles(route.bvid, route.page)
  } else {
    state.visible = false
  }
}

applyRoute()
onRouteChange(applyRoute)

let boundVideo: HTMLVideoElement | null = null

function bindVideoSync() {
  const video = document.querySelector('video')
  if (!video || video === boundVideo) return
  boundVideo = video
  video.addEventListener('timeupdate', () => {
    const entries = state.bundle?.entries
    if (!entries || !entries.length) {
      state.currentIndex = -1
      return
    }
    const t = video.currentTime
    state.currentIndex = entries.findIndex((e) => t >= e.from && t < e.to)
  })
}

// SPA 环境下 video 元素可能在切视频后被替换，低频轮询重新绑定
setInterval(bindVideoSync, 2000)
bindVideoSync()
