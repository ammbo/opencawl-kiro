export default function CreditCard({ balance, plan }) {
  const color =
    balance > 100 ? 'var(--success)' :
    balance >= 20 ? 'var(--warning)' :
    'var(--error)';

  return (
    <div class="credit-card">
      <div class="credit-card-label">Credit Balance</div>
      <div class="credit-card-balance" style={{ color }}>
        {balance != null ? balance.toLocaleString() : '—'}
      </div>
      {plan && (
        <div class="credit-card-plan">
          {plan.replace(/_/g, ' ')} plan
        </div>
      )}
    </div>
  );
}
