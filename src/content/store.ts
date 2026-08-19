import { reactive } from 'vue'
import { MSG, type SubtitlesResponse, type TrackResponse, type TranscribeResponse } from '../shared/protocol'
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
  transcribing: boolean
  transcribePercent: number
  transcribeStage: string
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
  transcribing: false,
  transcribePercent: 0,
  transcribeStage: '',
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
  state.transcribing = false
  state.transcribePercent = 0
  state.transcribeStage = ''
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

export async function transcribe(): Promise<void> {
  const m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/)
  if (!m || state.transcribing) return
  const id = ++runId
  const page = Number(new URLSearchParams(location.search).get('p')) || 1
  state.transcribing = true
  state.transcribePercent = 0
  state.transcribeStage = '正在准备…'
  const resp: TranscribeResponse = await chrome.runtime.sendMessage({
    type: MSG.TRANSCRIBE,
    bvid: m[1],
    page,
  })
  if (id !== runId) return
  state.transcribing = false
  state.transcribeStage = ''
  if (resp?.ok) {
    state.bundle = {
      meta: resp.data.meta,
      tracks: [{ lan: 'asr', lanDoc: 'AI 转写', aiStatus: 1, url: '' }],
      activeIndex: 0,
      entries: resp.data.entries,
    }
    state.status = 'ready'
    state.error = ''
    state.reason = ''
  } else {
    state.error = resp?.message ?? '转写失败'
    state.reason = resp?.reason ?? 'NETWORK'
    if (state.status !== 'error') state.status = 'error'
  }
}

export function openOptions(): void {
  void chrome.runtime.sendMessage({ type: MSG.OPEN_OPTIONS })
}

// background → content 进度推送
chrome.runtime.onMessage.addListener((req: any) => {
  if (req?.type === MSG.TRANSCRIBE_PROGRESS) {
    state.transcribePercent = Number(req.percent) || 0
    state.transcribeStage = String(req.stage ?? '')
  }
})

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
