# Implementation Plan: UI Design Overhaul

## Overview

Replace the indigo/purple aesthetic across all platform surfaces with a warm, editorial design language built on coral accent (#E8655A), deep dark palette (#0d0d0d), and gold featured highlights (#D4A843). Implementation proceeds tokens-first so downstream changes inherit the new system immediately.

## Tasks

- [x] 1. Update design system tokens in theme.css
  - [x] 1.1 Replace `:root` CSS custom properties with new design tokens
    - Replace `--bg` (#0a0a0f → #0d0d0d), `--bg-card` (hex → rgba(255,255,255,0.04)), `--bg-card-hover` (hex → rgba(255,255,255,0.07)), `--bg-sidebar` (#0e0e16 → #111111), add `--bg-elevated` (#1a1a1a)
    - Replace `--text` (#e4e4ef → #F5F5F5), `--text-muted` (#8888a0 → #8A8A8A), add `--text-hover` (#FFFFFF)
    - Replace `--accent` (#6366f1 → #E8655A), `--accent-hover` (#d4574c), remove `--accent-light` and `--gradient`
    - Add `--border-gold` (#D4A843)
    - Add `--radius-pill` (999px)
    - Add type scale tokens: `--text-xs` (0.75rem) through `--text-3xl` (3rem)
    - Add spacing scale tokens: `--space-1` (4px) through `--space-10` (64px)
    - Add transition tokens: `--transition-fast` (150ms ease), `--transition-base` (200ms ease), `--transition-slow` (250ms ease)
    - Add `--max-width` (1120px)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.2, 7.3_
  - [x] 1.2 Update `[data-theme="light"]` block with coral accent and new token names
    - Replace indigo accent with coral `--accent: #E8655A`, remove `--gradient`, remove `--accent-light`
    - Add `--border-gold: #D4A843`, `--text-hover`, and new token overrides for light backgrounds
    - _Requirements: 1.2, 1.7_
  - [x] 1.3 Remove all gradient references from theme.css component styles
    - Remove `var(--gradient)` from `.sidebar-logo`, `.plan-price`, `.stat-value`, `.btn-primary` (landing-style if present)
    - Replace gradient text (`-webkit-background-clip: text`) with solid `color: var(--accent)` or `color: var(--text)` as specified
    - _Requirements: 1.2, 5.4, 9.3_

- [x] 2. Update dashboard layout and spacing in theme.css
  - [x] 2.1 Update `.main-content` padding and `.page-title` sizing
    - Change `.main-content` padding to 40px on desktop
    - Update mobile breakpoint (≤768px) padding to `24px 24px`
    - Set `.page-title` to `font-size: 1.75rem`, `margin-bottom: 32px`
    - _Requirements: 4.1, 4.2_
  - [x] 2.2 Update card padding and gap values
    - Set card padding to 24px and gap between cards to 20px across `.plan-card`, `.voice-card`, `.phone-card`, `.credit-card`, `.stat-card`
    - _Requirements: 4.3_
  - [x] 2.3 Add `.status-grid` and `.status-card` CSS rules
    - Add `.status-grid`: `display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px`
    - Add `.status-card`: `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; text-align: center`
    - Add `.status-card-icon`, `.status-card-value`, `.status-card-label` styles
    - Add mobile breakpoint (≤768px): `.status-grid` stacks to single column
    - _Requirements: 4.4, 4.5, 4.6_

- [x] 3. Update sidebar styles in theme.css
  - Replace `.sidebar-logo` gradient text with solid `color: var(--accent)`
  - Update `.sidebar` background to use `var(--bg-sidebar)` (now #111111 via token)
  - Update `.sidebar-nav a.active`: `color: var(--accent)`, `border-left-color: var(--accent)`, remove `--accent-light` reference
  - Update `.sidebar-nav a` hover transition to use `var(--transition-base)`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 8.3_

- [x] 4. Add featured card and interactive component styles in theme.css
  - [x] 4.1 Add `.plan-card-featured` CSS class
    - `border-color: var(--border-gold); box-shadow: 0 0 24px rgba(212, 168, 67, 0.12)`
    - Update `.plan-price` to use solid `color: var(--text)` instead of gradient text
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 4.2 Update interactive hover/transition styles
    - Ensure card hover transitions border-color to `var(--accent)` over `var(--transition-fast)` (150ms)
    - Verify button hover: opacity 0.9, translateY(-1px)
    - _Requirements: 8.1, 8.2_

- [x] 5. Checkpoint — Verify design tokens and dashboard CSS
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Rewrite the landing page HTML structure
  - [x] 6.1 Update `src/landing/index.html` navbar, hero, and meta tags
    - Replace navbar: logo left, right side has "FAQ" anchor link, "Log In" link, coral "Get Started" pill button
    - Update hero: white text on dark background, no gradient text, coral pill CTA button
    - Add OG meta tags (og:title "OpenCawl - Give your agent a phone number", og:image, og:type "website"), twitter:card, theme-color (#0d0d0d), favicon
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 6.2 Add conversation mockup sections to `src/landing/index.html`
    - Add two alternating demo sections with text + phone-frame chat bubble mockups
    - First section: text left, mockup right; second section: reversed
    - _Requirements: 2.5, 2.6_
  - [x] 6.3 Add FAQ accordion section to `src/landing/index.html`
    - Add `<section class="faq" id="faq">` with `<details>/<summary>` elements for each question
    - Place after conversation mockups and before pricing
    - _Requirements: 2.7_
  - [x] 6.4 Update pricing cards and footer in `src/landing/index.html`
    - Add `pricing-card--featured` class and gold border to Starter card
    - Update footer: "© 2026 OpenCawl", GitHub link, Docs link, tagline "Open source voice interface for AI agents"
    - _Requirements: 2.8, 2.9, 9.4_

- [x] 7. Update landing page styles
  - [x] 7.1 Update `src/landing/styles.css` `:root` tokens to match design system
    - Replace indigo/purple values with coral accent, dark palette, remove `--gradient`, add `--border-gold`, `--radius-pill`, type scale, spacing scale, transition tokens
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 7.2, 7.3_
  - [x] 7.2 Update button and navbar styles in `src/landing/styles.css`
    - `.btn-primary`: solid `background: var(--accent)`, `border-radius: var(--radius-pill)`
    - `.nav-logo`: solid `color: var(--accent)` instead of gradient text
    - Add "Get Started" nav button styles, "Log In" and "FAQ" link styles
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 7.3 Update hero and feature card styles in `src/landing/styles.css`
    - Remove `.gradient-text` class/usage, hero text is plain white
    - Update `.feature-card:hover` to use `border-color: var(--accent)` instead of gradient
    - _Requirements: 2.4, 2.9, 8.2_
  - [x] 7.4 Add conversation mockup and FAQ accordion styles to `src/landing/styles.css`
    - Add `.demo-section`, `.demo-inner`, `.demo-text`, `.demo-mockup`, `.phone-frame`, `.chat-bubble` styles
    - Add alternating layout (`.demo-section:nth-child(even)` reverses flex direction)
    - Add `.faq`, `.faq-list`, `.faq-item`, `.faq-question`, `.faq-answer` styles with smooth height transition (250ms ease)
    - _Requirements: 2.5, 2.6, 2.7, 8.4_
  - [x] 7.5 Update pricing card styles for gold featured treatment in `src/landing/styles.css`
    - `.pricing-card--featured`: `border-color: var(--border-gold); box-shadow: 0 0 24px rgba(212, 168, 67, 0.12)`
    - `.pricing-badge`: solid coral background instead of gradient
    - _Requirements: 8.5, 9.4_

- [x] 8. Update landing page script
  - Update `src/landing/script.js` to add smooth scroll for `#faq` anchor and any FAQ accordion JS enhancements if native `<details>` needs supplementation
  - _Requirements: 8.4_

- [x] 9. Checkpoint — Verify landing page changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Update login page
  - [x] 10.1 Update `src/login/index.html` inline `:root` tokens and meta tags
    - Replace inline `:root` variables to match design system: `--bg: #0d0d0d`, `--accent: #E8655A`, remove `--gradient`, `--accent-light`, add `--radius-pill`
    - Add OG meta tags (og:title "OpenCawl - Log in to your account", og:image, og:type), twitter:card, theme-color, favicon
    - _Requirements: 1.2, 1.3, 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 6.1_
  - [x] 10.2 Update login page component styles
    - `.login-logo`: solid `color: var(--accent)` instead of gradient, remove `-webkit-background-clip` and `-webkit-text-fill-color`
    - `.btn-primary`: solid `background: var(--accent)`, `border-radius: var(--radius-pill)` (999px)
    - `.form-input:focus`: `border-color: var(--accent)`
    - `.login-footer a`: `color: var(--accent)` instead of `var(--accent-light)`
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [x] 11. Update dashboard HTML meta tags
  - Add OG meta tags to `src/dashboard/index.html`: og:title "OpenCawl - Dashboard", og:image, og:type "website", twitter:card, theme-color (#0d0d0d), favicon
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7_

- [x] 12. Update Dashboard Home page to status card grid
  - Replace `src/dashboard/pages/Home.jsx` 2-column layout (CreditCard + action buttons) with 4-card status grid
  - Add status cards: Credit Balance (with color logic from CreditCard), Phone Number, Active Voice, Calls Today
  - Keep Recent Calls / CallLog section below the status grid
  - Reuse credit color logic from CreditCard component inline
  - _Requirements: 4.4_

- [x] 13. Update Billing page featured card
  - Add `featured: true` to the Starter plan in the `PLANS` array in `src/dashboard/pages/Billing.jsx`
  - Apply `plan-card-featured` CSS class conditionally based on `featured` flag
  - _Requirements: 9.1, 9.2, 9.3_

- [ ]* 14. Write unit tests for Billing PLANS featured flag
  - Test that the PLANS array has exactly one plan with `featured: true` and it is the "starter" plan
  - _Requirements: 9.1_

- [x] 15. Final checkpoint — Verify all changes
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no indigo/purple hex values (#6366f1, #a855f7, #818cf8) remain in any modified files
  - Verify all three HTML entry points have complete OG/meta tags
  - Verify featured cards use gold border on both landing and billing pages

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Design tokens in theme.css are implemented first (tasks 1-4) since landing, login, and dashboard all depend on them
- The landing page and login page redefine tokens in their own stylesheets/inline styles to match, since they don't import theme.css via Vite
- No backend or API changes are required — this is purely a frontend visual overhaul
- Property-based tests are not applicable (no pure functions with meaningful input/output properties)
- CreditCard.jsx may be simplified or removed after Home.jsx status grid replaces the standalone card usage
