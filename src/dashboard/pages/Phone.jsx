import { useState } from 'preact/hooks';
import { useAuth } from '../hooks/useAuth.jsx';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';

export default function Phone() {
  const { user, refresh } = useAuth();
  const { request } = useApi();
  const toast = useToast();
  const [provisioning, setProvisioning] = useState(false);

  const handleProvision = async () => {
    setProvisioning(true);
    const res = await request('/api/phone/provision', { method: 'POST' });
    setProvisioning(false);
    if (res?.phone_number) {
      toast(res.shared ? 'Shared number assigned' : 'Dedicated number provisioned', 'success');
      refresh();
    } else {
      toast('Failed to provision number', 'error');
    }
  };

  const hasNumber = !!user?.twilio_phone_number;
  const isFree = user?.plan === 'free';

  return (
    <div>
      <h1 class="page-title">Phone</h1>

      {hasNumber ? (
        <div class="phone-card">
          <div class="phone-card-label">Your Phone Number</div>
          <div class="phone-card-number">{user.twilio_phone_number}</div>
          <p class="phone-card-hint">
            Inbound calls to this number are routed to your OpenCawl AI agent.
            {isFree && ' This is a shared number. Upgrade for a dedicated line.'}
          </p>
          {isFree && (
            <a href="/dashboard/billing" class="btn btn-secondary" style={{ marginTop: '12px', display: 'inline-flex' }}>
              Upgrade for Dedicated Number
            </a>
          )}
        </div>
      ) : (
        <div class="phone-card">
          <div class="phone-card-label">
            {isFree ? 'Get a Shared Number' : 'Provision a Dedicated Number'}
          </div>
          <p class="phone-card-hint">
            {isFree
              ? 'Free plan users get a shared phone number from our pool. You can upgrade anytime for a dedicated line.'
              : 'Provision a dedicated Twilio phone number for your OpenCawl instance.'}
          </p>
          <button
            class="btn btn-primary"
            onClick={handleProvision}
            disabled={provisioning}
            style={{ marginTop: '12px' }}
          >
            {provisioning ? 'Provisioning…' : isFree ? 'Get Shared Number' : 'Provision Number'}
          </button>
        </div>
      )}
    </div>
  );
}
