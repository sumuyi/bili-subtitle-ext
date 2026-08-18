export interface CopySettings {
  /** 复制格式：paragraph 单段落（不换行）| lines 逐行 */
  format: 'paragraph' | 'lines'
  /** 逐行模式带 [mm:ss] 时间戳 */
  timestamps: boolean
  /** 自动添加标点符号 */
  punctuation: boolean
}

export const DEFAULT_COPY_SETTINGS: CopySettings = {
  format: 'paragraph',
  timestamps: false,
  punctuation: true,
}

const STORAGE_KEY = 'bsx.copySettings'

export async function loadCopySettings(): Promise<CopySettings> {
  try {
    const stored = (await chrome.storage.sync.get(STORAGE_KEY))[STORAGE_KEY]
    if (stored && typeof stored === 'object') {
      return { ...DEFAULT_COPY_SETTINGS, ...stored }
    }
  } catch {
    /* 存储不可用时回退默认值 */
  }
  return { ...DEFAULT_COPY_SETTINGS }
}

export function saveCopySettings(settings: CopySettings): void {
  void chrome.storage.sync.set({ [STORAGE_KEY]: { ...settings } })
}
