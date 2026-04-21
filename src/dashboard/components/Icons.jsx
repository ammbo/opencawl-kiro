/**
 * Inline SVG icons — lightweight alternative to lucide-react for Preact.
 * Each icon is a 24x24 SVG matching Lucide's stroke style.
 */

const defaults = { width: 20, height: 20, stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' };

const svg = (children, props = {}) => {
  const p = { ...defaults, ...props };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...p}>
      {children}
    </svg>
  );
};

export const HomeIcon = (p) => svg([
  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />,
  <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
], p);

export const MicIcon = (p) => svg([
  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />,
  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />,
  <line x1="12" x2="12" y1="19" y2="22" />,
], p);

export const KeyIcon = (p) => svg([
  <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />,
  <path d="m21 2-9.6 9.6" />,
  <circle cx="7.5" cy="15.5" r="5.5" />,
], p);

export const PhoneIcon = (p) => svg([
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
], p);

export const CreditCardIcon = (p) => svg([
  <rect width="20" height="14" x="2" y="5" rx="2" />,
  <line x1="2" x2="22" y1="10" y2="10" />,
], p);

export const SettingsIcon = (p) => svg([
  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />,
  <circle cx="12" cy="12" r="3" />,
], p);

export const ShieldIcon = (p) => svg([
  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
], p);

export const CoinsIcon = (p) => svg([
  <circle cx="8" cy="8" r="6" />,
  <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />,
  <path d="M7 6h1v4" />,
  <path d="m16.71 13.88.7.71-2.82 2.82" />,
], p);

export const BarChartIcon = (p) => svg([
  <line x1="12" x2="12" y1="20" y2="10" />,
  <line x1="18" x2="18" y1="20" y2="4" />,
  <line x1="6" x2="6" y1="20" y2="16" />,
], p);

export const SunIcon = (p) => svg([
  <circle cx="12" cy="12" r="4" />,
  <path d="M12 2v2" />,
  <path d="M12 20v2" />,
  <path d="m4.93 4.93 1.41 1.41" />,
  <path d="m17.66 17.66 1.41 1.41" />,
  <path d="M2 12h2" />,
  <path d="M20 12h2" />,
  <path d="m6.34 17.66-1.41 1.41" />,
  <path d="m19.07 4.93-1.41 1.41" />,
], p);

export const MoonIcon = (p) => svg([
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
], p);

export const MenuIcon = (p) => svg([
  <line x1="4" x2="20" y1="12" y2="12" />,
  <line x1="4" x2="20" y1="6" y2="6" />,
  <line x1="4" x2="20" y1="18" y2="18" />,
], p);

export const LogOutIcon = (p) => svg([
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />,
  <polyline points="16 17 21 12 16 7" />,
  <line x1="21" x2="9" y1="12" y2="12" />,
], p);

export const CheckIcon = (p) => svg([
  <path d="M20 6 9 17l-5-5" />,
], p);

export const PhoneOutIcon = (p) => svg([
  <polyline points="22 8 22 2 16 2" />,
  <line x1="16" x2="22" y1="8" y2="2" />,
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
], p);

export const PhoneIncomingIcon = (p) => svg([
  <polyline points="16 2 16 8 22 8" />,
  <line x1="22" x2="16" y1="2" y2="8" />,
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
], p);

export const DownloadIcon = (p) => svg([
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
  <polyline points="7 10 12 15 17 10" />,
  <line x1="12" x2="12" y1="15" y2="3" />,
], p);

export const CopyIcon = (p) => svg([
  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />,
  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />,
], p);

export const ChevronDownIcon = (p) => svg([
  <path d="m6 9 6 6 6-6" />,
], p);

export const ChevronUpIcon = (p) => svg([
  <path d="m18 15-6-6-6 6" />,
], p);
