import type { CSSProperties } from "react";
import bSpec from "../../spec/page-spec.b-end.json";
import cSpec from "../../spec/page-spec.c-end.json";
import bProfile from "../../spec/profile.b-dense.json";
import cProfile from "../../spec/profile.c-expressive.json";
import type { Profile } from "../../plan/types";
import { renderSpec } from "./components";

const pages = {
  b: { spec: bSpec, profile: bProfile },
  c: { spec: cSpec, profile: cProfile },
};

const typeTokens = ["heading.1", "heading.2", "heading.3", "body.md", "label.sm"] as const;
type TypeToken = (typeof typeTokens)[number];

const typeNames: Record<TypeToken, string> = {
  "heading.1": "heading-1",
  "heading.2": "heading-2",
  "heading.3": "heading-3",
  "body.md": "body-md",
  "label.sm": "label-sm",
};

function typographyVars(profile: Profile): CSSProperties {
  const vars: Record<string, string> = {};
  for (const token of typeTokens) {
    const style = profile.typography[token];
    const name = typeNames[token];
    vars[`--${name}-size`] = `${style.fontSize}px`;
    vars[`--${name}-line-height`] = `${style.lineHeight}px`;
    vars[`--${name}-weight`] = `${style.fontWeight}`;
    vars[`--${name}-family`] = style.fontFamily;
  }
  return vars as CSSProperties;
}

export default function App() {
  const key = new URLSearchParams(window.location.search).get("page") === "c" ? "c" : "b";
  const { spec, profile } = pages[key];
  return (
    <div data-profile={profile.name} style={typographyVars(profile as Profile)}>
      {renderSpec(spec.layout)}
    </div>
  );
}
