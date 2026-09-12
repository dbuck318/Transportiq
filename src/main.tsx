import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Automatically register the generated PWA service worker in production and listen for updates
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('ServiceWorker registered with scope: ', reg.scope);
        
        // Check for updates on the server every 5 minutes in the background
        setInterval(() => {
          reg.update().catch(err => console.warn('SW update check failed:', err));
        }, 300000);
      })
      .catch(err => {
        console.error('ServiceWorker registration failed: ', err);
      });
  });

  // When a new service worker takes control (via skipWaiting), reload the page to apply the update instantly
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
