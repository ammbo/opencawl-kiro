import { useState, useEffect } from 'preact/hooks';
import { useAuth } from '../hooks/useAuth.jsx';
import { useApi } from '../hooks/useApi.js';
import { LogOutIcon } from '../components/Icons.jsx';
import { formatPhone } from '../utils/phone.js';

export default function Settings() {
  const { user, logout } = useAuth();
  const { request } = useApi();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    request('/api/billing/usage').then((data) => {
      if (data) setStats(data);
    });
  }, []);

  const totalUsed = stats?.usage
    ? stats.usage.reduce((sum, d) => sum + d.total, 0)
    : null;

  return (
    <div>
      <h1 class="page-title">Settings</h1>

      <div class="settings-card">
        <div class="settings-row">
          <span class="settings-label">Phone</span>
          <span class="settings-value">{user?.phone ? (formatPhone(user.phone) || user.phone) : '—'}</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Plan</span>
          <span class="settings-value" style={{ textTransform: 'capitalize' }}>
            {user?.plan?.replace(/_/g, ' ') || '—'}
          </span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Credits Balance</span>
          <span class="settings-value">
            {user?.credits_balance != null ? user.credits_balance.toLocaleString() : '—'}
          </span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Credits Used This Month</span>
          <span class="settings-value">
            {totalUsed != null ? totalUsed.toLocaleString() : '—'}
          </span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Phone Number</span>
          <span class="settings-value">
            {user?.twilio_phone_number ? (formatPhone(user.twilio_phone_number) || user.twilio_phone_number) : 'Shared pool'}
          </span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Voice</span>
          <span class="settings-value">
            {user?.voice_name || 'Default'}
          </span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Member Since</span>
          <span class="settings-value">
            {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
          </span>
        </div>
      </div>

      {user?.plan !== 'free' && (
        <a href="/dashboard/billing" class="btn btn-secondary" style={{ marginTop: '16px', display: 'inline-flex' }}>
          Manage Subscription
        </a>
      )}

      <div style={{ marginTop: '24px' }}>
        <button class="btn btn-danger" onClick={logout}>
          <LogOutIcon width={16} height={16} />
          Log Out
        </button>
      </div>
    </div>
  );
}
