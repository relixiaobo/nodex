import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Nodex',
    description: 'Cloud knowledge management in Chrome Side Panel',
    // Fixed dev extension ID — derived from the public key below.
    // Production ID will be assigned by Chrome Web Store.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtYC0NMuvk5vqBuUJkpg2TU0D3/MHDEZjSppYfA/+cz4dwneFh9BDiFxdoJNa/znyOxmza03rA5eXWdwPH1pW3VEA5vwlLQOEVyS2vnoqNzMnewfvzxT5YLIhlb/hSdA4FG0cvYpAWZSV0RcthyQgq4wJ1YEcB6LfkuBk/2AHeiir3n9R7h23Bn7xWVFzqgeT4CnFA3gOo3Q05/YWC9V7sS4QIndo8NF9B15lctbnCV7wpAs5QTCuIkM60eARZnJFc1DmmbldEbP06aEI4iPT7XVlLG6D+bMaf0R/uzi9A/4Juc6L6hs4qg12tga0R8poHUcRGd/EPF56soHxcU+4gQIDAQAB',
    permissions: ['storage', 'sidePanel', 'activeTab', 'identity'],
    // Chrome MV3 需要显式允许 WASM 执行（loro-crdt 依赖 WASM）
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Open Nodex',
    },
  },
  vite: () => ({
    plugins: [wasm(), tailwindcss()],
  }),
});
