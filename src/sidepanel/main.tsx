import React from 'react';
import ReactDOM from 'react-dom/client';
import { SidepanelApp } from './SidepanelApp';
import '../styles/globals.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <SidepanelApp />
    </React.StrictMode>
  );
}

