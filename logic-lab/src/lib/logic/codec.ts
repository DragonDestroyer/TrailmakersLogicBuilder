import { BLOCK_MAP, defaultSettings } from "./catalog.ts";
import type { BlockType, Circuit, LogicBlock, Settings, Wire } from "./types.ts";

const KEYS: (keyof Settings)[] = [
  "output",
  "greenKey",
  "redKey",
  "togglePos",
  "toggleNeg",
  "delay",
  "duration",
  "pause",
  "channel",
  "threshold",
  "compareMode",
  "clampInput",
  "min",
  "max",
  "scale",
  "useSteps",
  "constant",
  "arithOp",
  "fn",
  "agg",
  "randomMode",
  "roundMode",
  "sensorMode",
  "invert",
  "mute",
  "direction",
  "width",
  "angle",
  "power",
  "saturation",
  "brightness",
  "rcChannel",
];

function clean(value: string): string {
  return value.replace(/[|\n\r]/g, " ").trim();
}

function packSettings(type: BlockType, settings: Settings): string {
  const base = defaultSettings(type);
  const parts: string[] = [];
  for (const key of KEYS) {
    if (settings[key] === base[key]) continue;
    parts.push(`${key}=${String(settings[key])}`);
  }
  return parts.join(",");
}

function unpackSettings(type: BlockType, extra: string): Settings {
  const settings = defaultSettings(type);
  if (!extra) return settings;
  for (const pair of extra.split(",")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx) as keyof Settings;
    const raw = pair.slice(idx + 1);
    if (!(key in settings)) continue;
    const current = settings[key];
    if (typeof current === "boolean") {
      (settings[key] as boolean) = raw === "true";
    } else if (typeof current === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) (settings[key] as number) = n;
    } else {
      (settings[key] as string) = raw;
    }
  }
  return settings;
}

export function encodeCircuit(doc: Circuit): string {
  const lines = [`TML2|${clean(doc.name) || "Untitled"}`];
  for (const block of doc.blocks) {
    lines.push(
      [
        "B",
        clean(block.id),
        block.type,
        Math.round(block.x),
        Math.round(block.y),
        packSettings(block.type, block.settings),
      ].join("|"),
    );
  }
  for (const wire of doc.wires) {
    lines.push(["W", clean(wire.id), clean(wire.from), clean(wire.to)].join("|"));
  }
  return lines.join("\n");
}

export function decodeCircuit(text: string): Circuit {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines[0]?.startsWith("TML2|")) throw new Error("That is not a Logic Lab code (needs a TML2 header).");
  const name = lines[0].slice(5) || "Untitled";
  const blocks: LogicBlock[] = [];
  const wires: Wire[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("|");
    if (parts[0] === "B" && parts.length >= 6) {
      const type = parts[2] as BlockType;
      if (!BLOCK_MAP[type]) throw new Error(`Unknown block “${parts[2]}”.`);
      blocks.push({
        id: parts[1] || `b${blocks.length + 1}`,
        type,
        x: Number(parts[3]) || 0,
        y: Number(parts[4]) || 0,
        settings: unpackSettings(type, parts.slice(5).join("|")),
      });
    } else if (parts[0] === "W" && parts.length >= 4) {
      wires.push({ id: parts[1] || `w${wires.length + 1}`, from: parts[2]!, to: parts[3]! });
    }
  }
  return { name, blocks, wires };
}

export function buildSheet(doc: Circuit): string[] {
  const steps: string[] = [];
  steps.push(
    "Trailmakers’ Lua API cannot spawn builder blocks or wire logic. Place these by hand, in order. A NOR with nothing connected is an always-on constant.",
  );
  const order = [...doc.blocks];
  order.forEach((block, index) => {
    const def = BLOCK_MAP[block.type];
    const n = index + 1;
    steps.push(`${n}. Place ${def.name} (${block.id}).`);
    const bits = settingNotes(block);
    if (bits.length) steps.push(`   Set ${bits.join("; ")}.`);
    const outs = doc.wires.filter((w) => w.from === block.id);
    if (outs.length) {
      const targets = outs
        .map((w) => {
          const dest = doc.blocks.find((b) => b.id === w.to);
          return dest ? `${BLOCK_MAP[dest.type].name} ${dest.id}` : w.to;
        })
        .join(", ");
      steps.push(
        `   Connect its output${block.settings.channel ? ` (logic channel ${block.settings.channel})` : ""} to ${targets}.`,
      );
    }
  });
  return steps;
}

function settingNotes(block: LogicBlock): string[] {
  const s = block.settings;
  const base = defaultSettings(block.type);
  const notes: string[] = [];
  if (s.output !== base.output && block.type !== "servo" && block.type !== "thruster" && block.type !== "hue") {
    notes.push(`output scale ${s.output}`);
  }
  if (s.greenKey) notes.push(`green key ${s.greenKey.toUpperCase()}`);
  if (s.redKey) notes.push(`red key ${s.redKey.toUpperCase()}`);
  if (s.togglePos) notes.push("toggle +");
  if (s.toggleNeg) notes.push("toggle −");
  if (s.delay) notes.push(`delay ${s.delay}s`);
  if (s.duration) notes.push(`duration ${s.duration}s`);
  if (s.pause) notes.push(`pause ${s.pause}s`);
  if (s.channel) notes.push(`logic channel ${s.channel}`);
  if (block.type === "compare") notes.push(`${s.compareMode} ${s.threshold}${s.clampInput ? ", clamp input" : ""}`);
  if (block.type === "arith") notes.push(`${s.arithOp} constant ${s.constant}`);
  if (block.type === "fn") notes.push(s.fn);
  if (block.type === "aggregate") notes.push(s.agg);
  if (block.type === "accum") notes.push(`bounds ${s.min}..${s.max}, scale ${s.scale}${s.useSteps ? ", stepped" : ", per second"}`);
  if (block.type === "random") notes.push(`${s.randomMode} ${s.min}..${s.max}`);
  if (block.type === "display" && s.roundMode !== "off") notes.push(`round ${s.roundMode}`);
  if (
    block.type === "distance" ||
    block.type === "altitude" ||
    block.type === "speed" ||
    block.type === "gravity" ||
    block.type === "position"
  ) {
    notes.push(`threshold ${s.threshold}, ${s.sensorMode}${s.invert ? ", below" : ""}${s.mute ? ", mute on input" : ""}`);
  }
  if (block.type === "angle" || block.type === "compass" || block.type === "aiming") {
    notes.push(`direction ${s.direction}°, width ${s.width}°, ${s.sensorMode}${s.invert ? ", outside" : ""}`);
  }
  if (block.type === "servo") notes.push(`angle ${s.angle}°`);
  if (block.type === "thruster") notes.push(`power ${s.power}`);
  if (block.type === "hue") notes.push(`saturation ${s.saturation}, brightness ${s.brightness}`);
  if (block.type === "sender" || block.type === "receiver") notes.push(`RC channel ${s.rcChannel}`);
  return notes;
}
