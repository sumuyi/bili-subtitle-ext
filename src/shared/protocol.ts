import type { FailReason, SubtitleEntry, SubtitleBundle, VideoMeta } from './types'

export const MSG = {
  GET_SUBTITLES: 'GET_SUBTITLES',
  FETCH_TRACK: 'FETCH_TRACK',
  TRANSCRIBE: 'TRANSCRIBE',
  /** background → content 进度推送 */
  TRANSCRIBE_PROGRESS: 'TRANSCRIBE_PROGRESS',
  /** background → offscreen 工作指令 */
  OFFSCREEN_TRANSCRIBE: 'OFFSCREEN_TRANSCRIBE',
  /** background → offscreen 就绪探测 */
  OFFSCREEN_PING: 'OFFSCREEN_PING',
  /** background → content script 音频下载（SW 被 CDN 403 时用页面上下文回退） */
  FETCH_AUDIO: 'FETCH_AUDIO',
  OPEN_OPTIONS: 'OPEN_OPTIONS',
} as const

export interface GetSubtitlesRequest {
  type: typeof MSG.GET_SUBTITLES
  bvid: string
  page: number
}

export interface FetchTrackRequest {
  type: typeof MSG.FETCH_TRACK
  url: string
}

export interface TranscribeRequest {
  type: typeof MSG.TRANSCRIBE
  bvid: string
  page: number
}

export interface OffscreenTranscribeRequest {
  type: typeof MSG.OFFSCREEN_TRANSCRIBE
  id: number
  /** base64 编码的音频数据（SW 不支持 URL.createObjectURL，只能用 base64 传输） */
  audioData: string
  baseUrl: string
  apiKey: string
  model: string
  language: string
}

export type BgRequest = GetSubtitlesRequest | FetchTrackRequest | TranscribeRequest

export type BgResponse<T> =
  | { ok: true; data: T }
  | { ok: false; reason: FailReason; message: string }

export type SubtitlesResponse = BgResponse<SubtitleBundle>
export type TrackResponse = BgResponse<SubtitleEntry[]>
export type TranscribeResponse = BgResponse<{ meta: VideoMeta; entries: SubtitleEntry[] }>

export interface TranscribeProgress {
  percent: number
  stage: string
}
