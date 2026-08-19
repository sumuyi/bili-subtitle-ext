export interface SubtitleEntry {
  from: number
  to: number
  content: string
}

export interface SubtitleTrack {
  lan: string
  lanDoc: string
  aiStatus: number
  url: string
}

export interface VideoMeta {
  bvid: string
  aid: number
  cid: number
  page: number
  title: string
  owner?: string
  duration?: number
}

export interface SubtitleBundle {
  meta: VideoMeta
  tracks: SubtitleTrack[]
  activeIndex: number
  entries: SubtitleEntry[]
}

export type FailReason = 'NO_SUBTITLE' | 'NOT_LOGGED_IN' | 'NOT_FOUND' | 'NETWORK' | 'NO_ASR_KEY'
