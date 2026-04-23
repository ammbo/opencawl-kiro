import { useState, useEffect } from 'preact/hooks';
import { useAuth } from '../hooks/useAuth.jsx';
import { useApi } from '../hooks/useApi.js';
import { CoinsIcon, PhoneIcon, MicIcon, BarChartIcon } from '../components/Icons.jsx';
import CallLog from '../components/CallLog.jsx';
import CallDetail from '../components/CallDetail.jsx';
import { formatPhone } from '../utils/phone.js';

export default function Home() {
  const { user } = useAuth();
  const { request, loading } = useApi();
  const [calls, setCalls] = useState([]);
  const [usage, setUsage] = useState(null);
  const [selectedCallId, setSelectedCallId] = useState(null);

  useEffect(() => {
    request('/api/billing/usage').then((data) => {
      if (data) {
        setUsage(data);
        if (data.recent_calls) setCalls(data.recent_calls);
      }
    });
  }, []);

  const balance = user?.credits_balance;
  const creditColor =
    balance > 100 ? 'var(--success)' :
    balance >= 20 ? 'var(--warning)' :
    'var(--error)';

  return (
    <div>
      <h1 class="page-title">Dashboard</h1>

      <div class="status-grid">
        <div class="status-card">
          <div class="status-card-icon" aria-hidden="true"><CoinsIcon /></div>
          <div class="status-card-value" style={{ color: balance != null ? creditColor : undefined }}>
            {balance != null ? balance.toLocaleString() : '—'}
          </div>
          <div class="status-card-label">Credits</div>
        </div>

        <div class="status-card">
          <div class="status-card-icon" aria-hidden="true"><PhoneIcon /></div>
          <div class="status-card-value">
            {user?.twilio_phone_number ? (formatPhone(user.twilio_phone_number) || user.twilio_phone_number) : 'Shared'}
          </div>
          <div class="status-card-label">Phone</div>
        </div>

        <div class="status-card">
          <div class="status-card-icon" aria-hidden="true"><MicIcon /></div>
          <div class="status-card-value">
            {user?.voice_name || 'Default'}
          </div>
          <div class="status-card-label">Voice</div>
        </div>

        <div class="status-card">
          <div class="status-card-icon" aria-hidden="true"><BarChartIcon /></div>
          <div class="status-card-value">
            {usage?.calls_today ?? 0}
          </div>
          <div class="status-card-label">Calls Today</div>
        </div>
      </div>

      <div class="home-calls">
        <h2 class="section-title">Recent Calls</h2>
        {loading ? (
          <div class="placeholder-page">Loading calls…</div>
        ) : (
          <CallLog calls={calls} onCallClick={setSelectedCallId} />
        )}
      </div>

      {selectedCallId && (
        <CallDetail
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
        />
      )}
    </div>
  );
}
