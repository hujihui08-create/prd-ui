import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileJson,
  Layers,
  LayoutGrid,
  RefreshCw,
  Route,
  ShieldCheck,
} from "lucide-react";
import type { StudioData, StudioFinding, StudioPage } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TABS = [
  ["spec", "Spec"],
  ["catalog", "Catalog"],
  ["profile", "Profile"],
  ["findings", "Findings"],
  ["assets", "Assets"],
  ["trace", "Trace"],
] as const;

function severityVariant(severity: string): "destructive" | "warning" | "secondary" {
  if (severity === "blocker") return "destructive";
  if (severity === "major") return "warning";
  return "secondary";
}

function archetypeIcon(archetype: string) {
  if (archetype.includes("list")) return Layers;
  if (archetype.includes("form")) return FileJson;
  if (archetype.includes("detail")) return Route;
  return LayoutGrid;
}

function FindingRow({ finding }: { finding: StudioFinding }) {
  return (
    <div className="border-b border-border py-3 last:border-0">
      <div className="flex items-center gap-2">
        <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
        <span className="text-[12px] text-muted-foreground">
          {finding.pageId ?? "project"} {finding.state ? `· ${finding.state}` : ""}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-[20px]">{finding.message}</p>
      {finding.evidence ? (
        <p className="mt-1 text-[12px] leading-[18px] text-muted-foreground">{finding.evidence}</p>
      ) : null}
    </div>
  );
}

function PageTree({
  pages,
  activeId,
  onSelect,
}: {
  pages: StudioPage[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollArea className="h-full px-2 py-3">
      <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Pages · {pages.length}
      </div>
      <div className="flex flex-col gap-0.5">
        {pages.map((page) => {
          const Icon = archetypeIcon(page.archetype);
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => onSelect(page.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                page.id === activeId ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{page.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {page.route}
                </span>
              </span>
              <ChevronRight className="size-3.5 shrink-0 opacity-50" />
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function Inspector({ data, page }: { data: StudioData; page: StudioPage }) {
  const [tab, setTab] = useState("spec");
  const findings = [...data.findings.visual, ...data.findings.deterministic];
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
      <div className="p-3">
        <TabsList className="w-full justify-between overflow-x-auto">
          {TABS.map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
        <TabsContent value="spec">
          <Card>
            <CardHeader>
              <CardTitle>{page.name}</CardTitle>
              <p className="text-[12px] text-muted-foreground">{page.id} · {page.target} · {page.profile}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <span className="text-muted-foreground">archetype</span>
                <span>{page.archetype}</span>
                <span className="text-muted-foreground">route</span>
                <span className="truncate">{page.route}</span>
                <span className="text-muted-foreground">nodes</span>
                <span>{page.nodeCount}</span>
                <span className="text-muted-foreground">interactions</span>
                <span>{page.interactions}</span>
              </div>
              <Separator />
              <div className="flex flex-wrap gap-1">
                {page.states.map((state) => (
                  <Badge key={state} variant="outline">{state}</Badge>
                ))}
              </div>
              {page.views.length > 0 ? (
                <p className="text-[12px] text-muted-foreground">views: {page.views.join(" / ")}</p>
              ) : null}
              {page.formModes.length > 0 ? (
                <p className="text-[12px] text-muted-foreground">modes: {page.formModes.join(" / ")}</p>
              ) : null}
              {page.businessStates.length > 0 ? (
                <p className="text-[12px] text-muted-foreground">business: {page.businessStates.join(" / ")}</p>
              ) : null}
              <Separator />
              <p className="text-[12px] text-muted-foreground">roles: {page.roles.join(" / ") || "—"}</p>
              <p className="text-[12px] text-muted-foreground">reqRefs: {page.reqRefs.join(" / ") || "—"}</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="catalog">
          <div className="text-[12px] font-medium text-muted-foreground">{data.catalog.library}</div>
          <div className="mt-2 space-y-1">
            {data.catalog.components.map((component) => (
              <div key={component.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
                <span className="text-[13px]">{component.id}</span>
                <Badge variant={component.availability === "available" ? "success" : "secondary"}>
                  {component.availability}
                </Badge>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="profile">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.profile.color).map(([name, value]) => (
              <div key={name} className="rounded-md border border-border p-2">
                <div className="h-6 rounded-sm border border-border" style={{ background: value }} />
                <div className="mt-1 truncate text-[11px]">{name}</div>
                <div className="text-[11px] text-muted-foreground">{value}</div>
              </div>
            ))}
          </div>
          <Separator className="my-3" />
          <div className="space-y-1 text-[12px]">
            {Object.entries(data.profile.typography).map(([name, style]) => (
              <div key={name} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{name}</span>
                <span>{style.fontSize}/{style.lineHeight} · {style.fontWeight}</span>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="findings">
          {findings.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
              <ShieldCheck className="size-4" /> No findings
            </div>
          ) : (
            findings.map((finding, index) => (
              <FindingRow key={finding.id ?? `${finding.pageId}-${index}`} finding={finding} />
            ))
          )}
        </TabsContent>
        <TabsContent value="assets">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">Asset package</span>
            <Badge variant={data.assets.complete ? "success" : "warning"}>
              {data.assets.complete ? "complete" : "incomplete"}
            </Badge>
          </div>
          <div className="mt-2 space-y-1">
            {data.assets.assets.map((asset) => (
              <div key={asset.id} className="rounded-md border border-border px-2 py-1.5">
                <div className="text-[13px]">{asset.id}</div>
                <div className="text-[11px] text-muted-foreground">{asset.kind} · {asset.license}</div>
              </div>
            ))}
            {data.assets.assets.length === 0 ? (
              <p className="py-4 text-[12px] text-muted-foreground">No assets in this run.</p>
            ) : null}
          </div>
          {data.assets.placeholders.length > 0 ? (
            <p className="mt-2 text-[12px] text-warning">placeholders: {data.assets.placeholders.join(", ")}</p>
          ) : null}
        </TabsContent>
        <TabsContent value="trace">
          <div className="space-y-2 text-[12px]">
            <div className="flex justify-between"><span className="text-muted-foreground">project</span><span>{data.project}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">run</span><span className="truncate">{data.runId}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">generated</span><span>{data.generatedAt}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">signoffs</span><span>{data.signoffs.join(" / ") || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">figma</span><Badge variant={data.figma.status === "passed" ? "success" : "secondary"}>{data.figma.status}</Badge></div>
            {data.figma.planDir ? <p className="break-all text-muted-foreground">plan: {data.figma.planDir}</p> : null}
          </div>
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}

export function App() {
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageId, setPageId] = useState("");
  const [state, setState] = useState("default");
  const [view, setView] = useState("");
  const [mode, setMode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("./studio-data.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(`studio-data.json ${response.status}`);
        return (await response.json()) as StudioData;
      })
      .then((value) => {
        setData(value);
        setPageId(value.pages[0]?.id ?? "");
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  const page = useMemo(
    () => data?.pages.find((candidate) => candidate.id === pageId),
    [data, pageId]
  );

  useEffect(() => {
    if (!page) return;
    setState("default");
    setView(page.defaultView ?? page.views[0] ?? "");
    setMode(page.formModes[0] ?? "");
  }, [page?.id]);

  const iframeSrc = useMemo(() => {
    if (!page) return "";
    const params = new URLSearchParams();
    if (state !== "" && state !== "default") params.set("state", state);
    if (view !== "") params.set("view", view);
    if (mode !== "") params.set("mode", mode);
    const query = params.toString();
    return `./${page.html}${query === "" ? "" : `?${query}`}`;
  }, [page, state, view, mode]);

  const copyFigma = async () => {
    await navigator.clipboard.writeText(
      "pnpm figma:plan --spec-run <spec-run> --out /tmp/figma-v06"
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  if (error !== null) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-8">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4" /> Studio data missing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px] text-muted-foreground">
            <p>{error}</p>
            <p>先运行 <code>pnpm studio:prepare --spec-run ... --html ... --out studio/public</code>。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        Loading studio data…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="size-4" />
          <span className="text-[14px] font-semibold">PRD UI Studio</span>
          <Badge variant="secondary">{data.project}</Badge>
          <span className="text-[11px] text-muted-foreground">{data.runId}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data.figma.status === "passed" ? "success" : "secondary"}>
            Figma {data.figma.status}
          </Badge>
          <Tooltip label="Copy figma:plan command">
            <Button variant="ghost" size="sm" onClick={() => void copyFigma()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              Figma plan
            </Button>
          </Tooltip>
          {page ? (
            <Button variant="outline" size="sm" onClick={() => window.open(`./${page.html}`, "_blank")}>
              <ExternalLink className="size-4" /> Open HTML
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_360px]">
        <aside className="min-h-0 border-r border-border">
          <PageTree pages={data.pages} activeId={pageId} onSelect={setPageId} />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-muted/30">
          {page ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
                <Badge variant="outline">{page.archetype}</Badge>
                <span className="text-[12px] text-muted-foreground">{page.route}</span>
                <div className="ml-auto flex items-center gap-2">
                  {page.states.length > 0 ? (
                    <Select value={state} onChange={(event) => setState(event.target.value)} aria-label="State">
                      {page.states.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </Select>
                  ) : null}
                  {page.views.length > 0 ? (
                    <div className="flex rounded-md border border-border bg-background p-0.5">
                      {page.views.map((option) => (
                        <Button
                          key={option}
                          variant={view === option ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setView(option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {page.formModes.length > 0 ? (
                    <div className="flex rounded-md border border-border bg-background p-0.5">
                      {page.formModes.map((option) => (
                        <Button
                          key={option}
                          variant={mode === option ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setMode(option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
                <iframe
                  key={iframeSrc}
                  title={`${page.name} preview`}
                  src={iframeSrc}
                  className="h-[844px] w-[390px] shrink-0 rounded-lg border border-border bg-white shadow-sm"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">Select a page</div>
          )}
        </main>

        <aside className="min-h-0 border-l border-border bg-background">
          {page ? <Inspector data={data} page={page} /> : null}
        </aside>
      </div>
    </div>
  );
}
