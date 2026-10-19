import type { Profile } from "@prd-ui/contracts";

export const bDenseProfile: Profile = {
  meta: { name: "b-dense", library: "b-dense", version: "0.1.0", origin: "baseline" },
  color: {
    "surface.default": "#FFFFFF",
    "surface.subtle": "#F3F4F6",
    "surface.raised": "#FFFFFF",
    "text.primary": "#111827",
    "text.secondary": "#6B7280",
    "text.onAction": "#FFFFFF",
    "action.primary": "#030213",
    "action.secondary": "#F3F4F6",
    "status.success": "#16A34A",
    "status.warning": "#D97706",
    "status.danger": "#DC2626",
    "border.subtle": "#E5E7EB",
  },
  space: { "1": "4px", "2": "8px", "3": "12px", "4": "16px", "6": "24px", "8": "32px", "12": "48px" },
  radius: { sm: "4px", md: "8px", lg: "12px", full: "9999px" },
  motion: { fast: "120ms", normal: "200ms", slow: "320ms" },
  breakpoints: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" },
  typography: {
    "heading.1": { fontFamily: "Noto Sans SC", fontSize: 32, fontWeight: 700, lineHeight: 40 },
    "heading.2": { fontFamily: "Noto Sans SC", fontSize: 24, fontWeight: 600, lineHeight: 32 },
    "heading.3": { fontFamily: "Noto Sans SC", fontSize: 18, fontWeight: 600, lineHeight: 26 },
    "body.md": { fontFamily: "Noto Sans SC", fontSize: 14, fontWeight: 400, lineHeight: 20 },
    "body.sm": { fontFamily: "Noto Sans SC", fontSize: 13, fontWeight: 400, lineHeight: 18 },
    "label.sm": { fontFamily: "Noto Sans SC", fontSize: 12, fontWeight: 500, lineHeight: 16 },
  },
};
