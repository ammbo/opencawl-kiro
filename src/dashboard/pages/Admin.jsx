import { useState, useEffect } from 'preact/hooks';
import { useAuth } from '../hooks/useAuth.jsx';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';
import PhoneInput from '../components/PhoneInput.jsx';
import { formatPhone } from '../utils/phone.js';

export default function Admin() {
  const { user } = useAuth();
  const { request } = useApi();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [sharedNumbers, setSharedNumbers] = useState([]);
  const [newNumber, setNewNumber] = useState('');
  const [addingNumber, setAddingNumber] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.is_admin) return;
    Promise.all([
      request('/api/admin/stats'),
      request('/api/admin/users'),
      request('/api/admin/waitlist'),
      request('/api/admin/shared-numbers'),
    ]).then(([s, u, w, n]) => {
      if (s) setStats(s);
      if (u?.users) setUsers(u.users);
      if (w?.entries) setWaitlist(w.entries);
      if (n?.numbers) setSharedNumbers(n.numbers);
      setLoading(false);
    });
  }, [user]);

  const handleApprove = async (entry) => {
    const res = await request('/api/admin/waitlist/approve', {
      method: 'POST',
      body: JSON.stringify({ waitlist_id: entry.id }),
    });
    if (res) {
      toast('Approved', 'success');
      setWaitlist((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: 'approved' } : e));
    } else {
      toast('Failed to approve', 'error');
    }
  };

  const handleReject = async (entry) => {
    const res = await request('/api/admin/waitlist/reject', {
      method: 'POST',
      body: JSON.stringify({ waitlist_id: entry.id }),
    });
    if (res) {
      toast('Rejected', 'success');
      setWaitlist((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: 'rejected' } : e));
    } else {
      toast('Failed to reject', 'error');
    }
  };

  const handleAddNumber = async (e) => {
    e.preventDefault();
    if (!newNumber.trim()) return;
    setAddingNumber(true);
    const res = await request('/api/admin/shared-numbers', {
      method: 'POST',
      body: JSON.stringify({ phone_number: newNumber.trim() }),
    });
    setAddingNumber(false);
    if (res?.success) {
      toast('Number added to pool', 'success');
      setSharedNumbers((prev) => [{ phone_number: newNumber.trim(), assigned_user_id: null, created_at: new Date().toISOString() }, ...prev]);
      setNewNumber('');
    } else {
      toast('Failed to add number', 'error');
    }
  };

  if (!user?.is_admin) {
    return (
      <div>
        <h1 class="page-title">Admin</h1>
        <div class="placeholder-page">Access denied. Admin privileges required.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 class="page-title">Admin</h1>
        <div class="placeholder-page">Loading admin data…</div>
      </div>
    );
  }

  const availableCount = sharedNumbers.filter((n) => !n.assigned_user_id).length;

  return (
    <div>
      <h1 class="page-title">Admin</h1>

      {stats && (
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{stats.total_users ?? 0}</div>
            <div class="stat-label">Total Users</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{stats.active_calls ?? 0}</div>
            <div class="stat-label">Active Calls</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{stats.total_credits_consumed ?? 0}</div>
            <div class="stat-label">Credits Consumed</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{availableCount}/{sharedNumbers.length}</div>
            <div class="stat-label">Shared Numbers Free</div>
          </div>
        </div>
      )}

      <h2 class="section-title">Shared Phone Pool</h2>
      <form onSubmit={handleAddNumber} class="shared-number-form" style={{ display: 'flex', gap: '8px', marginBottom: '16px', maxWidth: '560px', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <PhoneInput value={newNumber} onValue={setNewNumber} />
        </div>
        <button type="submit" class="btn btn-primary" disabled={addingNumber || !newNumber}>
          {addingNumber ? 'Adding…' : 'Add Number'}
        </button>
      </form>
      {sharedNumbers.length === 0 ? (
        <div class="placeholder-page" style={{ minHeight: '80px' }}>No shared numbers. Add numbers above for free-tier users.</div>
      ) : (
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {sharedNumbers.map((n) => (
                <tr key={n.phone_number}>
                  <td>{formatPhone(n.phone_number) || n.phone_number}</td>
                  <td style={{ color: n.assigned_user_id ? 'var(--warning)' : 'var(--success)' }}>
                    {n.assigned_user_id ? 'Assigned' : 'Available'}
                  </td>
                  <td>{n.assigned_user_id || '—'}</td>
                  <td>{new Date(n.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 class="section-title">Users</h2>
      {users.length === 0 ? (
        <div class="placeholder-page" style={{ minHeight: '80px' }}>No users yet.</div>
      ) : (
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Phone</th>
                <th>Plan</th>
                <th>Credits</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{formatPhone(u.phone) || u.phone}</td>
                  <td style={{ textTransform: 'capitalize' }}>{u.plan}</td>
                  <td>{u.credits_balance}</td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 class="section-title">Waitlist</h2>
      {waitlist.length === 0 ? (
        <div class="placeholder-page" style={{ minHeight: '80px' }}>No waitlist entries.</div>
      ) : (
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Phone</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {waitlist.map((e) => (
                <tr key={e.id}>
                  <td>{formatPhone(e.phone) || e.phone}</td>
                  <td style={{ textTransform: 'capitalize' }}>{e.status}</td>
                  <td>{new Date(e.created_at).toLocaleDateString()}</td>
                  <td>
                    {e.status === 'pending' && (
                      <div class="waitlist-actions">
                        <button class="btn btn-success-sm" onClick={() => handleApprove(e)}>Approve</button>
                        <button class="btn btn-danger-sm" onClick={() => handleReject(e)}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
