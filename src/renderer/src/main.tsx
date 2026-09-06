import ReactDOM from 'react-dom/client';

import App from './App';
import './index.css';

/*
 * No StrictMode. It double-invokes effects in development, and this app's
 * effects drive a real Chrome — so the extra pass opened a second browser tab
 * and raced the first. The warnings it offers are not worth defending every
 * side effect against a duplicate run that never happens in production.
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
