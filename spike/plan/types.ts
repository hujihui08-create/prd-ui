export type Target = "web" | "mobile";

export interface SpecNode {
  type: string;
  props?: Record<string, unknown>;
  children?: SpecNode[];
}

export interface PageSpec {
  meta: {
    pageId: string;
    name: string;
    target: Target;
    profile: string;
    archetype: string;
  };
  layout: SpecNode;
}

export interface TextStyleDef {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
}

export interface Profile {
  name: string;
  color: Record<string, string>;
  space: Record<string, string>;
  radius: Record<string, string>;
  typography: Record<string, TextStyleDef>;
  components: Record<string, { variants: Record<string, { fill: string; text: string }> }>;
}

export type PlanNode =
  | {
      type: "FRAME";
      name: string;
      layout: "VERTICAL" | "HORIZONTAL";
      children: PlanNode[];
      width?: number;
      height?: number;
      padding?: number;
      gap?: number;
      fill?: string;
      layoutGrow?: number;
      layoutAlign?: "STRETCH";
    }
  | {
      type: "TEXT";
      name: string;
      characters: string;
      textStyle: string;
    }
  | {
      type: "INSTANCE";
      name: string;
      component: string;
      variant?: string;
      props?: Record<string, string>;
    }
  | {
      type: "ICON";
      name: string;
      svg: string;
      size: number;
    }
  | {
      type: "IMAGE";
      name: string;
      src: string;
      width: number;
      height: number;
    };

export interface FigmaPlan {
  page: string;
  width: number;
  height: number;
  tokens: Record<string, string>;
  textStyles: Record<string, TextStyleDef>;
  components: Profile["components"];
  root: PlanNode;
}
