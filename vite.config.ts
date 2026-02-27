import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: 'static',
  build: {
    lib: {
      entry: resolve(__dirname, 'src/module/ai-pf2e-assistant.ts'),
      name: 'ai-pf2e-assistant',
      fileName: 'ai-pf2e-assistant',
      formats: ['es']
    },
    rollupOptions: {
      output: {
        dir: 'dist',
        entryFileNames: '[name].js',
        format: 'es',
        inlineDynamicImports: true
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
}); 