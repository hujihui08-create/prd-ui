import type { Profile } from "@prd-ui/contracts";

/**
 * Mobile B-end baseline for the employee mini-program.
 *
 * Typography, spacing, control heights, and radii come from the employee PRD
 * (§0.9). Colors are a neutral B-end baseline until the real brand palette is
 * supplied; buttons are black with white text, matching the PRD.
 */
export const bMobileProfile: Profile = {
  meta: { name: "b-mobile", library: "b-mobile", version: "0.1.0", origin: "baseline" },
  color: {
    "surface.default": "#FFFFFF",
    "surface.subtle": "#F5F6F8",
    "surface.raised": "#FFFFFF",
    "text.primary": "#111827",
    "text.secondary": "#4B5563",
    "text.tertiary": "#5B6472",
    "text.onAction": "#FFFFFF",
    "action.primary": "#111827",
    "action.secondary": "#F3F4F6",
    "accent.customer": "#2563EB",
    "accent.inventory": "#F97316",
    "status.success": "#166534",
    "status.warning": "#92400E",
    "status.danger": "#991B1B",
    "status.info": "#1D4ED8",
    "border.subtle": "#E5E7EB",
    "border.strong": "#D1D5DB",
  },
  space: {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "6": "24px",
    "8": "32px",
  },
  radius: { sm: "4px", md: "6px", lg: "12px", full: "9999px" },
  motion: { fast: "120ms", normal: "200ms", slow: "320ms" },
  breakpoints: { sm: "375px", md: "390px", lg: "430px" },
  typography: {
    "heading.1": { fontFamily: "Noto Sans SC", fontSize: 24, fontWeight: 600, lineHeight: 32 },
    "heading.2": { fontFamily: "Noto Sans SC", fontSize: 16, fontWeight: 600, lineHeight: 24 },
    "heading.3": { fontFamily: "Noto Sans SC", fontSize: 15, fontWeight: 600, lineHeight: 22 },
    "body.md": { fontFamily: "Noto Sans SC", fontSize: 13, fontWeight: 500, lineHeight: 18 },
    "body.sm": { fontFamily: "Noto Sans SC", fontSize: 13, fontWeight: 400, lineHeight: 18 },
    "label.sm": { fontFamily: "Noto Sans SC", fontSize: 12, fontWeight: 400, lineHeight: 16 },
    "label.strong": { fontFamily: "Noto Sans SC", fontSize: 12, fontWeight: 500, lineHeight: 16 },
  },
};
