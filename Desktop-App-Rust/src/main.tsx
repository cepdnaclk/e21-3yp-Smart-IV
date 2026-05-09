import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Developer tool: exposes window.startMockSimulation()
// You can also uncomment the next line to auto-start it immediately on load:
// import { startSimulation } from './mock/simulator';
// startSimulation();
import './mock/simulator';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
