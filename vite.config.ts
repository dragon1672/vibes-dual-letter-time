import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: '/vibes-dual-letter-time/',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    include: [
      'three', 
      '@react-three/fiber', 
      '@react-three/drei', 
      'manifold-3d',
      'three/examples/jsm/loaders/FontLoader',
      'three/examples/jsm/loaders/TTFLoader',
      'three/examples/jsm/utils/BufferGeometryUtils',
      'three/examples/jsm/exporters/STLExporter'
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
    commonjsOptions: {
      include: [/manifold-3d/, /node_modules/],
    },
  },
});
