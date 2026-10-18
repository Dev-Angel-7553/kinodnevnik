import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В режиме разработки запросы к API и постерам проксируются на FastAPI (порт 8000)
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Библиотеки — отдельными файлами: браузер кэширует их между обновлениями приложения
        codeSplitting: {
          groups: [
            { name: 'gsap', test: /node_modules[\\/](gsap|@gsap)/ },
            { name: 'motion', test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)/ },
            { name: 'vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@hugeicons)/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true, // доступ с телефона по локальной сети
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/posters': 'http://127.0.0.1:8000',
      '/docs': 'http://127.0.0.1:8000',
      '/swagger': 'http://127.0.0.1:8000',
      '/openapi.json': 'http://127.0.0.1:8000',
    },
  },
});
