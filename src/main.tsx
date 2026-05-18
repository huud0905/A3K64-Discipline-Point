import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './taskViewEnhancer';
import './startMenuListEnhancer';
import './index.css';
import './login-responsive-polish.css';
import './scoreboard-modal-fix.css';
import './scoreboard-final-fix.css';
import './scoreboard-theme-animation.css';
import './scoreboard-final-polish.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
