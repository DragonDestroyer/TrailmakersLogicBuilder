import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BLOCKS, BLOCK_MAP, CATEGORIES, measureLabel } from "@/lib/logic/catalog";
import { buildSheet, decodeCircuit, encodeCircuit } from "@/lib/logic/codec";
import { displayNumber, hueCss, phaseLabel } from "@/lib/logic/engine";
import { EXAMPLES } from "@/lib/logic/examples";
import { MOD_JSON, MOD_LUA } from "@/lib/logic/modlua";
import { useLab } from "@/lib/logic/store";
import type { BlockType, LogicBlock, Settings } from "@/lib/logic/types";

const CARD_W = 176;
const CARD_H = 96;
const KEYS = ["1", "2", "3", "4", "5", "6", "q", "w", "e", "a", "s", "d", "z", "x", "c"];

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function stripe(type: BlockType): string {
  const cat = BLOCK_MAP[type].category;
  if (cat === "gate") return "bg-primary text-bg";
  if (cat === "math") return "bg-signal text-bg";
  if (cat === "sensor") return "bg-raised text-fg";
  if (cat === "radio") return "bg-line text-fg";
  return "bg-fg text-bg";
}

function valueTone(n: number): string {
  if (n > 0.0001) return "text-pos";
  if (n < -0.0001) return "text-neg";
  return "text-muted";
}

export function LogicLab() {
  const doc = useLab((s) => s.doc);
  const rt = useLab((s) => s.rt);
  const running = useLab((s) => s.running);
  const speed = useLab((s) => s.speed);
  const selectedId = useLab((s) => s.selected);
  const connectFrom = useLab((s) => s.connectFrom);
  const notice = useLab((s) => s.notice);
  const held = useLab((s) => s.held);
  const [pan, setPan] = useState({ x: 24, y: 16 });
  const [sheet, setSheet] = useState<"blocks" | "inspect" | "share" | null>(null);
  const [shareTab, setShareTab] = useState<"code" | "mod" | "rules">("code");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [ready, setReady] = useState(false);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem("logic-lab-v1");
    if (raw) {
      try {
        useLab.getState().load(decodeCircuit(raw), "Restored your last sheet.");
      } catch {
        /* keep the bench */
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    return useLab.subscribe((state, prev) => {
      if (state.doc === prev.doc) return;
      localStorage.setItem("logic-lab-v1", encodeCircuit(state.doc));
    });
  }, [ready]);

  useEffect(() => {
    if (!running) return;
    let acc = 0;
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt * useLab.getState().speed;
      let steps = 0;
      while (acc >= 1 / 60 && steps < 5) {
        useLab.getState().tick();
        acc -= 1 / 60;
        steps += 1;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if (event.key === "Escape") {
        useLab.getState().cancelConnect();
        setSheet(null);
        return;
      }
      if (typing) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        useLab.getState().removeSelected();
        return;
      }
      const key = event.key.toLowerCase();
      if (KEYS.includes(key)) useLab.getState().setHeld(key, 1);
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (KEYS.includes(key)) useLab.getState().setHeld(key, 0);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const selected = doc.blocks.find((block) => block.id === selectedId) ?? null;
  const usedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const block of doc.blocks) {
      if (block.settings.greenKey) set.add(block.settings.greenKey);
      if (block.settings.redKey) set.add(block.settings.redKey);
    }
    return [...set];
  }, [doc.blocks]);

  function worldPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 40, y: 40 };
    return { x: clientX - rect.left - pan.x, y: clientY - rect.top - pan.y };
  }

  function onCanvasPointerDown(event: ReactPointerEvent) {
    if ((event.target as HTMLElement).closest("[data-block]")) return;
    panDrag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
    useLab.getState().select(null);
  }

  function onPointerMove(event: ReactPointerEvent) {
    if (drag.current) {
      const point = worldPoint(event.clientX, event.clientY);
      useLab.getState().moveBlock(
        drag.current.id,
        Math.round((point.x - drag.current.dx) / 16) * 16,
        Math.round((point.y - drag.current.dy) / 16) * 16,
      );
      return;
    }
    if (panDrag.current) {
      setPan({
        x: panDrag.current.px + (event.clientX - panDrag.current.x),
        y: panDrag.current.py + (event.clientY - panDrag.current.y),
      });
    }
  }

  function onPointerUp() {
    drag.current = null;
    panDrag.current = null;
  }

  const code = encodeCircuit(doc);
  const steps = buildSheet(doc);

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-2 md:px-4">
        <div className="min-w-0">
          <p className="font-display text-lg leading-none tracking-wide text-primary">LOGIC LAB</p>
          <p className="truncate text-xs text-muted">{notice}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-xs text-muted sm:inline">tick {rt.tick}</span>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line bg-raised px-3 text-sm"
            onClick={() => useLab.getState().setRunning(!running)}
          >
            {running ? "Pause" : "Run"}
          </button>
          <button
            type="button"
            className="hidden min-h-11 rounded-lg border border-line bg-raised px-3 text-sm sm:inline"
            onClick={() => useLab.getState().stepOnce()}
          >
            Step
          </button>
          <button
            type="button"
            className="hidden min-h-11 rounded-lg border border-line bg-raised px-3 text-sm md:inline"
            onClick={() => useLab.getState().setSpeed(speed === 1 ? 4 : 1)}
          >
            {speed === 1 ? "1×" : "4×"}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-bg"
            onClick={() => {
              setShareTab("code");
              setSheet("share");
              setImportText(code);
            }}
          >
            Export
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 md:grid md:grid-cols-[15.5rem_minmax(0,1fr)_20rem]">
        <aside className="hidden min-h-0 flex-col border-r border-line bg-surface md:flex">
          <Palette
            onAdd={(type) => {
              useLab.getState().addBlock(type, 80 - pan.x, 80 - pan.y);
            }}
          />
        </aside>

        <div
          ref={canvasRef}
          className="relative min-h-0 touch-none overflow-hidden bg-canvas"
          onPointerDown={onCanvasPointerDown}
        >
          <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
            <svg className="pointer-events-none absolute left-0 top-0 h-[2400px] w-[2400px] overflow-visible">
              {doc.wires.map((wire) => {
                const from = doc.blocks.find((b) => b.id === wire.from);
                const to = doc.blocks.find((b) => b.id === wire.to);
                if (!from || !to) return null;
                const x1 = from.x + CARD_W;
                const y1 = from.y + CARD_H / 2;
                const x2 = to.x;
                const y2 = to.y + CARD_H / 2;
                const dx = Math.max(48, Math.abs(x2 - x1) * 0.45);
                const live = rt.blocks[from.id]?.output ?? 0;
                return (
                  <path
                    key={wire.id}
                    d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={live > 0.0001 ? "var(--color-pos)" : live < -0.0001 ? "var(--color-neg)" : "var(--color-signal)"}
                    strokeWidth={2.5}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      useLab.getState().removeWire(wire.id);
                    }}
                  />
                );
              })}
              {connectFrom
                ? doc.blocks
                    .filter((b) => b.id === connectFrom)
                    .map((from) => (
                      <circle
                        key="arm"
                        cx={from.x + CARD_W}
                        cy={from.y + CARD_H / 2}
                        r={7}
                        fill="var(--color-primary)"
                      />
                    ))
                : null}
            </svg>
            {doc.blocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                meter={rt.blocks[block.id]?.meter ?? 0}
                phase={rt.blocks[block.id]?.phase ?? "idle"}
                selected={block.id === selectedId}
                armed={block.id === connectFrom}
                onSelect={() => {
                  useLab.getState().select(block.id);
                  if (window.innerWidth < 768) setSheet("inspect");
                }}
                onDragStart={(event) => {
                  const point = worldPoint(event.clientX, event.clientY);
                  drag.current = { id: block.id, dx: point.x - block.x, dy: point.y - block.y };
                  useLab.getState().select(block.id);
                }}
              />
            ))}
          </div>
          {doc.blocks.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
              <div>
                <p className="font-display text-2xl text-fg">Empty sheet</p>
                <p className="mt-1 max-w-xs text-sm text-muted">Add a gate from the block list. A bare NOR is the game’s always-on constant.</p>
              </div>
            </div>
          ) : null}
          <p className="pointer-events-none absolute bottom-3 left-3 hidden text-xs text-muted md:block">
            Drag empty space to pan. Click a wire to remove it. Signals update one tick later, same as the game.
          </p>
        </div>

        <aside className="hidden min-h-0 flex-col border-l border-line bg-surface md:flex">
          <Inspector block={selected} />
        </aside>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm md:hidden" onClick={() => setSheet("blocks")}>
          Blocks
        </button>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm md:hidden" onClick={() => setSheet("inspect")}>
          Inspect
        </button>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {usedKeys.length === 0 ? (
            <span className="self-center text-xs text-muted">No keys bound</span>
          ) : (
            usedKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={`min-h-11 min-w-11 rounded-lg border px-3 font-display text-lg ${held[key] ? "border-primary bg-primary text-bg" : "border-line bg-raised text-fg"}`}
                onPointerDown={() => useLab.getState().setHeld(key, 1)}
                onPointerUp={() => useLab.getState().setHeld(key, 0)}
                onPointerLeave={() => held[key] && useLab.getState().setHeld(key, 0)}
              >
                {key.toUpperCase()}
              </button>
            ))
          )}
        </div>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm md:hidden" onClick={() => useLab.getState().stepOnce()}>
          Step
        </button>
      </footer>

      {sheet === "blocks" ? (
        <Drawer title="Blocks" onClose={() => setSheet(null)}>
          <Palette
            onAdd={(type) => {
              useLab.getState().addBlock(type, 48 - pan.x, 72 - pan.y);
              setSheet(null);
            }}
          />
        </Drawer>
      ) : null}
      {sheet === "inspect" ? (
        <Drawer title="Block" onClose={() => setSheet(null)}>
          <Inspector block={selected} />
        </Drawer>
      ) : null}
      {sheet === "share" ? (
        <Drawer title="Take it to the game" onClose={() => setSheet(null)}>
          <div className="mb-3 flex gap-2">
            {(["code", "mod", "rules"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`min-h-11 rounded-lg px-3 text-sm ${shareTab === tab ? "bg-primary text-bg" : "border border-line"}`}
                onClick={() => setShareTab(tab)}
              >
                {tab === "code" ? "Code" : tab === "mod" ? "In-game mod" : "Rules"}
              </button>
            ))}
          </div>
          {shareTab === "code" ? (
            <div className="space-y-3">
              <textarea
                className="h-40 w-full resize-none rounded-lg border border-line bg-bg p-3 font-mono text-xs text-fg"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
              />
              {importError ? <p className="text-sm text-neg">{importError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-bg"
                  onClick={() => {
                    void navigator.clipboard?.writeText(code);
                    useLab.getState().setNotice("Code copied.");
                  }}
                >
                  Copy code
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-line px-3 text-sm"
                  onClick={() => {
                    try {
                      const loaded = decodeCircuit(importText);
                      useLab.getState().load(loaded, `Loaded ${loaded.name}.`);
                      setImportError("");
                      setSheet(null);
                    } catch (error) {
                      setImportError(error instanceof Error ? error.message : "Could not read that code.");
                    }
                  }}
                >
                  Load
                </button>
                <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => download("logic-lab.txt", code)}>
                  Download
                </button>
              </div>
              <ol className="max-h-48 space-y-1 overflow-auto text-sm text-muted">
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {shareTab === "mod" ? <ModPanel code={code} /> : null}
          {shareTab === "rules" ? <Rules /> : null}
        </Drawer>
      ) : null}
    </div>
  );
}

function BlockCard({
  block,
  meter,
  phase,
  selected,
  armed,
  onSelect,
  onDragStart,
}: {
  block: LogicBlock;
  meter: number;
  phase: string;
  selected: boolean;
  armed: boolean;
  onSelect: () => void;
  onDragStart: (event: ReactPointerEvent) => void;
}) {
  const def = BLOCK_MAP[block.type];
  const shown = displayNumber(block, meter);
  return (
    <article
      data-block
      className={`absolute rounded-xl border bg-surface shadow-lg ${selected || armed ? "border-primary" : "border-line"}`}
      style={{ left: block.x, top: block.y, width: CARD_W, height: CARD_H }}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).dataset.port) return;
        event.stopPropagation();
        onSelect();
        onDragStart(event);
      }}
    >
      <div className={`flex items-center justify-between rounded-t-[10px] px-2.5 py-1 ${stripe(block.type)}`}>
        <span className="font-display text-sm tracking-wide">{def.name}</span>
        <span className="font-mono text-[10px] opacity-70">{block.id}</span>
      </div>
      <div className="px-2.5 pt-1.5">
        <p className={`font-display text-3xl leading-none ${valueTone(meter)}`}>{shown}</p>
        {block.type === "hue" ? (
          <span className="mt-1.5 block h-2.5 rounded-full border border-line" style={{ background: hueCss(meter, block.settings.saturation, block.settings.brightness) }} />
        ) : (
          <p className="mt-1 truncate text-[11px] text-muted">{phase === "idle" || phase === "hold" ? def.blurb : phaseLabel(phase as "delay")}</p>
        )}
      </div>
      {def.hasIn ? (
        <button
          type="button"
          data-port="in"
          aria-label={`Input of ${def.name}`}
          className="absolute top-1/2 -left-2.5 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-signal bg-bg"
          onPointerDown={(event) => {
            event.stopPropagation();
            useLab.getState().finishConnect(block.id);
          }}
        />
      ) : null}
      {def.hasOut ? (
        <button
          type="button"
          data-port="out"
          aria-label={`Output of ${def.name}`}
          className={`absolute top-1/2 -right-2.5 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-primary ${armed ? "bg-primary" : "bg-bg"}`}
          onPointerDown={(event) => {
            event.stopPropagation();
            useLab.getState().beginConnect(block.id);
          }}
        />
      ) : null}
    </article>
  );
}

function Palette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [example, setExample] = useState(EXAMPLES[0]!.id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-3">
        <label className="text-xs text-muted" htmlFor="example">
          Example
        </label>
        <select
          id="example"
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-2 text-sm"
          value={example}
          onChange={(event) => {
            const found = EXAMPLES.find((item) => item.id === event.target.value);
            setExample(event.target.value);
            if (found) useLab.getState().load(found.circuit, found.note);
          }}
        >
          {EXAMPLES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {CATEGORIES.map((cat) => (
          <section key={cat.id} className="mb-4">
            <h2 className="mb-1.5 font-display text-xs tracking-[0.16em] text-muted">{cat.title.toUpperCase()}</h2>
            <div className="grid grid-cols-2 gap-2">
              {BLOCKS.filter((block) => block.category === cat.id).map((block) => (
                <button
                  key={block.type}
                  type="button"
                  className="min-h-11 rounded-lg border border-line bg-raised px-2 py-1.5 text-left text-sm hover:border-primary"
                  onClick={() => onAdd(block.type)}
                >
                  <span className="block font-medium">{block.name}</span>
                  <span className="block text-[11px] text-muted">{block.blurb}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Inspector({ block }: { block: LogicBlock | null }) {
  const rt = useLab((s) => s.rt);
  const doc = useLab((s) => s.doc);
  if (!block) {
    return <p className="p-4 text-sm text-muted">Select a block to set output scale, keys, timers, and the operation. Delete removes the selection.</p>;
  }
  const state = rt.blocks[block.id];
  const set = block.settings;
  const patch = (partial: Partial<Settings>) => useLab.getState().patchSettings(block.id, partial);
  const wiresIn = doc.wires.filter((w) => w.to === block.id);
  const wiresOut = doc.wires.filter((w) => w.from === block.id);
  const measure = measureLabel(block.type);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl leading-none">{BLOCK_MAP[block.type].name}</h2>
          <p className="mt-1 text-xs text-muted">{state?.debug}</p>
        </div>
        <button type="button" className="min-h-11 rounded-lg border border-neg px-3 text-sm text-neg" onClick={() => useLab.getState().removeSelected()}>
          Delete
        </button>
      </div>
      {measure ? (
        <Field label={measure}>
          <input
            type="range"
            min={block.type === "distance" ? 0 : block.type === "angle" || block.type === "compass" || block.type === "aiming" ? 0 : -50}
            max={block.type === "angle" || block.type === "compass" || block.type === "aiming" ? 360 : 200}
            step={0.5}
            value={state?.measure ?? 0}
            onChange={(event) => useLab.getState().setMeasure(block.id, Number(event.target.value))}
          />
          <b className="font-mono text-sm">{state?.measure ?? 0}</b>
        </Field>
      ) : null}
      {block.type !== "servo" && block.type !== "thruster" && block.type !== "hue" && block.type !== "sender" ? (
        <Num label="Output scale" value={set.output} step={0.05} onChange={(output) => patch({ output })} />
      ) : null}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <KeyField label="Green +" value={set.greenKey} onChange={(greenKey) => patch({ greenKey })} />
        <KeyField label="Red −" value={set.redKey} onChange={(redKey) => patch({ redKey })} />
      </div>
      <div className="mb-3 flex gap-3 text-sm">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={set.togglePos} onChange={(event) => patch({ togglePos: event.target.checked })} />
          Toggle +
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={set.toggleNeg} onChange={(event) => patch({ toggleNeg: event.target.checked })} />
          Toggle −
        </label>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Num label="Delay s" value={set.delay} step={1 / 60} onChange={(delay) => patch({ delay: Math.max(0, delay) })} />
        <Num label="Duration" value={set.duration} step={1 / 60} onChange={(duration) => patch({ duration: Math.max(0, duration) })} />
        <Num label="Pause" value={set.pause} step={1 / 60} onChange={(pause) => patch({ pause: Math.max(0, pause) })} />
      </div>
      <Num label="Logic channel" value={set.channel} step={1} onChange={(channel) => patch({ channel: Math.max(0, Math.round(channel)) })} />
      {block.type === "compare" ? (
        <>
          <Select
            label="Compare"
            value={set.compareMode}
            options={["lt", "le", "gt", "ge", "eq", "ne"]}
            onChange={(compareMode) => patch({ compareMode: compareMode as Settings["compareMode"] })}
          />
          <Num label="Threshold" value={set.threshold} step={0.1} onChange={(threshold) => patch({ threshold })} />
          <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={set.clampInput} onChange={(event) => patch({ clampInput: event.target.checked })} />
            Clamp sum to −1…1
          </label>
        </>
      ) : null}
      {block.type === "arith" ? (
        <>
          <Select
            label="Operation"
            value={set.arithOp}
            options={["add", "sub", "mul", "div", "mod", "pow", "exp", "vardiv"]}
            onChange={(arithOp) => patch({ arithOp: arithOp as Settings["arithOp"] })}
          />
          {set.arithOp !== "vardiv" ? <Num label="Constant" value={set.constant} step={0.1} onChange={(constant) => patch({ constant })} /> : <p className="mb-3 text-xs text-muted">Channel 0 is the numerator, channel 1 the denominator. Divide by zero outputs 0.</p>}
        </>
      ) : null}
      {block.type === "fn" ? (
        <Select
          label="Function"
          value={set.fn}
          options={["abs", "sign", "sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "floor", "ceil", "round", "atan2", "log2", "ln", "log10"]}
          onChange={(fn) => patch({ fn: fn as Settings["fn"] })}
        />
      ) : null}
      {block.type === "aggregate" ? (
        <Select label="Aggregate" value={set.agg} options={["sum", "product", "min", "max"]} onChange={(agg) => patch({ agg: agg as Settings["agg"] })} />
      ) : null}
      {block.type === "accum" || block.type === "random" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Min" value={set.min} step={0.1} onChange={(min) => patch({ min })} />
            <Num label="Max" value={set.max} step={0.1} onChange={(max) => patch({ max })} />
          </div>
          {block.type === "accum" ? (
            <>
              <Num label="Scale" value={set.scale} step={0.1} onChange={(scale) => patch({ scale })} />
              <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={set.useSteps} onChange={(event) => patch({ useSteps: event.target.checked })} />
                Once per press (off = per second)
              </label>
            </>
          ) : (
            <Select
              label="Random mode"
              value={set.randomMode}
              options={["out", "change", "range", "split"]}
              onChange={(randomMode) => patch({ randomMode: randomMode as Settings["randomMode"] })}
            />
          )}
        </>
      ) : null}
      {block.type === "display" ? (
        <Select label="Rounding" value={set.roundMode} options={["off", "nearest", "floor", "ceil"]} onChange={(roundMode) => patch({ roundMode: roundMode as Settings["roundMode"] })} />
      ) : null}
      {measure && (block.type === "angle" || block.type === "compass" || block.type === "aiming") ? (
        <div className="grid grid-cols-2 gap-2">
          <Num label="Direction" value={set.direction} step={1} onChange={(direction) => patch({ direction })} />
          <Num label="Width" value={set.width} step={1} onChange={(width) => patch({ width: Math.max(0, width) })} />
        </div>
      ) : null}
      {measure && block.type !== "angle" && block.type !== "compass" && block.type !== "aiming" ? (
        <Num label={block.type === "distance" ? "Range (m)" : "Threshold"} value={set.threshold} step={0.5} onChange={(threshold) => patch({ threshold })} />
      ) : null}
      {measure ? (
        <>
          <Select label="Output mode" value={set.sensorMode} options={["trigger", "measure", "normalized"]} onChange={(sensorMode) => patch({ sensorMode: sensorMode as Settings["sensorMode"] })} />
          <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={set.invert} onChange={(event) => patch({ invert: event.target.checked })} />
            {block.type === "angle" || block.type === "compass" || block.type === "aiming" ? "Trigger outside" : "Trigger below"}
          </label>
          <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={set.mute} onChange={(event) => patch({ mute: event.target.checked })} />
            Mute while an input is on
          </label>
        </>
      ) : null}
      {block.type === "servo" ? <Num label="Angle" value={set.angle} step={1} onChange={(angle) => patch({ angle })} /> : null}
      {block.type === "thruster" ? <Num label="Power" value={set.power} step={1} onChange={(power) => patch({ power })} /> : null}
      {block.type === "hue" ? (
        <div className="grid grid-cols-2 gap-2">
          <Num label="Saturation" value={set.saturation} step={0.05} onChange={(saturation) => patch({ saturation })} />
          <Num label="Brightness" value={set.brightness} step={0.05} onChange={(brightness) => patch({ brightness })} />
        </div>
      ) : null}
      {block.type === "sender" || block.type === "receiver" ? (
        <Num label="RC channel" value={set.rcChannel} step={1} onChange={(rcChannel) => patch({ rcChannel: Math.round(rcChannel) })} />
      ) : null}
      <WireList title="Feeds this block" wires={wiresIn} doc={doc} />
      <WireList title="This block feeds" wires={wiresOut} doc={doc} />
      <button type="button" className="mt-2 min-h-11 text-sm text-muted underline" onClick={() => useLab.getState().clear()}>
        Clear sheet
      </button>
    </div>
  );
}

function WireList({ title, wires, doc }: { title: string; wires: { id: string; from: string; to: string }[]; doc: { blocks: LogicBlock[] } }) {
  if (wires.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs text-muted">{title}</p>
      {wires.map((wire) => {
        const other = doc.blocks.find((b) => b.id === (wire.from === wires[0]?.from && title.startsWith("This") ? wire.to : wire.from));
        const id = title.startsWith("This") ? wire.to : wire.from;
        const peer = doc.blocks.find((b) => b.id === id);
        return (
          <button key={wire.id} type="button" className="mb-1 flex min-h-11 w-full items-center justify-between rounded-lg border border-line px-2 text-left text-sm" onClick={() => useLab.getState().removeWire(wire.id)}>
            <span>{peer ? `${BLOCK_MAP[peer.type].name} ${peer.id}` : other?.id}</span>
            <span className="text-neg">Remove</span>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block text-xs text-muted">
      {label}
      <span className="mt-1 flex items-center gap-2 text-fg">{children}</span>
    </label>
  );
}

function Num({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <input
        className="min-h-11 w-full rounded-lg border border-line bg-bg px-2 font-mono text-sm"
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function KeyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-muted">
      {label}
      <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-2 text-sm text-fg" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">None</option>
        {KEYS.map((key) => (
          <option key={key} value={key}>
            {key.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="mb-3 block text-xs text-muted">
      {label}
      <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-2 text-sm text-fg" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Drawer({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-bg/70 md:items-center" onPointerDown={onClose}>
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-surface md:rounded-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-display text-lg">{title}</h2>
          <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

function ModPanel({ code }: { code: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <p>
        The supported Lua API can spawn barrels, triggers, and finished PNG blueprints. It cannot drop a logic block into the builder or tick the checkbox that wires it. <span className="text-fg">ModBlock</span> can recolor a block you already placed. It has no place-block or connect-input call.
      </p>
      <p>
        So the mod that ships with this sheet is a build caller, not a spawner. Enable it, paste the code into its text field, and it walks you one connection at a time while you place the blocks yourself.
      </p>
      <p className="text-muted">
        An unofficial BepInEx plugin could call the private builder and would break on the next game update. That is not included, on purpose.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-lg bg-primary px-3 font-semibold text-bg" onClick={() => download("main.lua", MOD_LUA)}>
          Download main.lua
        </button>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={() => download("mod.json", MOD_JSON)}>
          Download mod.json
        </button>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={() => download("logic-lab.txt", code)}>
          Download code
        </button>
      </div>
      <ol className="list-decimal space-y-1 pl-4 text-muted">
        <li>Put both files in Trailmakers/mods/LogicLabImporter/.</li>
        <li>Enable the mod from the session options, then join.</li>
        <li>Paste the code into the Logic Lab text field and press Load code.</li>
        <li>Use Next step while you place and wire the blocks in build mode.</li>
      </ol>
    </div>
  );
}

function Rules() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted">
      <p className="text-fg">Gates are not boolean chips. A signal is on when its value is not 0. The output is output scale × clamp(sum, −1, 1), and only if the gate’s condition passes.</p>
      <ul className="list-disc space-y-1 pl-4">
        <li>AND: every input is on. 1 + −0.5 + −0.5 sums to 0, so it still sends nothing.</li>
        <li>OR: any input is on. 1 and −1 cancel, so the OR stays off.</li>
        <li>XOR: exactly one input is on, not “an odd number”.</li>
        <li>NOR: the sum is 0. The output scale replaces that sum, which is why a NOR with nothing plugged in is always on.</li>
      </ul>
      <p>A green and a red key on the same block are one input (positive minus negative). If you didn’t bind a key, it is not an input. If you did and nobody is holding it, AND still sees a 0.</p>
      <p>Math blocks do not clamp the sum. Comparison treats numbers within 0.0005 as equal. “Less or equal” rounds to 3 decimals, halves up. Sine and cosine take degrees. Divide by zero, invalid roots, and logs output 0. 0⁰ is 1 for power and 0 for exponentiation.</p>
      <p>Each block waits one tick before it sees a new upstream value. Delay, duration, and pause are counted in 1/60s frames (pause uses real seconds). Duration 0 means “stay on while the input lasts.”</p>
      <p>Servos multiply their angle by the clamped input. Thrusters do the same with power. Hue lights are black at 0, a hue cycle above 0, and a grayscale ramp below 0 that is white at −1.</p>
    </div>
  );
}
