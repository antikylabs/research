import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Voxel field lab root was not found.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
