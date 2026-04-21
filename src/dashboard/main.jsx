import { render } from 'preact';
import App from './app.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { AuthProvider } from './hooks/useAuth.jsx';
import './styles/theme.css';

render(
  <ToastProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ToastProvider>,
  document.getElementById('app')
);
