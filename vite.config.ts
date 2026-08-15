import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    envPrefix: ['VITE_', 'GEMINI_', 'MISTRAL_', 'DEEPGRAM_', 'CARTESIA_', 'NV_', 'CONVAI_', 'TAVILY_'],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
      'process.env.MISTRAL_API_KEY': JSON.stringify(env.MISTRAL_API_KEY || env.VITE_MISTRAL_API_KEY),
      'process.env.DEEPGRAM_API_KEY': JSON.stringify(env.DEEPGRAM_API_KEY || env.VITE_DEEPGRAM_API_KEY),
      'process.env.CARTESIA_API_KEY': JSON.stringify(env.CARTESIA_API_KEY || env.VITE_CARTESIA_API_KEY),
      'process.env.NV_API_KEY': JSON.stringify(env.NV_API_KEY || env.VITE_NV_API_KEY),
      'process.env.TAVILY_API_KEY': JSON.stringify(env.TAVILY_API_KEY || env.VITE_TAVILY_API_KEY),
      'process.env.CONVAI_API_KEY': JSON.stringify(env.CONVAI_API_KEY || env.VITE_CONVAI_API_KEY),
      'process.env.CONVAI_CHARACTER_ID': JSON.stringify(env.CONVAI_CHARACTER_ID || env.VITE_CONVAI_CHARACTER_ID),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/groq': {
          target: 'https://api.groq.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/groq/, '/openai/v1'),
        },
        '/api/mistral': {
          target: 'https://api.mistral.ai',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/mistral/, ''),
        },
        '/api/deepgram': {
          target: 'https://api.deepgram.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/deepgram/, '/v1'),
        },
        '/api/cartesia': {
          target: 'https://api.cartesia.ai',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/api\/cartesia/, ''),
        },
      },


    },
  };
});
