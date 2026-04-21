import { useState, useEffect } from 'preact/hooks';
import Router, { route } from 'preact-router';
import { useAuth } from './hooks/useAuth.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Voice from './pages/Voice.jsx';
import Keys from './pages/Keys.jsx';
import Phone from './pages/Phone.jsx';
import Billing from './pages/Billing.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import Call from './pages/Call.jsx';
import InboundConfig from './pages/InboundConfig.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Install from './pages/Install.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  const { user, loading, error } = useAuth();
  const [url, setUrl] = useState(typeof window !== 'undefined' ? window.location.pathname : '/');

  // Redirect to login when auth fails — in an effect, not during render
  useEffect(() => {
    if (!loading && (error || !user)) {
      window.location.href = '/login/';
    }
  }, [loading, error, user]);

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (!loading && user && (user.onboarding_completed === false || user.onboarding_completed === null) && url !== '/dashboard/onboarding') {
      route('/dashboard/onboarding');
    }
  }, [loading, user, url]);

  if (loading || (!user && !error)) {
    return (
      <div class="spinner-container">
        <div class="spinner" role="status">
          <span class="sr-only">Loading…</span>
        </div>
      </div>
    );
  }

  if (error || !user) {
    // Show spinner while the effect redirect is pending
    return (
      <div class="spinner-container">
        <div class="spinner" role="status">
          <span class="sr-only">Redirecting…</span>
        </div>
      </div>
    );
  }

  const handleRoute = (e) => setUrl(e.url);

  // Onboarding renders as a full-screen wizard without the Layout
  if (url === '/dashboard/onboarding') {
    return (
      <Router onChange={handleRoute}>
        <Onboarding path="/dashboard/onboarding" />
      </Router>
    );
  }

  return (
    <Layout user={user} url={url}>
      <Router onChange={handleRoute}>
        <Home path="/dashboard/" />
        <Voice path="/dashboard/voice" />
        <Keys path="/dashboard/keys" />
        <Phone path="/dashboard/phone" />
        <Billing path="/dashboard/billing" />
        <Settings path="/dashboard/settings" />
        <Admin path="/dashboard/admin" />
        <Call path="/dashboard/call" />
        <InboundConfig path="/dashboard/inbound" />
        <Install path="/dashboard/install" />
        <NotFound default />
      </Router>
    </Layout>
  );
}
