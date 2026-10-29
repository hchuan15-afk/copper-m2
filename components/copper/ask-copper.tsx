"use client";

// Module 2: Ask Copper, the floating chat panel. It sends each question to
// askCopper (a Server Action) and draws the answer as it streams in: the tools
// Copper can use, what it was thinking, each tool call (what it sent and what
// came back), and then the reply. Tools on and tools off are separate chats.
import {
  ArrowUpIcon,
  BrainIcon,
  ListIcon,
  TriangleAlertIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { SetupRequired } from "@/components/setup-required";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import {
  TOOL_LABELS,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import { formatUsd, getPlans, getProducts } from "@/lib/copper/catalog";
import { cn } from "@/lib/utils";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

const TOOL_NAMES = Object.keys(TOOL_LABELS);

/** One question and its answer, as it streams in (null until it starts). */
type Turn = { question: string; progress: Progress | null };
type Mode = "on" | "off";

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Record<Mode, Turn[]>>({ on: [], off: [] });
  const [busy, setBusy] = useState<Record<Mode, boolean>>({
    on: false,
    off: false,
  });
  const [draft, setDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const mode: Mode = useTools ? "on" : "off";
  const turns = chats[mode];

  // Opens at /#ask, on a later #ask, and on any click of an #ask link (once
  // the address already ends in #ask, clicking again fires no hashchange).
  useEffect(() => {
    const openAtHash = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const openOnClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a");
      if (link?.getAttribute("href")?.endsWith("#ask")) setOpen(true);
    };
    openAtHash();
    window.addEventListener("hashchange", openAtHash);
    document.addEventListener("click", openOnClick);
    return () => {
      window.removeEventListener("hashchange", openAtHash);
      document.removeEventListener("click", openOnClick);
    };
  }, []);

  // Keep the newest step in view as the answer streams in.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [turns, open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy[mode]) return;
    const chat = mode;
    const history = chats[chat];
    // Only the questions and finished replies are sent, never the steps.
    const messages: ChatMessage[] = [
      ...history.flatMap((turn): ChatMessage[] => [
        { role: "user", content: turn.question },
        ...(turn.progress?.reply
          ? [{ role: "assistant" as const, content: turn.progress.reply }]
          : []),
      ]),
      { role: "user", content: question },
    ];
    const index = history.length;
    const setProgress = (progress: Progress) =>
      setChats((all) => ({
        ...all,
        [chat]: all[chat].map((turn, i) =>
          i === index ? { ...turn, progress } : turn,
        ),
      }));

    setDraft("");
    setChats((all) => ({
      ...all,
      [chat]: [...all[chat], { question, progress: null }],
    }));
    setBusy((all) => ({ ...all, [chat]: true }));
    try {
      const { progress } = await askCopper({
        messages,
        useTools: chat === "on",
      });
      for await (const update of readLive(progress)) setProgress(update);
    } catch {
      setProgress({
        steps: [],
        reply: "Sorry, I couldn't reach Copper just now. Please try again.",
        status: "error",
      });
    } finally {
      setBusy((all) => ({ ...all, [chat]: false }));
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full py-2 pr-5 pl-2 font-semibold shadow-lg transition-colors outline-none focus-visible:ring-3"
      >
        <span className="bg-background/90 flex size-9 items-center justify-center overflow-hidden rounded-full">
          <Image
            src="/assets/brand/copper-mascot.png"
            alt=""
            width={36}
            height={36}
            className="size-8 object-contain"
          />
        </span>
        Ask Copper
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          data-testid="ask-copper"
          className="w-full! gap-0 p-0 sm:max-w-md!"
        >
          <header className="bg-[#1c2333] text-[#efe3d0]">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <span className="bg-primary flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full">
                <Image
                  src="/assets/brand/copper-mascot.png"
                  alt="Copper the robot mascot"
                  width={44}
                  height={44}
                  className="size-10 object-contain"
                />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="font-heading text-lg font-bold text-[#efe3d0]">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-sm text-[#efe3d0]/75">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose className="rounded-md p-1.5 text-[#efe3d0]/80 transition-colors hover:bg-white/10 hover:text-[#efe3d0]">
                <XIcon className="size-5" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </div>
            {aiConfigured && (
              <div className="flex items-center justify-between gap-3 bg-white/10 px-4 py-2">
                <div>
                  <p className="text-sm font-semibold">Use tools</p>
                  <p className="text-xs text-[#efe3d0]/70">
                    {useTools ? "Checks every answer" : "Model guesses alone"}
                  </p>
                </div>
                <Switch
                  aria-label="Use tools"
                  checked={useTools}
                  onCheckedChange={setUseTools}
                  className="data-unchecked:bg-white/30"
                />
              </div>
            )}
          </header>

          {aiConfigured ? (
            <>
              <div
                ref={bodyRef}
                className="bg-secondary flex-1 space-y-6 overflow-y-auto px-4 py-5"
              >
                {turns.length === 0 ? (
                  <EmptyChat useTools={useTools} onAsk={send} />
                ) : (
                  <>
                    {turns.map((turn, i) => (
                      <Answer key={i} turn={turn} useTools={useTools} />
                    ))}
                    {!busy[mode] && <Starters onAsk={send} />}
                  </>
                )}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
                className="bg-background flex items-center gap-2 border-t px-4 py-3"
              >
                <Input
                  aria-label="Your question"
                  placeholder="Ask about prices, totals or stock…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="h-10 rounded-full px-4"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={busy[mode] || !draft.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
                >
                  <ArrowUpIcon className="size-5" />
                </button>
              </form>
            </>
          ) : (
            <div className="bg-secondary flex-1 overflow-y-auto px-4">
              <SetupRequired service="ai" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function EmptyChat({
  useTools,
  onAsk,
}: {
  useTools: boolean;
  onAsk: (question: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-heading text-foreground text-lg font-bold">
          Hi, I&apos;m Copper.
        </p>
        <p className="text-muted-foreground text-sm">
          {useTools
            ? "Ask me what things cost or what's in stock. I'll check with my tools and show you how."
            : "Tools are off, so I'll answer from memory alone. Try a question and compare."}
        </p>
      </div>
      <div className="space-y-2">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onAsk(starter)}
            className="bg-card text-foreground hover:border-primary w-full rounded-xl border px-4 py-3 text-left text-sm font-medium shadow-xs transition-colors"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

function Starters({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="space-y-2 pt-2">
      <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
        Try another
      </p>
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onAsk(starter)}
            className="bg-card text-foreground hover:border-primary rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One answer: the question, the stations on the rail, then the reply
// ---------------------------------------------------------------------------

function Answer({ turn, useTools }: { turn: Turn; useTools: boolean }) {
  const progress = turn.progress ?? { steps: [], reply: "", status: "working" };
  const working = progress.status === "working";
  const used = new Set(
    progress.steps.filter((s) => s.type === "tool").map((s) => s.name),
  );
  let toolCount = 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-sm font-medium">
          {turn.question}
        </p>
      </div>

      <div className="relative space-y-4">
        <div
          aria-hidden
          className={cn(
            "absolute top-3 bottom-3 left-[15px] w-0.5 rounded-full",
            useTools
              ? "from-primary via-accent to-accent bg-linear-to-b"
              : "bg-chart-3",
          )}
        />

        <Station
          node={<ListIcon className="size-4" />}
          nodeClass={useTools ? "bg-foreground/70" : "bg-chart-3"}
          label={useTools ? "Tools Copper can use" : "Tools given to Copper: none"}
        >
          <div className="flex flex-wrap gap-1.5">
            {TOOL_NAMES.map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-xs",
                  !useTools
                    ? "bg-muted text-muted-foreground line-through"
                    : used.has(name)
                      ? "bg-accent font-bold text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!useTools && (
            <p className="text-muted-foreground mt-1.5 text-xs">
              Copper has to answer from memory alone.
            </p>
          )}
        </Station>

        {progress.steps.map((step, i) =>
          step.type === "thinking" ? (
            <Station
              key={i}
              node={<BrainIcon className="size-4" />}
              nodeClass={useTools ? "bg-primary" : "bg-chart-3"}
              label="Copper is thinking"
            >
              <div
                data-testid="thinking"
                className="text-muted-foreground border-l-2 pl-3 text-sm italic"
              >
                <Markdown text={step.text} />
              </div>
            </Station>
          ) : (
            <Station
              key={step.id}
              node={<WrenchIcon className="size-4" />}
              nodeClass="bg-accent"
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={++toolCount} />
            </Station>
          ),
        )}

        {working && (
          <Station
            node={
              <span className="flex gap-0.5">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="size-1 animate-bounce rounded-full bg-current"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
            }
            nodeClass={cn(
              "animate-pulse",
              useTools ? "bg-primary" : "bg-chart-3",
            )}
          >
            <p className="text-muted-foreground pt-1.5 text-sm">
              {progress.reply
                ? "Writing the answer…"
                : !useTools
                  ? "Answering from memory…"
                  : progress.steps.length
                    ? "Deciding what to do next…"
                    : "Reading your question…"}
            </p>
          </Station>
        )}
      </div>

      {(progress.reply || !working) && (
        <div className="bg-card text-card-foreground ml-10 rounded-2xl rounded-tl-sm border px-4 py-3 shadow-xs">
          <p className="text-primary mb-1 text-xs font-bold">Copper</p>
          {!useTools && (
            <div className="border-chart-3 bg-chart-3/10 mb-2 rounded-lg border px-3 py-2 text-xs">
              <p className="flex items-center gap-1.5 font-semibold">
                <TriangleAlertIcon className="text-chart-3 size-4" />
                <strong>Answered without tools: may be made up</strong>
              </p>
              <p className="text-muted-foreground mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap">
            {progress.reply}
            {working && (
              <span
                aria-hidden
                className="bg-primary ml-0.5 inline-block h-4 w-1.5 animate-pulse align-text-bottom"
              />
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** One stop on the rail: a round node and what happened there. */
function Station({
  node,
  nodeClass,
  label,
  children,
}: {
  node: ReactNode;
  nodeClass: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative pl-11">
      <span
        className={cn(
          "ring-secondary absolute top-0 left-0 flex size-8 items-center justify-center rounded-full text-white ring-4",
          nodeClass,
        )}
      >
        {node}
      </span>
      {label && (
        <p className="text-muted-foreground mb-1.5 pt-2 text-[0.7rem] font-semibold tracking-widest uppercase">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

/** Renders the **bold** and `code` marks in Gemini's thought summaries. */
function Markdown({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <p key={i} className={cn(!line.trim() && "h-2")}>
          {line.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((piece, j) =>
            piece.startsWith("**") && piece.endsWith("**") && piece.length > 4 ? (
              <strong key={j} className="text-foreground not-italic">
                {piece.slice(2, -2)}
              </strong>
            ) : piece.startsWith("`") && piece.endsWith("`") && piece.length > 2 ? (
              <code key={j} className="bg-muted rounded px-1 font-mono text-xs not-italic">
                {piece.slice(1, -1)}
              </code>
            ) : (
              <Fragment key={j}>{piece}</Fragment>
            ),
          )}
        </p>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The tool card: what Copper sent, and what came back
// ---------------------------------------------------------------------------

type Row = { label: string; value: ReactNode };

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "2026-11-14" → "Nov 14, 2026". */
function formatDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return MONTHS[month - 1] ? `${MONTHS[month - 1]} ${day}, ${year}` : iso;
}

const productName = (id: unknown) =>
  getProducts().find((p) => p.id === id)?.name ?? String(id);
const planName = (id: unknown) =>
  getPlans().find((p) => p.id === id)?.name ?? String(id);

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  const calling = step.state === "calling";
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card overflow-hidden rounded-xl border shadow-xs"
    >
      <div className="bg-accent flex flex-wrap items-center gap-2 px-3 py-2 text-white">
        <span className="font-mono text-sm font-bold">{step.name}()</span>
        <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[0.65rem] font-semibold">
          tool {number}
        </span>
        <span className="ml-auto text-xs">{TOOL_LABELS[step.name] ?? ""}</span>
      </div>

      <div className="px-3 py-2.5">
        <p className="text-muted-foreground mb-1.5 text-[0.7rem] font-semibold tracking-widest uppercase">
          → What Copper sent
        </p>
        {step.input === undefined && calling ? (
          <p className="text-muted-foreground text-sm italic">
            filling in the details…
          </p>
        ) : (
          <SentInput step={step} />
        )}
      </div>

      <div className="bg-accent/10 border-t px-3 py-2.5">
        <p className="text-muted-foreground mb-1.5 text-[0.7rem] font-semibold tracking-widest uppercase">
          ← What came back
        </p>
        {calling ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm italic">
            <Spinner className="text-accent" />
            the app is running the code…
          </p>
        ) : step.state === "error" ? (
          <p className="text-chart-3 text-sm">{String(step.output)}</p>
        ) : (
          <CameBack name={step.name} output={step.output} />
        )}
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(({ label, value }) => (
        <Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function SentInput({ step }: { step: ToolStep }) {
  const input = (step.input ?? {}) as Record<string, unknown>;
  switch (step.name) {
    case "get_prices":
      return <p className="text-sm">Nothing, it just asked for the price list</p>;
    case "get_products":
      return <p className="text-sm">Nothing, it just asked what Copper sells</p>;
    case "calculate_cost": {
      const products = Array.isArray(input.products) ? input.products : [];
      return (
        <Rows
          rows={[
            {
              label: "Products",
              value: products.length
                ? products.map(productName).join(", ")
                : "None",
            },
            { label: "Plan", value: planName(input.plan) },
            { label: "Billing", value: String(input.billing ?? "") },
            { label: "Years", value: String(input.years ?? "") },
          ]}
        />
      );
    }
    case "check_availability":
      return (
        <Rows
          rows={[
            { label: "Product", value: productName(input.product) },
            {
              label: "Color",
              value: input.color ? String(input.color) : "Every color",
            },
          ]}
        />
      );
    default:
      return (
        <Rows
          rows={Object.entries(input).map(([label, value]) => ({
            label,
            value: String(value),
          }))}
        />
      );
  }
}

type Cost = { lines: { item: string; usd: number }[]; totalUsd: number };
type ProductList = {
  products: { id: string; name: string; type: string; priceUsd: number; colors: string[] }[];
};
type Prices = {
  products: { id: string; name: string; priceUsd: number }[];
  plans: { id: string; name: string; monthlyUsd: number; annualUsd: number }[];
};
type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: string; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

function CameBack({ name, output }: { name: string; output: unknown }) {
  if (name === "calculate_cost" && output && typeof output === "object") {
    const { lines, totalUsd } = output as Cost;
    return (
      <div className="text-sm">
        {lines.map((line, i) => (
          <div key={i} className="flex justify-between gap-4 py-0.5">
            <span>{line.item}</span>
            <span className="font-medium">{formatUsd(line.usd)}</span>
          </div>
        ))}
        <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t pt-1.5">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-xl font-bold">
            {formatUsd(totalUsd)}
          </span>
        </div>
      </div>
    );
  }

  if (name === "get_products" && output && typeof output === "object") {
    const { products } = output as ProductList;
    return (
      <div className="space-y-2.5 text-sm">
        {products.map((product) => (
          <div key={product.id}>
            <div className="flex justify-between gap-4">
              <span className="font-semibold">{product.name}</span>
              <span className="font-medium">{formatUsd(product.priceUsd)}</span>
            </div>
            <p className="text-muted-foreground text-xs">{product.type}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {product.colors.map((color) => (
                <span
                  key={color}
                  className="bg-accent/15 text-foreground rounded-full px-2 py-0.5 text-xs"
                >
                  {color}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (name === "get_prices" && output && typeof output === "object") {
    const { products, plans } = output as Prices;
    return (
      <div className="text-sm">
        {products.map((product) => (
          <div key={product.id} className="flex justify-between gap-4 py-0.5">
            <span>{product.name}</span>
            <span className="font-medium">{formatUsd(product.priceUsd)}</span>
          </div>
        ))}
        {plans
          .filter((plan) => plan.monthlyUsd > 0 || plan.annualUsd > 0)
          .map((plan) => (
            <div key={plan.id} className="flex justify-between gap-4 py-0.5">
              <span>{plan.name}</span>
              <span className="font-medium">
                {formatUsd(plan.monthlyUsd)}/mo · {formatUsd(plan.annualUsd)}/yr
              </span>
            </div>
          ))}
      </div>
    );
  }

  if (name === "check_availability" && output && typeof output === "object") {
    const result = output as Availability;
    if (result.status === "unavailable") {
      return <p className="text-sm">{result.message}</p>;
    }
    if (result.status === "not_a_color") {
      return (
        <p className="text-sm">
          {result.product} doesn&apos;t come in {result.color}. It comes in{" "}
          {result.colors.join(", ")}.
        </p>
      );
    }
    return (
      <div className="space-y-1 text-sm">
        <p className="font-semibold">{result.product}</p>
        {result.colors.length === 0 && (
          <p className="text-muted-foreground">No stock rows for that color.</p>
        )}
        {result.colors.map((row) => (
          <div key={row.color} className="flex items-center justify-between gap-4">
            <span>{row.color}</span>
            <StockPill stock={row.stock} restockDate={row.restockDate} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <p className="text-sm">
      {typeof output === "string" ? output : "The tool finished."}
    </p>
  );
}

function StockPill({
  stock,
  restockDate,
}: {
  stock: string;
  restockDate: string | null;
}) {
  if (stock === "backordered") {
    const until = restockDate
      ? ` until ${formatDate(restockDate)}`
      : "";
    return (
      <span className="bg-chart-3 rounded-full px-2 py-0.5 text-xs font-semibold text-white">
        Back-ordered{until}
      </span>
    );
  }
  if (stock === "low_stock") {
    return (
      <span className="bg-chart-4 rounded-full px-2 py-0.5 text-xs font-semibold text-[#1c2333]">
        Low stock
      </span>
    );
  }
  return (
    <span className="bg-accent rounded-full px-2 py-0.5 text-xs font-semibold text-white">
      In stock
    </span>
  );
}
