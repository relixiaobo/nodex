import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';

const mode = process.env.NODE_ENV;
const isStore = mode === 'production';   // npm run zip / npm run build
const isPreview = mode === 'preview';    // npm run build:preview
// Everything else (including 'development') is dev

// Icon directory: Store → original, Preview → blue dot, Dev → orange dot
const iconDir = isPreview ? 'icon-preview' : isStore ? 'icon' : 'icon-dev';

// Manifest name: visually distinguish environments
const name = isPreview ? 'soma Preview' : isStore ? 'soma' : 'soma Dev';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name,
    description: 'Think where you read — knowledge management in your browser side panel',
    // Extension key — determines the extension ID Chrome assigns.
    // All three environments have their own key so they can coexist in Chrome.
    //   Store   → joabcnflpakkpkalkphcdkdbfkcfhlpa
    //   Preview → andlcnfkdjeebjfdjangcnjaicfapmni
    //   Dev     → gkpgogocbjejpildfebpklkldhogdfkp
    key: isStore
      ? 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlUCbj/m/+elw/o2ZjqlI0ctw5hklYQXEdqwp9x34tshVvI9KsotdMT7uoTQ7kiEdGbdWyy2V/dWo+P7HGMQFopklNhyTFg1ABD3pIz6Lqh2U/ZfBrUiAetUBy01ov5T9uo3GmbNWRjqBBaWa9/QerOge72w4Nv/eRETIQbQXt0NSKKqIQWISsXrfGnszC++41r7h2u+MTxMrDm+91L8C3nM5Pbtorxk8heaGpcCmiln/WDFfoy7wiEZyccXzxday+hx/Ybl/UknISzQRGmZzrar8ze1vPoSX07SL45jc5jdCFyJXPPamEyVcXBlFO6UZufFxI/XT+YD0oCq4uemL9wIDAQAB'
      : isPreview
        ? 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqR1gWzl6llxj2hMyQxDma8WT5zY6iGWkpXD75Y+hIE74lKTpbbNxNa2Z1O9cDURCXllePF0+QThnJIWVaawoclRqILhuf0AeVyr7tUL7AJ9n+o17Qk2YZAdoIahCk9SxevMQI4DDHuVzvNEbcpGwuadopzY0syDbQYpjLgf7V1J0zaHVh+gY2l4TxJWHeU+d23bOvG2Qdj41LMj+kEnAiFbFF+YFOlyb+hcd79ZFRv6SmBZQBd0uKBWB8f2hBQAAexQ0FaOLC5UtVOOhCredcwMdlP5oppYq2zdILG+YiWKMw0Qp9NIxBPAj1sJfJsfyc5y1XBdgtf6Do0FNYcb8qwIDAQAB'
        : 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtYC0NMuvk5vqBuUJkpg2TU0D3/MHDEZjSppYfA/+cz4dwneFh9BDiFxdoJNa/znyOxmza03rA5eXWdwPH1pW3VEA5vwlLQOEVyS2vnoqNzMnewfvzxT5YLIhlb/hSdA4FG0cvYpAWZSV0RcthyQgq4wJ1YEcB6LfkuBk/2AHeiir3n9R7h23Bn7xWVFzqgeT4CnFA3gOo3Q05/YWC9V7sS4QIndo8NF9B15lctbnCV7wpAs5QTCuIkM60eARZnJFc1DmmbldEbP06aEI4iPT7XVlLG6D+bMaf0R/uzi9A/4Juc6L6hs4qg12tga0R8poHUcRGd/EPF56soHxcU+4gQIDAQAB',
    icons: {
      '16':  `${iconDir}/16.png`,
      '32':  `${iconDir}/32.png`,
      '48':  `${iconDir}/48.png`,
      '128': `${iconDir}/128.png`,
    },
    permissions: ['storage', 'unlimitedStorage', 'sidePanel', 'activeTab', 'identity', 'scripting', 'debugger'],
    host_permissions: [
      '<all_urls>',                                               // executeScript on any tab
      ...(!isStore && !isPreview ? [
        'http://localhost:8787/*',                                // local dev
        'https://nodex-sync-staging.getsoma.workers.dev/*',      // staging
      ] : []),
      'https://nodex-sync.getsoma.workers.dev/*',              // production
      'https://cdn.syndication.twimg.com/*',                    // x.com video syndication API
    ],
    // Chrome MV3 需要显式允许 WASM 执行（loro-crdt 依赖 WASM）
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' https: data:",
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Open soma',
    },
  },
  vite: () => ({
    plugins: [wasm(), tailwindcss()],
  }),
});
