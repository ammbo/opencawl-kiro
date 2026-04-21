# Requirements Document

## Introduction

Complete UI/UX design overhaul for the platform, replacing the generic indigo/purple "vibe-coded" aesthetic with a warm, editorial design language. The overhaul spans three surfaces: the marketing landing page, the login page, and the dashboard SPA. A unified design system (CSS custom properties) ensures consistency across all surfaces. The goal is to look confident and polished rather than template-generated.

## Glossary

- **Design_System**: A shared set of CSS custom properties, typography scales, spacing tokens, and component styles that define the visual language across all surfaces
- **Landing_Page**: The marketing site at `src/landing/` that introduces the platform to visitors
- **Login_Page**: The authentication page at `src/login/` where users sign in via phone/OTP
- **Dashboard**: The Preact SPA at `src/dashboard/` where authenticated users manage calls, voices, keys, billing, and settings
- **Sidebar**: The fixed left-hand navigation panel in the Dashboard
- **Status_Card**: A dashboard card displaying a single metric (credits, phone number, voice, daily calls) with a label, value, and optional icon
- **FAQ_Accordion**: An expandable/collapsible section on the Landing_Page where each question reveals its answer on click
- **Conversation_Mockup**: An illustrative UI element on the Landing_Page showing a stylized phone conversation to demonstrate the product
- **Meta_Tags**: HTML head elements including Open Graph tags, favicon references, title, and description used for SEO and social sharing
- **Coral_Accent**: The primary accent color (#E8655A / warm coral-red) drawn from desired branding
- **Dark_Palette**: The background color system using deep near-black tones (#0d0d0d base) with semi-transparent card surfaces
- **Gold_Border**: An amber/gold border treatment (#D4A843) used to highlight featured or promoted cards

## Requirements

### Requirement 1: Unified Design System

**User Story:** As a developer, I want a single source of truth for all visual tokens, so that the landing page, login page, and dashboard share a consistent look and feel.

#### Acceptance Criteria

1. THE Design_System SHALL define CSS custom properties for colors (backgrounds, text, borders, accents), typography scale, spacing scale, border radii, and transition durations in a single shared file
2. THE Design_System SHALL use Coral_Accent (#E8655A) as the primary accent color, replacing all indigo/purple (#6366f1) and gradient (#6366f1 → #a855f7) references
3. THE Design_System SHALL use Dark_Palette backgrounds: base background (#0d0d0d), card background (rgba(255,255,255,0.04)), sidebar background (#111111), and elevated surface (#1a1a1a)
4. THE Design_System SHALL define a Gold_Border token (#D4A843) for featured card highlights
5. THE Design_System SHALL define text colors: primary text (#F5F5F5), muted text (#8A8A8A), and link hover text (#FFFFFF)
6. THE Design_System SHALL define status colors: success (#34D399), error (#F87171), and warning (#FBBF24)
7. WHEN the Design_System file is imported, THE Landing_Page, Login_Page, and Dashboard SHALL each inherit all shared tokens without duplicating variable declarations

### Requirement 2: Landing Page Redesign

**User Story:** As a visitor, I want the marketing site to feel editorial and confident, so that the platform appears professional and distinct from generic SaaS templates.

#### Acceptance Criteria

1. THE Landing_Page SHALL use the Coral_Accent for all primary call-to-action buttons instead of gradient backgrounds
2. THE Landing_Page SHALL display CTA buttons with fully rounded corners (border-radius 999px) and solid Coral_Accent background
3. THE Landing_Page navbar SHALL display the OpenCawl logo on the left and "FAQ" link, "Log In" link, and a Coral_Accent "Get Started" button on the right
4. THE Landing_Page hero section SHALL use white text on Dark_Palette background without gradient text effects
5. THE Landing_Page SHALL include a Conversation_Mockup section that shows a stylized phone conversation UI illustrating the product in action
6. THE Landing_Page SHALL include alternating content sections (text left / mockup right, then reversed) to create an editorial rhythm
7. THE Landing_Page SHALL include a FAQ_Accordion section where each question is clickable and reveals its answer with a smooth expand/collapse animation
8. THE Landing_Page footer SHALL display "© 2026 OpenCawl" copyright, a GitHub link, a Docs link, and the tagline "Open source voice interface for AI agents"
9. THE Landing_Page feature cards SHALL use Dark_Palette card backgrounds with subtle borders and Coral_Accent hover highlights instead of gradient hover effects

### Requirement 3: Meta Tags and Branding

**User Story:** As a stakeholder, I want proper meta tags and branding across all pages, so that social shares and search results display correct OpenCawl branding.

#### Acceptance Criteria

1. THE Landing_Page, Login_Page, and Dashboard HTML files SHALL include an Open Graph title tag with format "OpenCawl - [page description]"
2. THE Landing_Page, Login_Page, and Dashboard HTML files SHALL include an Open Graph image tag pointing to "https://images.opencawl.ai/logo/opencawl-logo.png"
3. THE Landing_Page, Login_Page, and Dashboard HTML files SHALL include an Open Graph type tag set to "website"
4. THE Landing_Page, Login_Page, and Dashboard HTML files SHALL include a Twitter card meta tag set to "summary_large_image"
5. THE Landing_Page SHALL use the title "OpenCawl - Give your agent a phone number"
6. THE Landing_Page, Login_Page, and Dashboard HTML files SHALL include a theme-color meta tag set to "#0d0d0d"
7. THE Landing_Page, Login_Page, and Dashboard HTML files SHALL reference the OpenCawl favicon at "https://images.opencawl.ai/logo/opencawl-logo.png"

### Requirement 4: Dashboard Layout Overhaul

**User Story:** As a user, I want the dashboard to feel spacious and well-organized, so that I can navigate and consume information without feeling cramped.

#### Acceptance Criteria

1. THE Dashboard main content area SHALL use increased padding (40px on desktop, 24px on mobile) to eliminate the "smooshed" layout
2. THE Dashboard page titles SHALL use a font size of at least 1.75rem with 32px bottom margin for clear visual hierarchy
3. THE Dashboard card components SHALL use 24px internal padding and 20px gap between cards
4. THE Dashboard home page SHALL display Status_Cards in a responsive grid: credits balance, phone number, active voice, and daily call count
5. WHEN the viewport width is 768px or less, THE Dashboard Status_Card grid SHALL stack to a single column layout
6. THE Dashboard Status_Cards SHALL use Dark_Palette card backgrounds with 1px solid border in a subtle dark tone (#1e1e2e) and 12px border radius

### Requirement 5: Dashboard Sidebar Redesign

**User Story:** As a user, I want a clean, branded sidebar, so that navigation feels polished and on-brand.

#### Acceptance Criteria

1. THE Sidebar SHALL display the OpenCawl logo icon in the header area with Coral_Accent color
2. THE Sidebar active navigation item SHALL use a Coral_Accent left border indicator (3px wide) and Coral_Accent text color
3. THE Sidebar inactive navigation items SHALL use muted text color (#8A8A8A) and transition to primary text color on hover
4. THE Sidebar logo text SHALL use Coral_Accent color instead of gradient text fill
5. THE Sidebar background SHALL use the Design_System sidebar background token (#111111)
6. THE Sidebar SHALL maintain the existing responsive behavior: fixed on desktop, slide-out drawer on mobile with overlay backdrop

### Requirement 6: Login Page Redesign

**User Story:** As a user, I want the login page to match the new design language, so that the transition from marketing site to authentication feels seamless.

#### Acceptance Criteria

1. THE Login_Page SHALL use Dark_Palette background and Design_System tokens for all colors
2. THE Login_Page logo SHALL display in Coral_Accent color instead of gradient text
3. THE Login_Page primary button SHALL use solid Coral_Accent background with fully rounded corners (border-radius 999px) matching Landing_Page CTA style
4. THE Login_Page form input focus state SHALL use Coral_Accent border color
5. THE Login_Page card SHALL use Dark_Palette card background with subtle border matching the Design_System

### Requirement 7: Typography and Spacing Consistency

**User Story:** As a user, I want consistent typography and spacing across all pages, so that the platform feels cohesive.

#### Acceptance Criteria

1. THE Design_System SHALL define a font stack of "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" used across all surfaces
2. THE Design_System SHALL define a type scale: xs (0.75rem), sm (0.85rem), base (1rem), lg (1.15rem), xl (1.5rem), 2xl (2rem), 3xl (3rem)
3. THE Design_System SHALL define a spacing scale: 4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px, 64px
4. THE Landing_Page, Login_Page, and Dashboard SHALL reference the Design_System type scale for all font sizes instead of ad-hoc values

### Requirement 8: Interactive Component Styling

**User Story:** As a user, I want interactive elements to provide clear visual feedback, so that I can confidently navigate and interact with the platform.

#### Acceptance Criteria

1. WHEN a user hovers over a primary button, THE button SHALL reduce opacity to 0.9 and shift upward by 1px
2. WHEN a user hovers over a Dashboard card, THE card border color SHALL transition to Coral_Accent over 150ms
3. WHEN a user hovers over a Sidebar navigation link, THE link text color SHALL transition from muted to primary text color over 200ms
4. THE FAQ_Accordion items SHALL use a smooth height transition (250ms ease) when expanding or collapsing
5. WHEN a featured pricing card is displayed, THE card SHALL use Gold_Border color for its border and a subtle glow shadow

### Requirement 9: Dashboard Featured Card Styling

**User Story:** As a user, I want featured or promoted cards to stand out visually, so that I can quickly identify important items or recommended plans.

#### Acceptance Criteria

1. THE Dashboard billing page featured plan card SHALL use Gold_Border (#D4A843) for its border color
2. THE Dashboard billing page featured plan card SHALL display a subtle glow shadow using Gold_Border color at low opacity
3. THE Dashboard billing page non-featured plan cards SHALL use standard Dark_Palette card styling with default border color
4. WHEN the user views the pricing section on the Landing_Page, THE featured pricing card SHALL use Gold_Border styling consistent with the Dashboard featured plan card
