import type { SubtitleEntry } from './types'
import type { CopySettings } from './settings'
import { fmtPlayTime } from './srt'

const TRAILING_PUNCT = /[，。！？；：、…,.!?;:）)」』"”]$/
// 语气助词结尾通常意味着一句话说完了
const TONE_ENDING = /[呢吗吧啊呀哦啦嘛哈咯喽嘞嗯唉诶欸]$/

function isAsciiText(text: string): boolean {
  return /^[\x00-\x7F\s]+$/.test(text)
}

/**
 * 为单条字幕补标点：
 * - 已有结尾标点 → 原样保留
 * - 与下一条之间有明显停顿（gap > 0.35s）、时长较长、或以语气助词结尾 → 句号
 * - 否则 → 逗号（视为句子未说完）
 */
function punctuate(entry: SubtitleEntry, next: SubtitleEntry | null): string {
  const text = entry.content.trim()
  if (!text || TRAILING_PUNCT.test(text)) return text
  const ascii = isAsciiText(text)
  const endMark = ascii ? '. ' : '。'
  const commaMark = ascii ? ', ' : '，'
  const gap = next ? next.from - entry.to : Infinity
  const duration = entry.to - entry.from
  if (gap > 0.35 || duration > 3.5 || TONE_ENDING.test(text)) return text + endMark
  return text + commaMark
}

function joinSegments(parts: string[], punctuation: boolean): string {
  if (punctuation) {
    // 标点已充当分隔（英文标点自带尾随空格）
    return parts.join('')
  }
  return parts.reduce((acc, cur) => {
    if (!acc) return cur
    // 无标点时，英文片段之间补空格，中文直接拼接
    const sep = isAsciiText(acc.slice(-8)) || isAsciiText(cur.slice(0, 8)) ? ' ' : ''
    return acc + sep + cur
  }, '')
}

export function buildCopyText(entries: SubtitleEntry[], settings: CopySettings): string {
  if (!entries.length) return ''
  const parts = entries.map((e, i) => punctuate(e, entries[i + 1] ?? null))

  if (settings.format === 'lines') {
    return parts
      .map((text, i) => (settings.timestamps ? `[${fmtPlayTime(entries[i].from)}] ${text.trimEnd()}` : text.trimEnd()))
      .join('\n')
  }
  return joinSegments(parts, settings.punctuation)
}
