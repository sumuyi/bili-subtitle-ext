import { MSG, type BgRequest, type BgResponse, type OffscreenTranscribeRequest } from '../shared/protocol'
import type { SubtitleBundle, SubtitleEntry, VideoMeta } from '../shared/types'
import { BiliError, fetchAudioData, fetchSubtitleJson, getAudioUrls, getPlayurl, getSubtitleTracks, getView, pickPage, sortTracks } from './biliApi'
import { loadAsrSettings } from '../shared/settings'

const DNR_RULE_ID = 1
const AUDIO_CDN_DOMAINS = ['bilivideo.com', 'bilivideo.cn', 'akamaized.net', 'szbdyd.com', 'hdslb.com']

/** SW 不支持 URL.createObjectURL，用 base64 把音频数据传给 offscreen */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const chunks: string[] = []
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunk)))
  }
  return btoa(chunks.join(''))
}

/** SW fetch 的 Origin 是 chrome-extension://，B 站 CDN 会据此 403。用 DNR 规则把音频 CDN 请求的 Origin/Referer 改成 bilibili.com */
async function ensureDnrRules(bvid?: string): Promise<void> {
  const referer = bvid ? `https://www.bilibili.com/video/${bvid}` : 'https://www.bilibili.com/'
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
      addRules: [
        {
          id: DNR_RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
            requestHeaders: [
              { header: 'Origin', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'https://www.bilibili.com' },
              { header: 'Referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: referer },
            ],
          },
          condition: {
            requestDomains: AUDIO_CDN_DOMAINS,
          },
        },
      ],
    })
  } catch {
    /* DNR 规则注册失败不阻断流程，fetchAudioData 的错误信息会暴露原因 */
  }
}

void ensureDnrRules()

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

let offscreenCreating: Promise<void> | null = null

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument?.()) return
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen
      .createDocument({
        url: 'src/offscreen/index.html',
        reasons: ['AUDIO_PLAYBACK' as chrome.offscreen.Reason],
        justification: '解码视频音频并调用语音识别接口',
      })
      .finally(() => (offscreenCreating = null))
  }
  await offscreenCreating
}

/** 等待 offscreen 页注册好消息监听（模块脚本异步加载，创建完成 ≠ 可收消息） */
async function waitOffscreenReady(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      const pong: any = await chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_PING })
      if (pong?.ok) return
    } catch {
      /* 监听器未就绪，继续等待 */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new BiliError('音频引擎启动失败，请重试或重载扩展', 'NETWORK')
}

/** job id → 发起转写的标签页，用于进度推送 */
const pendingTabs = new Map<number, number>()
let nextJobId = 1

async function transcribe(bvid: string, page: number, tabId: number | undefined): Promise<{ meta: VideoMeta; entries: SubtitleEntry[] }> {
  const asr = await loadAsrSettings()
  if (!asr.apiKey) {
    throw new BiliError('尚未配置转写 API Key，请先在设置页填写', 'NO_ASR_KEY')
  }
  const view = await getView(bvid)
  const { cid, part } = pickPage(view, page)
  const audioUrls = getAudioUrls(await getPlayurl(bvid, cid))
  if (audioUrls.length === 0) {
    throw new BiliError('该视频没有可用的音频流', 'NO_SUBTITLE')
  }
  const id = nextJobId++
  if (tabId !== undefined) pendingTabs.set(id, tabId)
  try {
    const push = (percent: number, stage: string) => {
      if (tabId === undefined) return
      void chrome.tabs.sendMessage(tabId, { type: MSG.TRANSCRIBE_PROGRESS, id, percent, stage }).catch(() => {})
    }
    await ensureDnrRules(bvid)
    push(5, '正在下载音频…')
    const referrer = `https://www.bilibili.com/video/${bvid}`
    let audioData: ArrayBuffer
    try {
      audioData = await fetchAudioData(audioUrls, referrer)
    } catch (swErr: any) {
      // SW 被 CDN 403，回退到 content script（页面上下文 origin=bilibili.com）
      if (tabId === undefined) throw swErr
      push(8, '正在通过页面下载音频…')
      const resp: any = await chrome.tabs.sendMessage(tabId, { type: MSG.FETCH_AUDIO, url: audioUrls[0] })
      if (!resp?.ok || !resp.data) {
        throw new BiliError(`SW: ${swErr.message ?? 'unknown'} | CS: ${resp?.message ?? 'no response'}`, 'NETWORK')
      }
      const binary = atob(resp.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      audioData = bytes.buffer
    }
    push(15, '正在启动音频引擎…')
    await ensureOffscreen()
    await waitOffscreenReady()
    push(17, '正在传输音频数据…')
    const audioB64 = arrayBufferToBase64(audioData)
    const req: OffscreenTranscribeRequest = {
      type: MSG.OFFSCREEN_TRANSCRIBE,
      id,
      audioData: audioB64,
      baseUrl: asr.baseUrl,
      apiKey: asr.apiKey,
      model: asr.model,
      language: asr.language,
    }
    const resp: any = await chrome.runtime.sendMessage(req)
    if (!resp?.ok) throw new BiliError(resp?.message || '转写失败', 'NETWORK')
    const title = part ? `${view.title} · P${page} ${part}` : String(view.title ?? bvid)
    const meta: VideoMeta = {
      bvid,
      aid: view.aid,
      cid,
      page,
      title,
      owner: view.owner?.name,
      duration: view.duration,
    }
    return { meta, entries: resp.data as SubtitleEntry[] }
  } finally {
    pendingTabs.delete(id)
  }
}

chrome.runtime.onMessage.addListener(
  (req: any, sender, sendResponse: (resp: BgResponse<unknown>) => void) => {
    void (async () => {
      try {
        if (req.type === MSG.GET_SUBTITLES) {
          sendResponse({ ok: true, data: await getSubtitles(req.bvid, req.page) })
        } else if (req.type === MSG.FETCH_TRACK) {
          sendResponse({ ok: true, data: await fetchSubtitleJson(req.url) })
        } else if (req.type === MSG.TRANSCRIBE) {
          sendResponse({ ok: true, data: await transcribe(req.bvid, req.page, sender.tab?.id) })
        } else if (req.type === MSG.OPEN_OPTIONS) {
          void chrome.runtime.openOptionsPage()
          sendResponse({ ok: true, data: null })
        } else if (req.type === MSG.TRANSCRIBE_PROGRESS) {
          // offscreen → background：转发进度到发起页
          const tabId = pendingTabs.get(req.id)
          if (tabId !== undefined) {
            void chrome.tabs.sendMessage(tabId, {
              type: MSG.TRANSCRIBE_PROGRESS,
              percent: req.percent,
              stage: req.stage,
            })
          }
          sendResponse({ ok: true, data: null })
        } else {
          sendResponse({ ok: false, reason: 'NETWORK', message: `未知消息类型: ${String(req?.type)}` })
        }
      } catch (e: any) {
        const reason = e instanceof BiliError ? e.reason : 'NETWORK'
        sendResponse({ ok: false, reason, message: e?.message || '请求失败' })
      }
    })()
    return true
  },
)
