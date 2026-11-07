import { create } from "zustand";
import { BLOCK_MAP, defaultSettings } from "./catalog.ts";
import { createRuntime, propagate, settle, stepCircuit } from "./engine.ts";
import { EXAMPLES } from "./examples.ts";
import type { BlockType, Circuit, Runtime, Settings } from "./types.ts";

const starter = EXAMPLES[0]!.circuit;

function withIds(doc: Circuit): { doc: Circuit; nextId: number; nextWire: number } {
  let nextId = 1;
  let nextWire = 1;
  for (const block of doc.blocks) {
    const n = Number(block.id.replace(/\D/g, ""));
    if (Number.isFinite(n)) nextId = Math.max(nextId, n + 1);
  }
  for (const wire of doc.wires) {
    const n = Number(wire.id.replace(/\D/g, ""));
    if (Number.isFinite(n)) nextWire = Math.max(nextWire, n + 1);
  }
  return { doc, nextId, nextWire };
}

function boot(doc: Circuit) {
  const rt = settle(doc, createRuntime(doc), {}, 8);
  return { ...withIds(doc), rt };
}

const booted = boot(starter);

interface LabStore {
  doc: Circuit;
  rt: Runtime;
  held: Record<string, number>;
  running: boolean;
  speed: number;
  selected: string | null;
  connectFrom: string | null;
  nextId: number;
  nextWire: number;
  notice: string;
  addBlock: (type: BlockType, x: number, y: number) => void;
  moveBlock: (id: string, x: number, y: number) => void;
  select: (id: string | null) => void;
  beginConnect: (id: string) => void;
  armConnect: (id: string) => void;
  finishConnect: (id: string) => void;
  cancelConnect: () => void;
  removeWire: (id: string) => void;
  removeSelected: () => void;
  patchSettings: (id: string, patch: Partial<Settings>) => void;
  setMeasure: (id: string, value: number) => void;
  setHeld: (key: string, value: number) => void;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: number) => void;
  stepOnce: () => void;
  tick: () => void;
  load: (doc: Circuit, notice?: string) => void;
  clear: () => void;
  setNotice: (notice: string) => void;
}

function refresh(doc: Circuit, rt: Runtime, held: Record<string, number>, running: boolean): Runtime {
  if (running) return rt;
  return propagate(doc, rt, held, 8);
}

export const useLab = create<LabStore>((set, get) => ({
  doc: booted.doc,
  rt: booted.rt,
  held: {},
  running: true,
  speed: 1,
  selected: "and",
  connectFrom: null,
  nextId: booted.nextId,
  nextWire: booted.nextWire,
  notice: EXAMPLES[0]!.note,

  addBlock: (type, x, y) => {
    const { doc, rt, held, running, nextId } = get();
    const id = `b${nextId}`;
    const nextDoc: Circuit = {
      ...doc,
      blocks: [...doc.blocks, { id, type, x, y, settings: defaultSettings(type) }],
    };
    const seeded = createRuntime(nextDoc);
    seeded.tick = rt.tick;
    for (const block of doc.blocks) {
      if (rt.blocks[block.id]) seeded.blocks[block.id] = rt.blocks[block.id]!;
    }
    set({
      doc: nextDoc,
      rt: refresh(nextDoc, seeded, held, running),
      nextId: nextId + 1,
      selected: id,
      notice: `Added ${BLOCK_MAP[type].name}`,
    });
  },

  moveBlock: (id, x, y) => {
    const doc = get().doc;
    set({
      doc: {
        ...doc,
        blocks: doc.blocks.map((block) => (block.id === id ? { ...block, x, y } : block)),
      },
    });
  },

  select: (id) => set({ selected: id }),

  beginConnect: (id) =>
    set({ connectFrom: id, notice: "Choose the block that should receive this signal." }),

  armConnect: (id) => {
    const { connectFrom, doc } = get();
    if (!connectFrom) {
      set({ connectFrom: id, notice: "Now choose the block that should receive this signal." });
      return;
    }
    if (connectFrom === id) {
      set({ connectFrom: null });
      return;
    }
    const from = doc.blocks.find((b) => b.id === connectFrom);
    const to = doc.blocks.find((b) => b.id === id);
    if (!from || !to || !BLOCK_MAP[from.type].hasOut || !BLOCK_MAP[to.type].hasIn) {
      set({ connectFrom: id, notice: "That block can’t take the wire. Pick one with an input." });
      return;
    }
    if (doc.wires.some((w) => w.from === from.id && w.to === to.id)) {
      set({ connectFrom: null, notice: "Those two are already connected." });
      return;
    }
    const nextWire = get().nextWire;
    const nextDoc: Circuit = {
      ...doc,
      wires: [...doc.wires, { id: `w${nextWire}`, from: from.id, to: to.id }],
    };
    set({
      doc: nextDoc,
      rt: refresh(nextDoc, get().rt, get().held, get().running),
      nextWire: nextWire + 1,
      connectFrom: null,
      notice: "Connected.",
    });
  },

  finishConnect: (id) => {
    if (!get().connectFrom) {
      set({ notice: "Start the wire from an orange output pip." });
      return;
    }
    get().armConnect(id);
  },

  cancelConnect: () => set({ connectFrom: null }),

  removeWire: (id) => {
    const { doc, rt, held, running } = get();
    const nextDoc = { ...doc, wires: doc.wires.filter((w) => w.id !== id) };
    set({ doc: nextDoc, rt: refresh(nextDoc, rt, held, running), notice: "Wire removed." });
  },

  removeSelected: () => {
    const { selected, doc, rt, held, running } = get();
    if (!selected) return;
    const nextDoc: Circuit = {
      ...doc,
      blocks: doc.blocks.filter((b) => b.id !== selected),
      wires: doc.wires.filter((w) => w.from !== selected && w.to !== selected),
    };
    set({
      doc: nextDoc,
      rt: refresh(nextDoc, rt, held, running),
      selected: null,
      connectFrom: null,
      notice: "Block removed.",
    });
  },

  patchSettings: (id, patch) => {
    const { doc, rt, held, running } = get();
    const nextDoc: Circuit = {
      ...doc,
      blocks: doc.blocks.map((block) =>
        block.id === id ? { ...block, settings: { ...block.settings, ...patch } } : block,
      ),
    };
    set({ doc: nextDoc, rt: refresh(nextDoc, rt, held, running) });
  },

  setMeasure: (id, value) => {
    const { doc, rt, held, running } = get();
    const next: Runtime = { tick: rt.tick, blocks: { ...rt.blocks, [id]: { ...rt.blocks[id]!, measure: value } } };
    set({ rt: running ? next : propagate(doc, next, held, 4) });
  },

  setHeld: (key, value) => {
    const held = { ...get().held, [key]: value };
    if (!value) delete held[key];
    const { doc, rt, running } = get();
    set({ held, rt: running ? rt : propagate(doc, rt, held, 8) });
  },

  setRunning: (running) => set({ running, notice: running ? "Simulating at 60 ticks a second." : "Paused." }),
  setSpeed: (speed) => set({ speed }),

  stepOnce: () => {
    const { doc, rt, held } = get();
    set({ rt: stepCircuit(doc, rt, held), running: false });
  },

  tick: () => {
    const { doc, rt, held } = get();
    set({ rt: stepCircuit(doc, rt, held) });
  },

  load: (doc, notice) => {
    const next = boot(doc);
    set({
      doc: next.doc,
      rt: next.rt,
      held: {},
      selected: next.doc.blocks[0]?.id ?? null,
      connectFrom: null,
      nextId: next.nextId,
      nextWire: next.nextWire,
      notice: notice ?? `Loaded ${doc.name}.`,
    });
  },

  clear: () => {
    get().load({ name: "Untitled", blocks: [], wires: [] }, "Empty sheet.");
  },

  setNotice: (notice) => set({ notice }),
}));
