import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { AgentActivityGallery } from './agent-activity/Gallery.tsx';
import './styles.css';

// Dev/recording page with the agent-activity animations; needs no login.
const Root = location.pathname === '/agent-activity' ? AgentActivityGallery : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
