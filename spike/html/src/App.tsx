import bSpec from "../../spec/page-spec.b-end.json";
import cSpec from "../../spec/page-spec.c-end.json";
import bProfile from "../../spec/profile.b-dense.json";
import cProfile from "../../spec/profile.c-expressive.json";
import { renderSpec } from "./components";

const pages = {
  b: { spec: bSpec, profile: bProfile },
  c: { spec: cSpec, profile: cProfile },
};

export default function App() {
  const key = new URLSearchParams(window.location.search).get("page") === "c" ? "c" : "b";
  const { spec, profile } = pages[key];
  return <div data-profile={profile.name}>{renderSpec(spec.layout)}</div>;
}
