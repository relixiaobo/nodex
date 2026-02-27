/**
 * Test page entry point.
 *
 * Opens in a regular browser tab (chrome-extension://[id]/test.html).
 * Pre-seeds sample data so you can immediately test outliner interactions
 * without needing a backend connected.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '../sidepanel/App';
import { seedTestData } from './seed-data';
import '../../assets/main.css';

// Test page always boots from a deterministic fresh dataset.
seedTestData({ forceFresh: true }).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App skipBootstrap />
    </React.StrictMode>,
  );
});
