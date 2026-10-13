import {defineConfig} from 'vite';
import motionCanvas from '@motion-canvas/vite-plugin';
export default defineConfig({plugins:[motionCanvas.default({project:'./project.ts'})],build:{rollupOptions:{input:{capture:'capture.html'}}}});
