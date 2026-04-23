import { formatPhone } from '../utils/phone.js';

function formatDuration(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const STATUS_COLORS = {
  pending: 'var(--warning)',
  in_progress: 'var(--accent)',
  completed: 'var(--success)',
  failed: 'var(--error)',
};

export default function CallLog({ calls, onCallClick }) {
  if (!calls || calls.length === 0) {
    return (
      <div class="calllog-empty">
        No calls yet. Use the API or dashboard to make your first call.
      </div>
    );
  }

  return (
    <div class="calllog-wrapper">
      <table class="calllog-table">
        <thead>
          <tr>
            <th>Direction</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Summary</th>
            <th>Duration</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr
              key={call.id}
              style={{ cursor: onCallClick ? 'pointer' : undefined }}
              onClick={() => onCallClick && onCallClick(call.id)}
            >
              <td>
                <span title={call.direction === 'outbound' ? 'Outbound' : 'Inbound'}>
                  {call.direction === 'outbound' ? '↗' : '↙'}
                </span>
              </td>
              <td>{call.destination_phone ? (formatPhone(call.destination_phone) || call.destination_phone) : '—'}</td>
              <td>
                <span
                  class="calllog-status"
                  style={{ background: STATUS_COLORS[call.status] || 'var(--text-muted)' }}
                >
                  {call.status}
                </span>
              </td>
              <td class="calllog-summary">
                {call.summary || '—'}
              </td>
              <td>{formatDuration(call.duration_seconds)}</td>
              <td>{formatDate(call.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
