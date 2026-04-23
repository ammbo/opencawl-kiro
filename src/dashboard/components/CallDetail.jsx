import { useState, useEffect, useRef } from 'preact/hooks';
import { formatPhone } from '../utils/phone.js';

const STATUS_COLORS = {
  pending: 'var(--warning)',
  in_progress: 'var(--accent)',
  completed: 'var(--success)',
  failed: 'var(--error)',
};

/**
 * Format a transcript JSON string (or array) into readable text with speaker labels.
 * Each entry is formatted as "Speaker: message".
 * Returns an array of { label, message } objects.
 */
export function formatTranscript(transcript) {
  if (!transcript) return [];

  let entries;
  if (typeof transcript === 'string') {
    try {
      entries = JSON.parse(transcript);
    } catch {
      return [];
    }
  } else if (Array.isArray(transcript)) {
    entries = transcript;
  } else {
    return [];
  }

  if (!Array.isArray(entries)) return [];

  return entries.map((entry) => {
    const role = (entry.role || '').toLowerCase();
    const label = role === 'agent' ? 'Agent' : role === 'user' ? 'Caller' : role || 'Unknown';
    return { label, message: entry.message || '' };
  });
}

function formatDuration(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CallDetail({ callId, onClose }) {
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!callId) return;
    setLoading(true);
    setError(null);
    setCall(null);

    fetch(`/api/openclaw/status?call_id=${encodeURIComponent(callId)}`, {
      credentials: 'same-origin',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load call (${res.status})`);
        return res.json();
      })
      .then((data) => {
        setCall(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load call details');
        setLoading(false);
      });
  }, [callId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!callId) return null;

  const transcript = call ? formatTranscript(call.transcript) : [];

  return (
    <div class="modal-overlay" onClick={onClose} role="presentation">
      <div
        class="calldetail-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Call details"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="calldetail-header">
          <h2 class="calldetail-title">Call Details</h2>
          <button
            class="calldetail-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div class="calldetail-loading">
            <div class="spinner" />
          </div>
        )}

        {error && (
          <div class="calldetail-error">{error}</div>
        )}

        {!loading && !error && call && (
          <div class="calldetail-body">
            {/* Metadata */}
            <div class="calldetail-meta">
              <div class="calldetail-meta-item">
                <span class="calldetail-meta-label">Direction</span>
                <span>{call.direction === 'outbound' ? '↗ Outbound' : '↙ Inbound'}</span>
              </div>
              <div class="calldetail-meta-item">
                <span class="calldetail-meta-label">Phone</span>
                <span>{call.destination_phone ? (formatPhone(call.destination_phone) || call.destination_phone) : '—'}</span>
              </div>
              <div class="calldetail-meta-item">
                <span class="calldetail-meta-label">Status</span>
                <span
                  class="calllog-status"
                  style={{ background: STATUS_COLORS[call.status] || 'var(--text-muted)' }}
                >
                  {call.status}
                </span>
              </div>
              <div class="calldetail-meta-item">
                <span class="calldetail-meta-label">Duration</span>
                <span>{formatDuration(call.duration_seconds)}</span>
              </div>
              <div class="calldetail-meta-item">
                <span class="calldetail-meta-label">Date</span>
                <span>{formatDate(call.created_at)}</span>
              </div>
            </div>

            {/* Summary */}
            <div class="calldetail-section">
              <h3 class="calldetail-section-title">Summary</h3>
              <p class={call.summary ? 'calldetail-section-text' : 'calldetail-placeholder'}>
                {call.summary || 'No summary available'}
              </p>
            </div>

            {/* Transcript */}
            <div class="calldetail-section">
              <h3 class="calldetail-section-title">Transcript</h3>
              {transcript.length > 0 ? (
                <div class="calldetail-transcript">
                  {transcript.map((line, i) => (
                    <div key={i} class="calldetail-transcript-line">
                      <span class="calldetail-speaker">{line.label}:</span>{' '}
                      <span>{line.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p class="calldetail-placeholder">No transcript available</p>
              )}
            </div>

            {/* Openclaw Result */}
            <div class="calldetail-section">
              <h3 class="calldetail-section-title">Openclaw Result</h3>
              <p class={call.openclaw_result ? 'calldetail-section-text' : 'calldetail-placeholder'}>
                {call.openclaw_result || 'No result posted yet'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
