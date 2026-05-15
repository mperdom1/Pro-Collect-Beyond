import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const root = createRoot(rootElement);

function renderStartupError(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  root.render(
    <div style={{fontFamily: 'system-ui, sans-serif', padding: '24px', color: '#991b1b'}}>
      <h1 style={{margin: 0, fontSize: '20px'}}>Application startup error</h1>
      <p style={{marginTop: '12px'}}>Open browser DevTools Console for full details.</p>
      <pre style={{whiteSpace: 'pre-wrap', background: '#fef2f2', padding: '12px', borderRadius: '8px'}}>{message}</pre>
    </div>
  );
}

try {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  renderStartupError(error);
}
