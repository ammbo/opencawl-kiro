import { useState, useEffect } from 'preact/hooks';
import { useAuth } from '../hooks/useAuth.jsx';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';
import VoiceSelector from '../components/VoiceSelector.jsx';
import PhoneInput from '../components/PhoneInput.jsx';
import {
  isPaidUser,
  buildSaveConfigBody,
  buildAddNumberBody,
  buildRemoveNumberBody,
  parseAgentConfig,
} from './inbound-config-utils.js';

export default function InboundConfig() {
  const { user } = useAuth();
  const { request } = useApi();
  const toast = useToast();

  // Agent config form state
  const [systemPrompt, setSystemPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);

  // Accepted numbers state
  const [acceptedNumbers, setAcceptedNumbers] = useState([]);
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingNumber, setRemovingNumber] = useState(null);

  const isPaid = isPaidUser(user);

  // Fetch agent config on mount
  useEffect(() => {
    request('/api/phone/agent-config').then((data) => {
      if (data) {
        const config = parseAgentConfig(data);
        setSystemPrompt(config.systemPrompt);
        setFirstMessage(config.firstMessage);
        setVoiceId(config.voiceId);
      }
      setLoadingConfig(false);
    });
  }, []);

  // Fetch accepted numbers on mount (paid users only)
  useEffect(() => {
    if (!isPaid) return;
    setLoadingNumbers(true);
    request('/api/phone/accepted-numbers').then((data) => {
      if (data && data.numbers) setAcceptedNumbers(data.numbers);
      setLoadingNumbers(false);
    });
  }, [isPaid]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await request('/api/phone/agent-config', {
      method: 'POST',
      body: JSON.stringify(buildSaveConfigBody(systemPrompt, firstMessage, voiceId)),
    });
    setSaving(false);
    if (res) {
      toast('Configuration saved', 'success');
    } else {
      toast('Failed to save configuration', 'error');
    }
  };

  const refreshNumbers = async () => {
    const data = await request('/api/phone/accepted-numbers');
    if (data && data.numbers) setAcceptedNumbers(data.numbers);
  };

  const handleAddNumber = async (e) => {
    e.preventDefault();
    if (!newPhone) return;
    setAdding(true);
    const res = await request('/api/phone/accepted-numbers', {
      method: 'POST',
      body: JSON.stringify(buildAddNumberBody(newPhone, newLabel)),
    });
    setAdding(false);
    if (res) {
      toast('Number added', 'success');
      setNewPhone('');
      setNewLabel('');
      await refreshNumbers();
    } else {
      toast('Failed to add number', 'error');
    }
  };

  const handleRemoveNumber = async (phoneNumber) => {
    setRemovingNumber(phoneNumber);
    const res = await request('/api/phone/accepted-numbers', {
      method: 'DELETE',
      body: JSON.stringify(buildRemoveNumberBody(phoneNumber)),
    });
    setRemovingNumber(null);
    if (res) {
      toast('Number removed', 'success');
      await refreshNumbers();
    } else {
      toast('Failed to remove number', 'error');
    }
  };

  if (loadingConfig) {
    return (
      <div>
        <h1 class="page-title">Inbound Config</h1>
        <div class="placeholder-page">Loading configuration…</div>
      </div>
    );
  }

  return (
    <div>
      <h1 class="page-title">Inbound Config</h1>

      {/* Agent Configuration Section */}
      <div class="card" style={{ maxWidth: 540, marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Agent Configuration</h2>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 16 }}>
            <label for="inbound-system-prompt" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              System Prompt / Goal
            </label>
            <textarea
              id="inbound-system-prompt"
              class="form-input"
              rows={5}
              value={systemPrompt}
              onInput={(e) => setSystemPrompt(e.target.value)}
              placeholder="Instructions for how the agent should behave on inbound calls"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label for="inbound-greeting" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              Greeting Message
            </label>
            <input
              id="inbound-greeting"
              type="text"
              class="form-input"
              value={firstMessage}
              onInput={(e) => setFirstMessage(e.target.value)}
              placeholder="The first thing the agent says when answering a call"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label for="inbound-voice" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              Voice
            </label>
            <VoiceSelector id="inbound-voice" value={voiceId} onChange={setVoiceId} />
          </div>

          <button type="submit" class="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>

      {/* Accepted Numbers Section */}
      {!isPaid ? (
        <div class="card" style={{ maxWidth: 540 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Accepted numbers management requires a paid plan.
          </p>
        </div>
      ) : (
        <div class="card" style={{ maxWidth: 540 }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>Accepted Numbers</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            If this list is empty, any caller can reach your agent.
          </p>

          {loadingNumbers ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : (
            <>
              {acceptedNumbers.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {acceptedNumbers.map((n) => (
                    <div
                      key={n.phone_number}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 500 }}>{n.phone_number}</span>
                        {n.label && (
                          <span style={{ marginLeft: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {n.label}
                          </span>
                        )}
                      </div>
                      <button
                        class="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                        disabled={removingNumber === n.phone_number}
                        onClick={() => handleRemoveNumber(n.phone_number)}
                      >
                        {removingNumber === n.phone_number ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAddNumber} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label for="accepted-phone" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                    Phone Number
                  </label>
                  <PhoneInput id="accepted-phone" value={newPhone} onValue={setNewPhone} />
                </div>
                <div>
                  <label for="accepted-label" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                    Label (optional)
                  </label>
                  <input
                    id="accepted-label"
                    type="text"
                    class="form-input"
                    value={newLabel}
                    onInput={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Office, Mom, Support"
                  />
                </div>
                <button type="submit" class="btn btn-primary" disabled={!newPhone || adding}>
                  {adding ? 'Adding…' : 'Add Number'}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
