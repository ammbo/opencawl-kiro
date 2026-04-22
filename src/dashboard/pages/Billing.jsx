import { useState, useEffect } from 'preact/hooks';
import { useAuth } from '../hooks/useAuth.jsx';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';
import { CheckIcon } from '../components/Icons.jsx';

const PLANS = [
  { name: 'free', label: 'Free', price: '$0', credits: '250 one-time credits', featured: false, features: ['250 one-time credits', 'Shared phone number', '5 curated voices', 'API access'] },
  { name: 'starter', label: 'Starter', price: '$20/mo', credits: '100 min/mo', featured: true, features: ['100 minutes per month', 'Dedicated phone number', 'Full voice library + cloning', '$0.12/min overage'] },
  { name: 'pro', label: 'Pro', price: '$50/mo', credits: '350 min/mo', featured: false, features: ['350 minutes per month', 'Dedicated phone number', 'Full voice library + cloning', '$0.12/min overage'] },
];

export default function Billing() {
  const { user } = useAuth();
  const { request } = useApi();
  const toast = useToast();
  const [usage, setUsage] = useState([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [upgrading, setUpgrading] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    request('/api/billing/usage').then((data) => {
      if (data && data.usage) setUsage(data.usage);
      setLoadingUsage(false);
    });
  }, []);

  const handleUpgrade = async (planName) => {
    setUpgrading(planName);
    const res = await request('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: planName }),
    });
    setUpgrading(null);
    if (res && res.checkout_url) {
      window.location.href = res.checkout_url;
    } else {
      toast('Failed to start checkout', 'error');
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    const res = await request('/api/billing/portal', { method: 'POST' });
    setPortalLoading(false);
    if (res && res.portal_url) {
      window.location.href = res.portal_url;
    } else {
      toast('Failed to open billing portal', 'error');
    }
  };

  const maxUsage = usage.length > 0 ? Math.max(...usage.map((d) => Math.abs(d.total))) : 0;

  return (
    <div>
      <h1 class="page-title">Billing</h1>

      <div class="plan-grid">
        {PLANS.map((p) => {
          const isCurrent = user?.plan === p.name;
          return (
            <div key={p.name} class={`plan-card${isCurrent ? ' plan-card-current' : ''}${p.featured ? ' plan-card-featured' : ''}`}>
              {isCurrent && <span class="plan-badge">Current</span>}
              <h3 class="plan-name">{p.label}</h3>
              <div class="plan-price">{p.price}</div>
              <div class="plan-credits">{p.credits}</div>
              <ul class="plan-features">
                {p.features.map((f) => <li key={f}><CheckIcon width={14} height={14} style={{ color: 'var(--success)', flexShrink: 0 }} /> {f}</li>)}
              </ul>
              {!isCurrent && p.name !== 'free' && (
                <button
                  class="btn btn-primary"
                  onClick={() => handleUpgrade(p.name)}
                  disabled={upgrading === p.name}
                >
                  {upgrading === p.name ? 'Redirecting…' : 'Upgrade'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {user?.plan !== 'free' && (
        <div class="portal-section">
          <button class="btn btn-secondary" onClick={handlePortal} disabled={portalLoading}>
            {portalLoading ? 'Opening…' : 'Manage Subscription'}
          </button>
        </div>
      )}

      <div class="usage-section">
        <h2 class="section-title">Credit Usage</h2>
        {loadingUsage ? (
          <div class="placeholder-page">Loading usage…</div>
        ) : usage.length === 0 ? (
          <div class="placeholder-page">No usage data yet.</div>
        ) : (
          <div class="usage-chart">
            {usage.map((d) => (
              <div key={d.date} class="usage-bar-group">
                <div
                  class="usage-bar"
                  style={{ height: `${maxUsage > 0 ? (Math.abs(d.total) / maxUsage) * 100 : 0}%` }}
                  title={`${Math.abs(d.total)} credits`}
                />
                <span class="usage-bar-label">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
