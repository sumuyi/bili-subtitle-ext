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

export interface AsrSettings {
  /** OpenAI 兼容接口地址（默认 Groq，可换 OpenAI 或兼容中转） */
  baseUrl: string
  apiKey: string
  model: string
  /** 识别语言，空串为自动检测 */
  language: string
}

export const DEFAULT_ASR_SETTINGS: AsrSettings = {
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: '',
  model: 'whisper-large-v3-turbo',
  language: '',
}

const COPY_KEY = 'bsx.copySettings'
const ASR_KEY = 'bsx.asrSettings'

export async function loadCopySettings(): Promise<CopySettings> {
  try {
    const stored = (await chrome.storage.sync.get(COPY_KEY))[COPY_KEY]
    if (stored && typeof stored === 'object') {
      return { ...DEFAULT_COPY_SETTINGS, ...stored }
    }
  } catch {
    /* 存储不可用时回退默认值 */
  }
  return { ...DEFAULT_COPY_SETTINGS }
}

export function saveCopySettings(settings: CopySettings): void {
  void chrome.storage.sync.set({ [COPY_KEY]: { ...settings } })
}

export async function loadAsrSettings(): Promise<AsrSettings> {
  try {
    const stored = (await chrome.storage.sync.get(ASR_KEY))[ASR_KEY]
    if (stored && typeof stored === 'object') {
      return { ...DEFAULT_ASR_SETTINGS, ...stored }
    }
  } catch {
    /* 存储不可用时回退默认值 */
  }
  return { ...DEFAULT_ASR_SETTINGS }
}

export function saveAsrSettings(settings: AsrSettings): void {
  void chrome.storage.sync.set({ [ASR_KEY]: { ...settings } })
}
