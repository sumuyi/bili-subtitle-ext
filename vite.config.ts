import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [vue(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // offscreen 页不在 manifest 中声明，crxjs 不会自动打包，需显式入口且保持原路径
    rollupOptions: {
      input: {
        'src/offscreen/index': 'src/offscreen/index.html',
      },
    },
  },
})
