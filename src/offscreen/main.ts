import { MSG, type OffscreenTranscribeRequest } from '../shared/protocol'
import type { SubtitleEntry } from '../shared/types'

const SAMPLE_RATE = 16000
// Whisper 系接口返回分段时间戳，可用长块减少请求数
const CHUNK_SEGMENTS = 480 // 8 分钟 ≈ 15MB
// 只返回整段文本的接口（如硅基流动 SenseVoice），用短块保证粒度
const CHUNK_PLAIN = 60 // 1 分钟 ≈ 1.9MB
const MAX_DURATION = 5400 // 90 分钟，超过则解码内存不可控

function report(id: number, percent: number, stage: string) {
  void chrome.runtime.sendMessage({ type: MSG.TRANSCRIBE_PROGRESS, id, percent, stage })
}

/** 保持 AUDIO_PLAYBACK 防休眠：静音振荡器 */
let keeperCtx: AudioContext | null = null
function startKeepAlive() {
  if (keeperCtx) return
  keeperCtx = new AudioContext()
  const osc = keeperCtx.createOscillator()
  const gain = keeperCtx.createGain()
  gain.gain.value = 0.0001
  osc.connect(gain).connect(keeperCtx.destination)
  osc.start()
}
function stopKeepAlive() {
  void keeperCtx?.close()
  keeperCtx = null
}

/** base64 → ArrayBuffer（SW 不支持 URL.createObjectURL，改用 base64 传输） */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** 解码并降采样为 16kHz 单声道 PCM16 */
async function decodeToPcm16(buffer: ArrayBuffer): Promise<{ samples: Float32Array; duration: number }> {
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(buffer)
  void ctx.close()
  const duration = decoded.duration
  const offline = new OfflineAudioContext(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  const samples = rendered.getChannelData(0)
  const pcm = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) pcm[i] = samples[i]
  return { samples: pcm, duration }
}

function encodeWav(samples: Float32Array, from: number, to: number): Blob {
  const count = to - from
  const bytes = new ArrayBuffer(44 + count * 2)
  const view = new DataView(bytes)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + count * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, count * 2, true)
  let offset = 44
  for (let i = from; i < to; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([bytes], { type: 'audio/wav' })
}

async function transcribeChunk(
  blob: Blob,
  index: number,
  cfg: { baseUrl: string; apiKey: string; model: string; language: string },
): Promise<{ segments: Array<{ start: number; end: number; text: string }> } | { text: string }> {
  const form = new FormData()
  form.append('file', blob, `chunk-${index}.wav`)
  form.append('model', cfg.model)
  // Whisper 系支持 verbose_json 返回分段；其他实现多数忽略未知字段
  if (/whisper/i.test(cfg.model)) {
    form.append('response_format', 'verbose_json')
    form.append('timestamp_granularities[]', 'segment')
    // language 仅 Whisper 系支持；SenseVoice 等自带语种检测
    if (cfg.language) form.append('language', cfg.language)
  }
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`转写接口 HTTP ${res.status}${detail ? `：${detail.slice(0, 160)}` : ''}`)
  }
  const j = await res.json()
  if (Array.isArray(j?.segments) && j.segments.length > 0) {
    return { segments: j.segments }
  }
  return { text: String(j?.text ?? '') }
}

/** 无分段接口：整段文本按标点切句，在块时间窗内按字数加权分布时间戳 */
function textToEntries(text: string, from: number, to: number): SubtitleEntry[] {
  const sentences = text
    .split(/(?<=[。！？!?；;\n])/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (sentences.length === 0) return []
  const totalChars = sentences.reduce((n, s) => n + s.length, 0)
  if (totalChars === 0) return []
  const span = to - from
  let cursor = from
  return sentences.map((s) => {
    const dur = (s.length / totalChars) * span
    const entry = { from: cursor, to: cursor + dur, content: s }
    cursor += dur
    return entry
  })
}

async function runTranscribe(req: OffscreenTranscribeRequest): Promise<SubtitleEntry[]> {
  const { id } = req
  startKeepAlive()
  try {
    report(id, 20, '正在解码音频…')
    const { samples, duration } = await decodeToPcm16(base64ToArrayBuffer(req.audioData))
    if (duration > MAX_DURATION) {
      throw new Error(`视频时长 ${Math.round(duration / 60)} 分钟，超过转写上限 90 分钟`)
    }
    const useSegments = /whisper/i.test(req.model)
    const chunkLen = (useSegments ? CHUNK_SEGMENTS : CHUNK_PLAIN) * SAMPLE_RATE
    const total = Math.max(1, Math.ceil(samples.length / chunkLen))
    const entries: SubtitleEntry[] = []
    for (let i = 0; i < total; i++) {
      report(id, 20 + Math.round(((i + 0.5) / total) * 75), `正在转写 ${i + 1}/${total} 段…`)
      const from = i * chunkLen
      const to = Math.min(samples.length, from + chunkLen)
      const offset = from / SAMPLE_RATE
      const result = await transcribeChunk(encodeWav(samples, from, to), i, req)
      if ('segments' in result) {
        for (const seg of result.segments) {
          const text = String(seg.text ?? '').trim()
          if (!text) continue
          entries.push({ from: offset + Number(seg.start) || offset, to: offset + Number(seg.end) || offset, content: text })
        }
      } else {
        entries.push(...textToEntries(result.text, offset, to / SAMPLE_RATE))
      }
    }
    report(id, 98, '正在整理结果…')
    entries.sort((a, b) => a.from - b.from)
    return entries
  } finally {
    stopKeepAlive()
  }
}

chrome.runtime.onMessage.addListener((req: any, _sender, sendResponse) => {
  if (req?.type === MSG.OFFSCREEN_PING) {
    sendResponse({ ok: true, data: 'pong' })
    return false
  }
  if (req?.type !== MSG.OFFSCREEN_TRANSCRIBE) return undefined
  void runTranscribe(req)
    .then((entries) => sendResponse({ ok: true, data: entries }))
    .catch((e: any) => sendResponse({ ok: false, message: e?.message || '转写失败' }))
  return true
})
