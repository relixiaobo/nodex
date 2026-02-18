import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Nodex',
    description: 'Cloud knowledge management in Chrome Side Panel',
    permissions: ['storage', 'sidePanel', 'activeTab', 'identity'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Open Nodex',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
