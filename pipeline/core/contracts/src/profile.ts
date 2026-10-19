import { z } from "zod";

export interface TextStyleDef {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
}

export interface Profile {
  meta: { name: string; library: string; version: string; origin: "baseline" | "imported" | "hybrid" };
  color: Record<string, string>;
  space: Record<string, string>;
  radius: Record<string, string>;
  motion: Record<string, string>;
  breakpoints: Record<string, string>;
  typography: Record<string, TextStyleDef>;
}

export const ProfileSchema = z
  .object({
    meta: z
      .object({
        name: z.string().min(1),
        library: z.string().min(1),
        version: z.string().min(1),
        origin: z.enum(["baseline", "imported", "hybrid"]),
      })
      .strict(),
    color: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
    space: z.record(z.string(), z.string().regex(/^\d+px$/)),
    radius: z.record(z.string(), z.string().regex(/^\d+px$/)),
    motion: z.record(z.string(), z.string().min(1)),
    breakpoints: z.record(z.string(), z.string().regex(/^\d+px$/)),
    typography: z.record(
      z.string(),
      z
        .object({
          fontFamily: z.string().min(1),
          fontSize: z.number().int().positive(),
          fontWeight: z.number().int().min(100).max(900),
          lineHeight: z.number().int().positive(),
        })
        .strict()
    ),
  })
  .strict();
