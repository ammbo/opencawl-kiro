import { useState } from 'preact/hooks';
import { useTheme } from '../hooks/useTheme.js';
import { formatPhone } from '../utils/phone.js';
import {
  HomeIcon, MicIcon, KeyIcon, PhoneIcon,
  PhoneOutIcon, PhoneIncomingIcon, DownloadIcon,
  CreditCardIcon, SettingsIcon, ShieldIcon,
  SunIcon, MoonIcon, MenuIcon,
} from './Icons.jsx';

const NAV_ITEMS = [
  { path: '/dashboard/', label: 'Home', Icon: HomeIcon },
  { path: '/dashboard/voice', label: 'Voice', Icon: MicIcon },
  { path: '/dashboard/keys', label: 'API Keys', Icon: KeyIcon },
  { path: '/dashboard/phone', label: 'Phone', Icon: PhoneIcon },
  { path: '/dashboard/call', label: 'Make a Call', Icon: PhoneOutIcon },
  { path: '/dashboard/inbound', label: 'Inbound', Icon: PhoneIncomingIcon },
  { path: '/dashboard/billing', label: 'Billing', Icon: CreditCardIcon },
  { path: '/dashboard/install', label: 'Install', Icon: DownloadIcon },
  { path: '/dashboard/settings', label: 'Settings', Icon: SettingsIcon },
];

export default function Layout({ children, user, url }) {
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div class="dashboard">
      <button
        class="hamburger"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle navigation menu"
      >
        <MenuIcon width={18} height={18} />
      </button>

      <div
        class={`sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <aside class={`sidebar${sidebarOpen ? ' open' : ''}`} role="navigation" aria-label="Main navigation">
        <div class="sidebar-header">
          <a href="/dashboard/" class="sidebar-logo">OpenCawl</a>
        </div>

        <nav class="sidebar-nav">
          {NAV_ITEMS.map(({ path, label, Icon }) => (
            <a
              key={path}
              href={path}
              class={url === path ? 'active' : ''}
              onClick={closeSidebar}
            >
              <Icon aria-hidden="true" />
              {label}
            </a>
          ))}
          {user?.is_admin && (
            <a
              href="/dashboard/admin"
              class={url === '/dashboard/admin' ? 'active' : ''}
              onClick={closeSidebar}
            >
              <ShieldIcon aria-hidden="true" />
              Admin
            </a>
          )}
        </nav>

        <button class="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark'
            ? <><SunIcon width={14} height={14} /> Light mode</>
            : <><MoonIcon width={14} height={14} /> Dark mode</>
          }
        </button>

        {user && (
          <div class="sidebar-footer">
            <span class="user-phone">{formatPhone(user.phone) || user.phone}</span>
            <span class="user-plan">{user.plan} plan</span>
          </div>
        )}
      </aside>

      <main class="main-content">
        {children}
      </main>
    </div>
  );
}
