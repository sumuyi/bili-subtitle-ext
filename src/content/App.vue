<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { loadSubtitles, setPref, state, switchTrack } from './store'
import { buildSrt } from '../shared/srt'
import { buildCopyText } from '../shared/copyText'
import { DEFAULT_COPY_SETTINGS, loadCopySettings, saveCopySettings, type CopySettings } from '../shared/settings'
import SubtitleList from './components/SubtitleList.vue'

const title = computed(() => state.bundle?.meta.title ?? 'B站字幕提取器')
const owner = computed(() => state.bundle?.meta.owner ?? '')
const entryCount = computed(() => state.bundle?.entries.length ?? 0)
const trackCount = computed(() => state.bundle?.tracks.length ?? 0)

const settings = reactive<CopySettings>({ ...DEFAULT_COPY_SETTINGS })
const settingsOpen = ref(false)

onMounted(async () => {
  Object.assign(settings, await loadCopySettings())
})

function updateSettings(patch: Partial<CopySettings>) {
  Object.assign(settings, patch)
  saveCopySettings({ ...settings })
}

const toast = ref('')
let toastTimer = 0
function flashToast(text: string) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 1600)
}

async function refresh() {
  const m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/)
  if (!m) return
  const page = Number(new URLSearchParams(location.search).get('p')) || 1
  await loadSubtitles(m[1], page)
}

async function copyAll() {
  if (!state.bundle) return
  try {
    await navigator.clipboard.writeText(buildCopyText(state.bundle.entries, { ...settings }))
    flashToast('已复制全部字幕文本')
  } catch {
    flashToast('复制失败，请检查剪贴板权限')
  }
}

function exportSrt() {
  if (!state.bundle) return
  const srt = buildSrt(state.bundle.entries)
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${state.bundle.meta.title.replace(/[\\/:*?"<>|]/g, '_')}.srt`
  a.click()
  URL.revokeObjectURL(url)
}

function onTrackChange(e: Event) {
  void switchTrack(Number((e.target as HTMLSelectElement).value))
}

// 面板拖拽（位置持久化）
const savedPos = readPos()
const pos = reactive({ x: savedPos.x, y: savedPos.y })
let drag: { startX: number; startY: number; baseX: number; baseY: number } | null = null

function readPos(): { x: number; y: number } {
  try {
    const p = JSON.parse(localStorage.getItem('bsx.pos') ?? 'null')
    if (p && typeof p.x === 'number' && typeof p.y === 'number') return p
  } catch {
    /* 忽略损坏的本地存储 */
  }
  return { x: Math.max(8, window.innerWidth - 376), y: 88 }
}

function onDragStart(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button, select')) return
  drag = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onDragMove(e: PointerEvent) {
  if (!drag) return
  pos.x = Math.min(Math.max(8, drag.baseX + e.clientX - drag.startX), window.innerWidth - 60)
  pos.y = Math.min(Math.max(8, drag.baseY + e.clientY - drag.startY), window.innerHeight - 48)
}

function onDragEnd() {
  if (!drag) return
  drag = null
  localStorage.setItem('bsx.pos', JSON.stringify({ x: pos.x, y: pos.y }))
}
</script>

<template>
  <div
    v-show="state.visible"
    class="bsx-root"
    :class="{ collapsed: state.collapsed }"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
  >
    <div class="bsx-panel">
      <header
        class="bsx-header"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
        @dblclick="setPref('collapsed', !state.collapsed)"
      >
        <span class="bsx-badge">字幕</span>
        <span class="bsx-title" :title="title">{{ title }}</span>
        <button class="bsx-icon-btn" :title="state.collapsed ? '展开' : '收起'" @click.stop="setPref('collapsed', !state.collapsed)">
          {{ state.collapsed ? '▾' : '▴' }}
        </button>
        <button class="bsx-icon-btn" title="隐藏面板（刷新页面恢复）" @click.stop="state.visible = false">×</button>
      </header>

      <template v-if="!state.collapsed">
        <div class="bsx-toolbar">
          <select
            v-if="trackCount > 1"
            class="bsx-select"
            :value="state.bundle?.activeIndex ?? 0"
            @change="onTrackChange"
          >
            <option v-for="(track, i) in state.bundle?.tracks ?? []" :key="track.lan" :value="i">
              {{ track.lanDoc }}{{ track.aiStatus ? ' · AI' : '' }}
            </option>
          </select>
          <button class="bsx-pill" :class="{ on: state.autoScroll }" @click="setPref('autoScroll', !state.autoScroll)">
            同步
          </button>
          <button class="bsx-pill" :disabled="entryCount === 0" @click="copyAll">复制</button>
          <button class="bsx-pill" :disabled="entryCount === 0" @click="exportSrt">SRT</button>
          <button class="bsx-pill" @click="refresh">刷新</button>
          <button class="bsx-pill" :class="{ on: settingsOpen }" @click="settingsOpen = !settingsOpen">设置</button>
        </div>

        <transition name="bsx-fade">
          <div v-if="settingsOpen" class="bsx-settings-mask" @click="settingsOpen = false">
            <div class="bsx-settings" @click.stop>
              <div class="bsx-settings-row">
                <span class="bsx-settings-label">复制格式</span>
                <span class="bsx-seg">
                  <button
                    class="bsx-seg-btn"
                    :class="{ on: settings.format === 'paragraph' }"
                    @click="updateSettings({ format: 'paragraph' })"
                  >
                    单段落
                  </button>
                  <button
                    class="bsx-seg-btn"
                    :class="{ on: settings.format === 'lines' }"
                    @click="updateSettings({ format: 'lines' })"
                  >
                    逐行
                  </button>
                </span>
              </div>
              <div class="bsx-settings-row" :class="{ off: settings.format !== 'lines' }">
                <span class="bsx-settings-label">逐行带时间戳</span>
                <button
                  class="bsx-switch"
                  role="switch"
                  :aria-checked="settings.timestamps"
                  :disabled="settings.format !== 'lines'"
                  @click="updateSettings({ timestamps: !settings.timestamps })"
                >
                  <span class="bsx-switch-dot"></span>
                </button>
              </div>
              <div class="bsx-settings-row">
                <span class="bsx-settings-label">自动添加标点</span>
                <button
                  class="bsx-switch"
                  role="switch"
                  :aria-checked="settings.punctuation"
                  @click="updateSettings({ punctuation: !settings.punctuation })"
                >
                  <span class="bsx-switch-dot"></span>
                </button>
              </div>
              <p class="bsx-settings-hint">设置自动保存，复制时按此格式输出</p>
            </div>
          </div>
        </transition>

        <div class="bsx-status">
          <template v-if="state.status === 'loading'">正在获取字幕…</template>
          <template v-else-if="state.status === 'ready'">
            {{ owner ? `${owner} · ` : '' }}{{ entryCount }} 条字幕
          </template>
          <template v-else-if="state.status === 'error'">
            <span class="bsx-error">{{ state.error }}</span>
          </template>
          <template v-else>打开 B 站视频页后自动加载字幕</template>
        </div>

        <SubtitleList v-if="state.status === 'ready'" />

        <div v-else-if="state.status === 'error'" class="bsx-empty">
          <p class="bsx-error">{{ state.error }}</p>
          <p v-if="state.reason === 'NO_SUBTITLE'" class="bsx-hint">
            AI 字幕需要视频播放器生成过才存在，可播放片刻后点「刷新」重试。
          </p>
          <p v-else-if="state.reason === 'NOT_LOGGED_IN'" class="bsx-hint">
            请先登录 B 站（字幕接口需要登录态），登录后点「刷新」。
          </p>
        </div>
      </template>
    </div>

    <transition name="bsx-fade">
      <div v-if="toast" class="bsx-toast">{{ toast }}</div>
    </transition>
  </div>
</template>
