import type { FailReason, SubtitleEntry, SubtitleBundle } from './types'

export const MSG = {
  GET_SUBTITLES: 'GET_SUBTITLES',
  FETCH_TRACK: 'FETCH_TRACK',
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

export type BgRequest = GetSubtitlesRequest | FetchTrackRequest

export type BgResponse<T> =
  | { ok: true; data: T }
  | { ok: false; reason: FailReason; message: string }

export type SubtitlesResponse = BgResponse<SubtitleBundle>
export type TrackResponse = BgResponse<SubtitleEntry[]>
