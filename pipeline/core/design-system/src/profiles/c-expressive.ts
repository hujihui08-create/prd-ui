import type { Profile } from "@prd-ui/contracts";

export const cExpressiveProfile: Profile = {
  meta: { name: "c-expressive", library: "c-expressive", version: "0.1.0", origin: "baseline" },
  color: {
    "surface.default": "#FFFFFF",
    "surface.subtle": "#FFF1E6",
    "surface.raised": "#FFFFFF",
    "text.primary": "#1F2937",
    "text.secondary": "#6B7280",
    "text.onAction": "#FFFFFF",
    "action.primary": "#FF5A5F",
    "action.secondary": "#FFF1E6",
    "status.success": "#16A34A",
    "status.warning": "#D97706",
    "status.danger": "#DC2626",
    "border.subtle": "#FDE2D2",
  },
  space: { "1": "4px", "2": "8px", "3": "12px", "4": "16px", "6": "24px", "8": "32px", "12": "48px" },
  radius: { sm: "8px", md: "16px", lg: "24px", full: "9999px" },
  motion: { fast: "140ms", normal: "220ms", slow: "360ms" },
  breakpoints: { sm: "390px", md: "768px", lg: "1024px", xl: "1280px" },
  typography: {
    "heading.1": { fontFamily: "Noto Sans SC", fontSize: 28, fontWeight: 700, lineHeight: 36 },
    "heading.2": { fontFamily: "Noto Sans SC", fontSize: 22, fontWeight: 600, lineHeight: 30 },
    "heading.3": { fontFamily: "Noto Sans SC", fontSize: 18, fontWeight: 600, lineHeight: 26 },
    "body.md": { fontFamily: "Noto Sans SC", fontSize: 15, fontWeight: 400, lineHeight: 24 },
    "body.sm": { fontFamily: "Noto Sans SC", fontSize: 13, fontWeight: 400, lineHeight: 20 },
    "label.sm": { fontFamily: "Noto Sans SC", fontSize: 12, fontWeight: 500, lineHeight: 16 },
  },
};
