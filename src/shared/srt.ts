import type { SubtitleEntry } from './types'

export function fmtSrtTime(sec: number): string {
  const ms = Math.round((sec % 1) * 1000)
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, '0')}`
}

export function buildSrt(entries: SubtitleEntry[]): string {
  return (
    entries
      .map((e, i) => `${i + 1}\n${fmtSrtTime(e.from)} --> ${fmtSrtTime(e.to)}\n${e.content}\n`)
      .join('\n') + '\n'
  )
}

export function fmtPlayTime(sec: number): string {
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p2 = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${p2(m)}:${p2(s)}`
}
