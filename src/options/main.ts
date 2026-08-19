import { DEFAULT_ASR_SETTINGS, loadAsrSettings, saveAsrSettings, type AsrSettings } from '../shared/settings'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const providerEl = $<HTMLSelectElement>('provider')
const baseUrlEl = $<HTMLInputElement>('baseUrl')
const apiKeyEl = $<HTMLInputElement>('apiKey')
const modelEl = $<HTMLInputElement>('model')
const languageEl = $<HTMLSelectElement>('language')
const msgEl = $('msg')

const PRESETS: Record<string, { baseUrl: string; model: string }> = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo' },
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/SenseVoiceSmall' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'whisper-1' },
}

function detectProvider(s: AsrSettings): string {
  for (const [key, preset] of Object.entries(PRESETS)) {
    if (s.baseUrl === preset.baseUrl && s.model === preset.model) return key
  }
  return 'custom'
}

function showMsg(text: string, ok: boolean) {
  msgEl.textContent = text
  msgEl.className = ok ? 'msg ok' : 'msg err'
}

providerEl.addEventListener('change', () => {
  const preset = PRESETS[providerEl.value]
  if (!preset) return
  baseUrlEl.value = preset.baseUrl
  modelEl.value = preset.model
})

function loadIntoForm(s: AsrSettings) {
  providerEl.value = detectProvider(s)
  baseUrlEl.value = s.baseUrl || DEFAULT_ASR_SETTINGS.baseUrl
  apiKeyEl.value = s.apiKey
  modelEl.value = s.model || DEFAULT_ASR_SETTINGS.model
  languageEl.value = s.language || ''
}

void loadAsrSettings().then(loadIntoForm)

$('save').addEventListener('click', () => {
  saveAsrSettings({
    baseUrl: baseUrlEl.value.trim() || DEFAULT_ASR_SETTINGS.baseUrl,
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim() || DEFAULT_ASR_SETTINGS.model,
    language: languageEl.value,
  })
  showMsg('已保存', true)
})

$('test').addEventListener('click', async () => {
  const baseUrl = baseUrlEl.value.trim() || DEFAULT_ASR_SETTINGS.baseUrl
  const apiKey = apiKeyEl.value.trim()
  if (!apiKey) return showMsg('请先填写 API Key', false)
  showMsg('测试中…', true)
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return showMsg(`连接失败 HTTP ${res.status}（检查地址与 Key）`, false)
    showMsg('连接成功', true)
  } catch {
    showMsg('网络错误（检查地址是否可达）', false)
  }
})
