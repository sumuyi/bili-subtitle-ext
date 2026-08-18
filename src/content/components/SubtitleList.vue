<script setup lang="ts">
import { ref, watch } from 'vue'
import { state } from '../store'
import { fmtPlayTime } from '../../shared/srt'
import type { SubtitleEntry } from '../../shared/types'

const listEl = ref<HTMLElement | null>(null)
const hovering = ref(false)

function seek(entry: SubtitleEntry) {
  const video = document.querySelector('video')
  if (video) video.currentTime = entry.from + 0.01
}

watch(
  () => state.currentIndex,
  () => {
    if (!state.autoScroll || hovering.value || state.currentIndex < 0) return
    const active = listEl.value?.querySelector('.bsx-item.active')
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  },
)
</script>

<template>
  <div
    ref="listEl"
    class="bsx-list"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <div
      v-for="(entry, i) in state.bundle?.entries ?? []"
      :key="i"
      class="bsx-item"
      :class="{ active: i === state.currentIndex }"
      @click="seek(entry)"
    >
      <span class="bsx-time">{{ fmtPlayTime(entry.from) }}</span>
      <span class="bsx-text">{{ entry.content }}</span>
    </div>
  </div>
</template>
