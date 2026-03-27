import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '../../assets/main.css';

// ── Theme-aware toolbar icon ──
// Side panel has matchMedia (Service Worker does not).
// Light mode: green cat; Dark mode: warm-paper cat.
function applyThemeIcon(isDark: boolean): void {
  const suffix = isDark ? '-dark' : '';
  chrome.action.setIcon({
    path: {
      16: `icon${suffix}/16.png`,
      32: `icon${suffix}/32.png`,
      48: `icon${suffix}/48.png`,
      128: `icon${suffix}/128.png`,
    },
  });
}

const mq = matchMedia('(prefers-color-scheme: dark)');
applyThemeIcon(mq.matches);
mq.addEventListener('change', (e) => applyThemeIcon(e.matches));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
