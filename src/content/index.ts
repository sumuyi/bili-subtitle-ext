import { createApp } from 'vue'
import App from './App.vue'
import panelCss from './styles/panel.css?raw'
import { onRouteChange, parseRoute } from './router'
import { loadSubtitles, state } from './store'

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
