import { useState, useEffect } from 'preact/hooks';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';

export default function Keys() {
  const { request } = useApi();
  const toast = useToast();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState(null);
  const [creating, setCreating] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    const data = await request('/api/keys/list');
    if (data && data.keys) setKeys(data.keys);
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    const res = await request('/api/keys/create', { method: 'POST' });
    setCreating(false);
    if (res && res.key) {
      setNewKey(res.key);
      toast('API key created', 'success');
      fetchKeys();
    } else {
      toast('Failed to create key', 'error');
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const res = await request('/api/keys/revoke', {
      method: 'POST',
      body: JSON.stringify({ key_id: revokeTarget.id }),
    });
    setRevokeTarget(null);
    if (res) {
      toast('Key revoked', 'success');
      fetchKeys();
    } else {
      toast('Failed to revoke key', 'error');
    }
  };

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div>
      <h1 class="page-title">API Keys</h1>

      <div class="keys-header">
        <button class="btn btn-primary" onClick={handleCreate} disabled={creating}>
          {creating ? 'Generating…' : '+ Generate New Key'}
        </button>
      </div>

      {newKey && (
        <div class="new-key-banner">
          <p class="new-key-label">New API key (copy now — it won't be shown again):</p>
          <div class="new-key-row">
            <code class="new-key-value">{newKey}</code>
            <button class="btn btn-secondary" onClick={copyKey}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div class="placeholder-page">Loading keys…</div>
      ) : keys.length === 0 ? (
        <div class="placeholder-page">No API keys yet. Generate one to get started.</div>
      ) : (
        <div class="keys-table-wrap">
          <table class="keys-table">
            <thead>
              <tr>
                <th>Prefix</th>
                <th>Created</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td><code>{k.key_prefix}…</code></td>
                  <td>{new Date(k.created_at).toLocaleDateString()}</td>
                  <td>
                    <span class={`key-status ${k.is_active ? 'key-active' : 'key-revoked'}`}>
                      {k.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td>
                    {k.is_active && (
                      <button class="btn btn-danger-sm" onClick={() => setRevokeTarget(k)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!revokeTarget}
        title="Revoke API Key"
        message={`Are you sure you want to revoke key ${revokeTarget?.key_prefix}…? This action cannot be undone. Any integrations using this key will stop working.`}
        confirmLabel="Revoke"
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
        destructive
      />
    </div>
  );
}
