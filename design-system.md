# Tipi UI / UX

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Applied UI UX Pro Max's Soft UI Evolution guidance, accessibility priorities,
touch interaction rules, chart alternatives and responsive spacing to the
existing HTML/CSS/JavaScript app. The first generated storytelling design was
not relevant to an internal planner; the narrower appointment-booking query
returned the suitable soft UI style. Marketing funnels and its blue palette
were not adopted. Tipi keeps its existing pastel pink identity and font pairing.

## Decisions

- Surfaces: warm white, blush and cream; restrained borders and shadows.
- Primary action: dark rose #943d5c on white for readable buttons.
- Text: #392b32 primary, #71616a secondary.
- Typography: Playfair Display headings, DM Sans controls and tabular figures.
- Controls: 44px minimum common actions, 48px inputs, 16px input text.
- Charts: anchored SVG sizing, readable axes, expandable data table.
- Calendar: service labels in addition to colors, keyboard-scrollable region,
  full labels on cards, day view available for small screens.
- Forms: required indicators, inline native-validation feedback, visible focus.
- Mobile: safe-area bottom navigation, dismissible drawer, scrollable dialogs.
- Motion: subtle state feedback; disabled under prefers-reduced-motion.

## Verification

Run existing DOM regression checks and UI-specific checks for navigation,
validation, chart table, icons and preserved data flows. DOM simulation does
not verify rendered layout; browser screenshots remain a separate check.
