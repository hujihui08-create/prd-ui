export interface SizingInput {
  layout: "VERTICAL" | "HORIZONTAL";
  width?: number;
  height?: number;
  layoutGrow?: number;
  layoutAlign?: "STRETCH";
  parentLayout?: "VERTICAL" | "HORIZONTAL";
}

export interface SizingResult {
  primary: "FIXED" | "AUTO";
  counter: "FIXED" | "AUTO";
}

export function resolveSizingModes(input: SizingInput): SizingResult {
  const hasWidth = input.width != null;
  const hasHeight = input.height != null;
  let primary: "FIXED" | "AUTO";
  let counter: "FIXED" | "AUTO";

  if (hasWidth && hasHeight) {
    primary = "FIXED";
    counter = "FIXED";
  } else if (hasWidth) {
    if (input.layout === "HORIZONTAL") {
      primary = "FIXED";
      counter = "AUTO";
    } else {
      primary = "AUTO";
      counter = "FIXED";
    }
  } else if (hasHeight) {
    if (input.layout === "HORIZONTAL") {
      primary = "AUTO";
      counter = "FIXED";
    } else {
      primary = "FIXED";
      counter = "AUTO";
    }
  } else {
    primary = "AUTO";
    counter = "AUTO";
  }

  if (input.parentLayout) {
    const parentHorizontal = input.parentLayout === "HORIZONTAL";
    const childHorizontal = input.layout === "HORIZONTAL";

    // layoutGrow stretches along the parent's primary axis.
    if (input.layoutGrow === 1) {
      const growAffectsChildPrimary = parentHorizontal === childHorizontal;
      if (growAffectsChildPrimary) primary = "FIXED";
      else counter = "FIXED";
    }

    // layoutAlign STRETCH stretches along the parent's counter axis.
    if (input.layoutAlign === "STRETCH") {
      const stretchAffectsChildPrimary = parentHorizontal !== childHorizontal;
      if (stretchAffectsChildPrimary) primary = "FIXED";
      else counter = "FIXED";
    }
  }

  return { primary, counter };
}
