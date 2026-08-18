import { reactive } from 'vue'
import { MSG, type SubtitlesResponse, type TrackResponse } from '../shared/protocol'
import type { SubtitleBundle } from '../shared/types'

export interface PanelState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  bundle: SubtitleBundle | null
  error: string
  reason: string
  currentIndex: number
  autoScroll: boolean
  collapsed: boolean
  visible: boolean
}

const saved = readSaved()

export const state = reactive<PanelState>({
  status: 'idle',
  bundle: null,
  error: '',
  reason: '',
  currentIndex: -1,
  autoScroll: saved.autoScroll ?? true,
  collapsed: saved.collapsed ?? false,
  visible: true,
})

function readSaved(): Partial<Record<'autoScroll' | 'collapsed', boolean>> {
  try {
    return JSON.parse(localStorage.getItem('bsx.prefs') ?? '{}')
  } catch {
    return {}
  }
}

function persistPrefs() {
  localStorage.setItem('bsx.prefs', JSON.stringify({ autoScroll: state.autoScroll, collapsed: state.collapsed }))
}

export function setPref<K extends 'autoScroll' | 'collapsed'>(key: K, value: boolean) {
  state[key] = value
  persistPrefs()
}

let runId = 0

export async function loadSubtitles(bvid: string, page: number): Promise<void> {
  const id = ++runId
  state.status = 'loading'
  state.bundle = null
  state.error = ''
  state.reason = ''
  state.currentIndex = -1
  const resp: SubtitlesResponse = await chrome.runtime.sendMessage({
    type: MSG.GET_SUBTITLES,
    bvid,
    page,
  })
  if (id !== runId) return // 过期响应，丢弃（竞态控制）
  if (resp?.ok) {
    state.bundle = resp.data
    state.status = 'ready'
  } else {
    state.status = 'error'
    state.error = resp?.message ?? '请求失败'
    state.reason = resp?.reason ?? 'NETWORK'
  }
}

export async function switchTrack(index: number): Promise<void> {
  const bundle = state.bundle
  if (!bundle || index === bundle.activeIndex || !bundle.tracks[index]) return
  const id = ++runId
  const previous = { entries: bundle.entries, activeIndex: bundle.activeIndex }
  bundle.activeIndex = index
  bundle.entries = []
  const resp: TrackResponse = await chrome.runtime.sendMessage({
    type: MSG.FETCH_TRACK,
    url: bundle.tracks[index].url,
  })
  if (id !== runId || !state.bundle) return
  if (resp?.ok) {
    state.bundle.entries = resp.data
  } else {
    state.bundle.entries = previous.entries
    state.bundle.activeIndex = previous.activeIndex
    state.error = resp?.message ?? '字幕轨道切换失败'
  }
}
