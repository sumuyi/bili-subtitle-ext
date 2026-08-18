import type { SubtitleEntry, SubtitleTrack } from '../shared/types'

async function getJson(url: string): Promise<any> {
  // MV3 Service Worker 中 fetch 无法设置 Referer/UA 请求头（forbidden headers），
  // 通过 referrer 选项携带来源，满足 B 站接口与 CDN 的来源校验
  const res = await fetch(url, {
    credentials: 'include',
    referrer: 'https://www.bilibili.com/',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function normalizeUrl(url: string): string {
  return url.startsWith('//') ? 'https:' + url : url
}

export class BiliError extends Error {
  reason: string
  constructor(message: string, reason: string) {
    super(message)
    this.reason = reason
  }
}

export async function getView(bvid: string): Promise<any> {
  const j = await getJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
  if (j.code !== 0) {
    throw new BiliError(j.message || '视频信息获取失败', j.code === -404 ? 'NOT_FOUND' : 'NETWORK')
  }
  return j.data
}

export function pickPage(viewData: any, page: number): { cid: number; part?: string } {
  const pages: any[] = viewData.pages ?? []
  const hit = pages.find((p) => p.page === page)
  return hit ? { cid: hit.cid, part: hit.part } : { cid: viewData.cid }
}

const LAN_PRIORITY: Array<(lan: string) => boolean> = [
  (lan) => lan === 'zh-CN' || lan === 'ai-zh' || lan === 'zh-Hans',
  (lan) => lan.startsWith('zh'),
  (lan) => lan.startsWith('en'),
]

function lanRank(lan: string): number {
  const idx = LAN_PRIORITY.findIndex((match) => match(lan))
  return idx === -1 ? LAN_PRIORITY.length : idx
}

export function sortTracks(rawTracks: any[]): SubtitleTrack[] {
  return [...rawTracks]
    .map((t) => ({ t, rank: lanRank(String(t.lan ?? '')) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ t }) => ({
      lan: String(t.lan ?? ''),
      lanDoc: String(t.lan_doc || t.lan || ''),
      aiStatus: Number(t.ai_status ?? 0),
      url: normalizeUrl(String(t.subtitle_url ?? '')),
    }))
    .filter((t) => t.url)
}

export async function getSubtitleTracks(
  aid: number,
  bvid: string,
  cid: number,
): Promise<{ raw: any[]; notLoggedIn: boolean }> {
  // 双源回退：wbi/v2(aid) 优先，player/v2(bvid) 兜底
  const attempts = [
    `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`,
    `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
  ]
  let notLoggedIn = false
  for (const url of attempts) {
    try {
      const j = await getJson(url)
      if (j.code === -101) {
        notLoggedIn = true
        continue
      }
      if (j.code !== 0) continue
      const subs = j.data?.subtitle?.subtitles ?? []
      if (subs.length > 0) return { raw: subs, notLoggedIn: false }
    } catch {
      // 单源失败继续尝试下一个
    }
  }
  return { raw: [], notLoggedIn }
}

export async function fetchSubtitleJson(url: string): Promise<SubtitleEntry[]> {
  const j = await getJson(url)
  const body: any[] = Array.isArray(j?.body) ? j.body : []
  return body
    .map((b) => ({
      from: Number(b.from) || 0,
      to: Number(b.to) || 0,
      content: String(b.content ?? ''),
    }))
    .filter((e) => e.content)
    .sort((a, b) => a.from - b.from)
}
