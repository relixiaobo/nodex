/**
 * Test page entry point.
 *
 * Opens in a regular browser tab (chrome-extension://[id]/test.html).
 * Pre-seeds sample data so you can immediately test outliner interactions
 * without needing Supabase connected.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '../sidepanel/App';
import { seedTestData } from './seed-data';
import '../../assets/main.css';

// Seed sample nodes before React renders
seedTestData();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
