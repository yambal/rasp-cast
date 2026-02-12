import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', '@chakra-ui/react', '@emotion/react'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/status': 'http://localhost:3000',
      '/playlist': 'http://localhost:3000',
      '/skip': 'http://localhost:3000',
      '/stream': 'http://localhost:3000',
      '/interrupt': 'http://localhost:3000',
      '/schedule': 'http://localhost:3000',
    },
  },
});
