import { useState } from 'preact/hooks';
import { useToast } from '../components/Toast.jsx';
import { useCallStatus } from '../hooks/useCallStatus.js';
import PhoneInput from '../components/PhoneInput.jsx';
import VoiceSelector from '../components/VoiceSelector.jsx';
import { ChevronDownIcon, ChevronUpIcon } from '../components/Icons.jsx';

export const STATUS_LABELS = {
  pending: 'Queued',
  in_progress: 'In Progress',
  completed: 'Complete',
  failed: 'Failed',
};

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Classify an API error response into a category for UI handling.
 * @param {{ error?: { code?: string, message?: string } }} json
 * @returns {{ code: string|undefined, message: string }}
 */
export function classifyCallError(json) {
  const code = json?.error?.code;
  const message = json?.error?.message || 'Failed to place call';
  return { code, message };
}

export default function Call() {
  const toast = useToast();

  // Form state
  const [phone, setPhone] = useState('');
  const [goal, setGoal] = useState('');
  const [calling, setCalling] = useState(false);
  const [callId, setCallId] = useState(null);

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [overrideVoiceId, setOverrideVoiceId] = useState('');
  const [overrideSystemPrompt, setOverrideSystemPrompt] = useState('');
  const [overrideFirstMessage, setOverrideFirstMessage] = useState('');

  // Call status polling
  const { status, transcript, duration, error: statusError, reset: resetStatus } = useCallStatus(callId);

  const canSubmit = phone && goal.trim() && !calling;

  const resetForm = () => {
    setPhone('');
    setGoal('');
    setCalling(false);
    setCallId(null);
    setOverrideVoiceId('');
    setOverrideSystemPrompt('');
    setOverrideFirstMessage('');
    resetStatus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setCalling(true);

    const body = { destination_phone: phone, message: goal };
    if (overrideVoiceId) body.voice_id = overrideVoiceId;
    if (overrideSystemPrompt.trim()) body.system_prompt = overrideSystemPrompt;
    if (overrideFirstMessage.trim()) body.first_message = overrideFirstMessage;

    try {
      const res = await fetch('/api/openclaw/call', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        const { code, message: msg } = classifyCallError(json);

        if (code === 'INSUFFICIENT_CREDITS') {
          toast(
            <span>{msg} — <a href="/dashboard/billing" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Add credits</a></span>,
            'error'
          );
        } else if (code === 'INVALID_INPUT') {
          toast(msg, 'error');
        } else {
          toast(msg, 'error');
        }
        setCalling(false);
        return;
      }

      // Success — start polling
      setCallId(json.call_id);
    } catch (err) {
      toast(err.message || 'Network error', 'error');
      setCalling(false);
    }
  };

  return (
    <div>
      <h1 class="page-title">Make a Call</h1>

      <div class="card" style={{ maxWidth: 540 }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label for="call-phone" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              Destination Number
            </label>
            <PhoneInput id="call-phone" value={phone} onValue={setPhone} required />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label for="call-goal" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              Goal
            </label>
            <textarea
              id="call-goal"
              class="form-input"
              rows={3}
              value={goal}
              onInput={(e) => setGoal(e.target.value)}
              placeholder="e.g. Wish Tom a happy birthday, Schedule a dentist appointment for next Tuesday"
            />
          </div>

          {/* Advanced Options toggle */}
          <button
            type="button"
            class="btn btn-secondary"
            style={{ marginBottom: showAdvanced ? 12 : 16, gap: 6 }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            Advanced Options
            {showAdvanced ? <ChevronUpIcon width={16} height={16} /> : <ChevronDownIcon width={16} height={16} />}
          </button>

          {showAdvanced && (
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label for="call-voice" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Voice
                </label>
                <VoiceSelector id="call-voice" value={overrideVoiceId} onChange={setOverrideVoiceId} />
              </div>
              <div>
                <label for="call-system-prompt" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                  System Prompt
                </label>
                <textarea
                  id="call-system-prompt"
                  class="form-input"
                  rows={3}
                  value={overrideSystemPrompt}
                  onInput={(e) => setOverrideSystemPrompt(e.target.value)}
                  placeholder="Override the default system prompt for this call"
                />
              </div>
              <div>
                <label for="call-first-message" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                  First Message
                </label>
                <input
                  id="call-first-message"
                  type="text"
                  class="form-input"
                  value={overrideFirstMessage}
                  onInput={(e) => setOverrideFirstMessage(e.target.value)}
                  placeholder="Override the agent's opening message"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            class="btn btn-primary"
            disabled={!canSubmit}
            style={{ width: '100%' }}
          >
            {calling ? 'Calling…' : 'Call Now'}
          </button>
        </form>

        {/* Live call status display */}
        {callId && status && (
          <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Status:</span>
              <span class="calllog-status" style={{
                background:
                  status === 'completed' ? 'var(--success)' :
                  status === 'failed' ? 'var(--error)' :
                  status === 'in_progress' ? 'var(--warning)' :
                  'var(--text-muted)',
              }}>
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
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>Transcript</div>
                    <div style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 12,
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      maxHeight: 240,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {transcript}
                    </div>
                  </div>
                )}
              </>
            )}

            {status === 'failed' && (
              <div>
                {statusError && (
                  <p style={{ color: 'var(--error)', fontSize: '0.9rem', marginBottom: 12 }}>{statusError}</p>
                )}
                <button class="btn btn-secondary" onClick={resetForm}>
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
