/**
 * Standalone test entry — served on localhost via Vite.
 * No Chrome extension APIs required.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { TestApp } from './TestApp';
import '../src/assets/main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TestApp />
  </React.StrictMode>,
);
