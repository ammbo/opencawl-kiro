import { useState, useEffect, useCallback } from 'preact/hooks';
import { route } from 'preact-router';
import { useAuth } from '../hooks/useAuth.jsx';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';
import { useCallStatus } from '../hooks/useCallStatus.js';
import PhoneInput from '../components/PhoneInput.jsx';
import { CopyIcon } from '../components/Icons.jsx';
import { STEPS, getStorageKey, resolveInitialStep, nextStep } from './onboarding-utils.js';

function ProgressBar({ currentStep }) {
  return (
    <div class="onboarding-progress">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isDone = stepNum < currentStep;
        return (
          <div key={label} class="onboarding-progress-step">
            <div
              class="onboarding-progress-bar"
              style={{
                background: isDone || isActive ? 'var(--accent)' : 'var(--border)',
              }}
            />
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent)' : isDone ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 1: Welcome ──────────────────────────── */
function StepWelcome({ user, onNext }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Welcome to OpenCawl</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Your verified phone number
      </p>
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 20px',
          fontSize: '1.2rem',
          fontWeight: 600,
          display: 'inline-block',
          marginBottom: 24,
        }}
      >
        {user.phone || '—'}
      </div>
      <div>
        <button class="btn btn-primary" style={{ width: '100%', maxWidth: 280 }} onClick={onNext}>
          Get Started
        </button>
      </div>
    </div>
  );
}

/* ── Step 2: Get a Phone Number ───────────────── */
function StepNumber({ onNext, request, toast }) {
  const [provisioning, setProvisioning] = useState(false);
  const [provisionedNumber, setProvisionedNumber] = useState(null);
  const [failed, setFailed] = useState(false);

  const handleProvision = async () => {
    setProvisioning(true);
    setFailed(false);
    try {
      const res = await request('/api/phone/provision', { method: 'POST' });
      if (res && res.phone_number) {
        setProvisionedNumber(res.phone_number);
      } else {
        setFailed(true);
        toast('Failed to provision number', 'error');
      }
    } catch {
      setFailed(true);
      toast('Failed to provision number', 'error');
    }
    setProvisioning(false);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Get a Phone Number</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Provision a phone number for your AI agent.
      </p>

      {provisionedNumber ? (
        <>
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--success)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 20px',
              fontSize: '1.2rem',
              fontWeight: 600,
              display: 'inline-block',
              marginBottom: 24,
              color: 'var(--success)',
            }}
          >
            {provisionedNumber}
          </div>
          <div>
            <button class="btn btn-primary" style={{ width: '100%', maxWidth: 280 }} onClick={onNext}>
              Continue
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <button
              class="btn btn-primary"
              style={{ width: '100%', maxWidth: 280 }}
              disabled={provisioning}
              onClick={handleProvision}
            >
              {provisioning ? 'Provisioning…' : 'Provision Number'}
            </button>
          </div>
          {failed && (
            <div style={{ marginBottom: 16 }}>
              <button class="btn btn-secondary" style={{ width: '100%', maxWidth: 280 }} onClick={onNext}>
                Skip
              </button>
            </div>
          )}
          <div>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                textDecoration: 'underline',
              }}
              onClick={onNext}
            >
              Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Step 3: Connect OpenClaw ──────────────────── */
function StepConnect({ onNext, request, toast }) {
  const [apiKey, setApiKey] = useState(null);
  const [skillContent, setSkillContent] = useState(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [loadingSkill, setLoadingSkill] = useState(true);

  useEffect(() => {
    // Auto-generate API key if none exists
    (async () => {
      const keys = await request('/api/keys/list');
      if (keys && keys.keys && keys.keys.length > 0) {
        setApiKey(keys.keys[0].key_prefix + '…');
        setLoadingKey(false);
      } else {
        const created = await request('/api/keys/create', { method: 'POST' });
        if (created && created.key) {
          setApiKey(created.key);
        }
        setLoadingKey(false);
      }
    })();

    // Fetch skill file
    fetch('/opencawl.js')
      .then((r) => r.ok ? r.text() : Promise.reject(new Error('Failed to load')))
      .then((text) => { setSkillContent(text); setLoadingSkill(false); })
      .catch(() => { setSkillContent('// Could not load skill file'); setLoadingSkill(false); });
  }, []);

  const copyText = async (text, label) => {
    try {
      await window.navigator.clipboard.writeText(text);
      toast(`${label} copied`, 'success');
    } catch {
      toast('Copy failed', 'error');
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Connect OpenClaw</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, textAlign: 'center' }}>
        Use this API key and skill file to connect your agent.
      </p>

      {/* API Key */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
          API Key
        </label>
        {loadingKey ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Generating…</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                flex: 1,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: '0.85rem',
                wordBreak: 'break-all',
              }}
            >
              {apiKey}
            </div>
            <button
              class="btn btn-secondary"
              style={{ padding: '6px 10px', flexShrink: 0 }}
              onClick={() => copyText(apiKey, 'API key')}
              aria-label="Copy API key"
            >
              <CopyIcon width={16} height={16} />
            </button>
          </div>
        )}
      </div>

      {/* Skill File */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Skill File (opencawl.js)</label>
          {skillContent && (
            <button
              class="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              onClick={() => copyText(skillContent, 'Skill file')}
            >
              <CopyIcon width={14} height={14} /> Copy
            </button>
          )}
        </div>
        {loadingSkill ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</span>
        ) : (
          <pre
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              fontSize: '0.8rem',
              lineHeight: 1.5,
              maxHeight: 240,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {skillContent}
          </pre>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <button class="btn btn-primary" style={{ width: '100%', maxWidth: 280 }} onClick={onNext}>
          Continue
        </button>
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            textDecoration: 'underline',
          }}
          onClick={onNext}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

/* ── Step 4: First Test Call ───────────────────── */
function StepCall({ user, request, toast }) {
  const [phone, setPhone] = useState(user.phone || '');
  const [goal, setGoal] = useState('');
  const [calling, setCalling] = useState(false);
  const [callId, setCallId] = useState(null);
  const [completing, setCompleting] = useState(false);

  const { status, transcript, duration, error: statusError, reset: resetStatus } = useCallStatus(callId);

  const STATUS_LABELS = {
    pending: 'Queued',
    in_progress: 'In Progress',
    completed: 'Complete',
    failed: 'Failed',
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleCall = async (e) => {
    e.preventDefault();
    if (!phone || !goal.trim() || calling) return;
    setCalling(true);
    try {
      const res = await fetch('/api/openclaw/call', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination_phone: phone, message: goal }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json?.error?.message || 'Failed to place call', 'error');
        setCalling(false);
        return;
      }
      setCallId(json.call_id);
    } catch (err) {
      toast(err.message || 'Network error', 'error');
      setCalling(false);
    }
  };

  const completeOnboarding = async () => {
    setCompleting(true);
    await fetch('/api/auth/onboarding-complete', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
    route('/dashboard/');
  };

  const canSubmit = phone && goal.trim() && !calling && !callId;

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Make a Test Call</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, textAlign: 'center' }}>
        Try a quick call to see everything in action.
      </p>

      <form onSubmit={handleCall}>
        <div style={{ marginBottom: 16 }}>
          <label for="onboard-phone" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
            Phone Number
          </label>
          <PhoneInput id="onboard-phone" value={phone} onValue={setPhone} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label for="onboard-goal" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
            Goal / Message
          </label>
          <textarea
            id="onboard-goal"
            class="form-input"
            rows={3}
            value={goal}
            onInput={(e) => setGoal(e.target.value)}
            placeholder="What should the AI say or accomplish on this call?"
          />
        </div>

        <button
          type="submit"
          class="btn btn-primary"
          disabled={!canSubmit}
          style={{ width: '100%', marginBottom: 16 }}
        >
          {calling && !callId ? 'Calling…' : 'Call Now'}
        </button>
      </form>

      {/* Live call status */}
      {callId && status && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Status:</span>
            <span
              class="calllog-status"
              style={{
                background:
                  status === 'completed' ? 'var(--success)' :
                  status === 'failed' ? 'var(--error)' :
                  status === 'in_progress' ? 'var(--warning)' :
                  'var(--text-muted)',
              }}
            >
              {STATUS_LABELS[status] || status}
            </span>
          </div>

          {status === 'completed' && (
            <>
              {duration != null && (
                <div style={{ marginBottom: 12, fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Duration: </span>
                  <span style={{ fontWeight: 600 }}>{formatDuration(duration)}</span>
                </div>
              )}
              {transcript && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>Transcript</div>
                  <div
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 12,
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      maxHeight: 200,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {transcript}
                  </div>
                </div>
              )}
            </>
          )}

          {status === 'failed' && statusError && (
            <p style={{ color: 'var(--error)', fontSize: '0.9rem', marginBottom: 12 }}>{statusError}</p>
          )}
        </div>
      )}

      {/* Finish / Skip */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <button
          class="btn btn-primary"
          style={{ width: '100%', maxWidth: 280 }}
          disabled={completing}
          onClick={completeOnboarding}
        >
          {completing ? 'Finishing…' : 'Finish Setup'}
        </button>
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            textDecoration: 'underline',
          }}
          disabled={completing}
          onClick={completeOnboarding}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

/* ── Main Onboarding Component ─────────────────── */
export default function Onboarding() {
  const { user } = useAuth();
  const { request } = useApi();
  const toast = useToast();

  const [step, setStep] = useState(() => {
    if (!user?.id) return 1;
    const saved = localStorage.getItem(getStorageKey(user.id));
    return resolveInitialStep(saved);
  });

  // Persist step to localStorage whenever it changes
  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(getStorageKey(user.id), String(step));
    }
  }, [step, user?.id]);

  const goNext = useCallback(() => {
    setStep((s) => nextStep(s));
  }, []);

  return (
    <div class="onboarding-wrapper">
      <div class="onboarding-container">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>OpenCawl</span>
        </div>

        <ProgressBar currentStep={step} />

        <div class="card" style={{ padding: 32 }}>
          {step === 1 && <StepWelcome user={user} onNext={goNext} />}
          {step === 2 && <StepNumber onNext={goNext} request={request} toast={toast} />}
          {step === 3 && <StepConnect onNext={goNext} request={request} toast={toast} />}
          {step === 4 && <StepCall user={user} request={request} toast={toast} />}
        </div>
      </div>
    </div>
  );
}
