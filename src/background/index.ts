import { MSG, type BgRequest, type BgResponse } from '../shared/protocol'
import type { SubtitleBundle } from '../shared/types'
import { BiliError, fetchSubtitleJson, getSubtitleTracks, getView, pickPage, sortTracks } from './biliApi'

async function getSubtitles(bvid: string, page: number): Promise<SubtitleBundle> {
  const view = await getView(bvid)
  const { cid, part } = pickPage(view, page)
  const { raw, notLoggedIn } = await getSubtitleTracks(view.aid, bvid, cid)
  if (raw.length === 0) {
    throw new BiliError(
      notLoggedIn ? '字幕接口需要登录态，请先登录 B 站' : '该视频没有可用字幕（AI 字幕可能未生成）',
      notLoggedIn ? 'NOT_LOGGED_IN' : 'NO_SUBTITLE',
    )
  }
  const tracks = sortTracks(raw)
  const entries = await fetchSubtitleJson(tracks[0].url)
  const title = part ? `${view.title} · P${page} ${part}` : String(view.title ?? bvid)
  return {
    meta: {
      bvid,
      aid: view.aid,
      cid,
      page,
      title,
      owner: view.owner?.name,
      duration: view.duration,
    },
    tracks,
    activeIndex: 0,
    entries,
  }
}

chrome.runtime.onMessage.addListener(
  (req: BgRequest, _sender, sendResponse: (resp: BgResponse<unknown>) => void) => {
    void (async () => {
      try {
        if (req.type === MSG.GET_SUBTITLES) {
          sendResponse({ ok: true, data: await getSubtitles(req.bvid, req.page) })
        } else if (req.type === MSG.FETCH_TRACK) {
          sendResponse({ ok: true, data: await fetchSubtitleJson(req.url) })
        } else {
          sendResponse({ ok: false, reason: 'NETWORK', message: `未知消息类型: ${String((req as any)?.type)}` })
        }
      } catch (e: any) {
        const reason = e instanceof BiliError ? e.reason : 'NETWORK'
        sendResponse({ ok: false, reason, message: e?.message || '请求失败' })
      }
    })()
    return true
  },
)
