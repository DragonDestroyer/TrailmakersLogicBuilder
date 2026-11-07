import { defaultMeasure } from "./catalog.ts";
import type {
  BlockRuntime,
  Circuit,
  LogicBlock,
  Phase,
  Runtime,
  Settings,
  Signal,
} from "./types.ts";

export interface StepOptions {
  /** Recompute outputs without advancing timers, memory, or toggle edges. */
  freeze?: boolean;
}

const TICK = 1 / 60;

export function clamp11(x: number): number {
  if (x > 1) return 1;
  if (x < -1) return -1;
  return x;
}

export function clamp(x: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function closestToZero(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (0 < lo) return lo;
  if (0 > hi) return hi;
  return 0;
}

function framesOf(seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.floor(seconds * 60 + 1e-8);
}

function blankRuntime(block: LogicBlock): BlockRuntime {
  const bounds = closestToZero(block.settings.min, block.settings.max);
  return {
    output: 0,
    meter: 0,
    lastSum: 0,
    latchSign: 0,
    latchValue: 0,
    pendingOff: false,
    phase: "idle",
    frames: 0,
    pauseLeft: 0,
    stored: block.type === "accum" ? bounds : 0,
    wasActive: false,
    lastRandom: 0,
    randomInit: false,
    measure: defaultMeasure(block.type),
    transmit: 0,
    debug: "—",
  };
}

export function createRuntime(doc: Circuit): Runtime {
  const blocks: Record<string, BlockRuntime> = {};
  for (const block of doc.blocks) blocks[block.id] = blankRuntime(block);
  return { tick: 0, blocks };
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 10000) / 10000;
  return String(r);
}

function isOn(v: number): boolean {
  return v !== 0;
}

function hsvToRgb(h: number, s: number, v: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) [rp, gp, bp] = [c, x, 0];
  else if (hh < 120) [rp, gp, bp] = [x, c, 0];
  else if (hh < 180) [rp, gp, bp] = [0, c, x];
  else if (hh < 240) [rp, gp, bp] = [0, x, c];
  else if (hh < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const r = Math.round((rp + m) * 255);
  const g = Math.round((gp + m) * 255);
  const b = Math.round((bp + m) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export function hueCss(x: number, saturation: number, brightness: number): string {
  if (x === 0 || !Number.isFinite(x)) return "rgb(0, 0, 0)";
  const sat = clamp(saturation, 0, 1);
  const bri = clamp(brightness, 0, 1);
  if (x > 0) {
    const mod = ((x % 1) + 1) % 1;
    return hsvToRgb(360 * mod, sat, bri);
  }
  const mod = ((x % 1) + 1) % 1;
  const g = Math.round(clamp((1 - mod) * bri, 0, 1) * 255);
  return `rgb(${g}, ${g}, ${g})`;
}

function round3HalfUp(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const scaled = Math.abs(x) * 1000;
  return (sign * Math.floor(scaled + 0.5)) / 1000;
}

function roundHalfEven(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const fl = Math.floor(ax);
  const frac = ax - fl;
  if (Math.abs(frac - 0.5) < 1e-9) {
    return sign * (fl % 2 === 0 ? fl : fl + 1);
  }
  return sign * Math.round(ax);
}

function safePow(base: number, exp: number, kind: "pow" | "exp"): number {
  if (base === 0 && exp === 0) return kind === "pow" ? 1 : 0;
  if (base < 0 && !Number.isInteger(exp)) return 0;
  const r = Math.pow(base, exp);
  return Number.isFinite(r) ? r : 0;
}

function angleDelta(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

function gather(
  block: LogicBlock,
  doc: Circuit,
  prev: Runtime,
  held: Record<string, number>,
): Signal[] {
  const list: Signal[] = [];
  for (const wire of doc.wires) {
    if (wire.to !== block.id) continue;
    const src = doc.blocks.find((b) => b.id === wire.from);
    const st = src ? prev.blocks[src.id] : undefined;
    if (!src || !st) continue;
    list.push({ value: st.output, channel: src.settings.channel });
  }
  const g = block.settings.greenKey;
  const r = block.settings.redKey;
  if (g || r) {
    const gv = g ? held[g] || 0 : 0;
    const rv = r ? held[r] || 0 : 0;
    list.push({ value: gv - rv, channel: 0 });
  }
  return list;
}

function channelSum(list: Signal[], channel: number): number {
  let s = 0;
  for (const item of list) if (item.channel === channel) s += item.value;
  return s;
}

function sumOf(list: Signal[]): number {
  let s = 0;
  for (const item of list) s += item.value;
  return s;
}

interface Control {
  list: Signal[];
  sum: number;
  blocking: boolean;
}

function control(
  block: LogicBlock,
  st: BlockRuntime,
  list: Signal[],
  freeze: boolean,
): Control {
  const sum = sumOf(list);
  if (freeze) {
    const effective = st.latchSign !== 0 ? st.latchValue : sum;
    const blocking = st.phase === "delay" || st.phase === "pause" || st.phase === "spent";
    const used = st.latchSign !== 0 ? [{ value: st.latchValue, channel: 0 }] : list;
    return { list: used, sum: effective, blocking };
  }

  if (st.lastSum === 0 && sum !== 0) {
    const sign: 1 | -1 = sum > 0 ? 1 : -1;
    if (st.latchSign === -sign) {
      st.latchSign = 0;
      st.pendingOff = false;
    }
    const enabled = sign > 0 ? block.settings.togglePos : block.settings.toggleNeg;
    if (enabled) {
      if (st.latchSign === sign) st.pendingOff = true;
      else {
        st.latchSign = sign;
        st.latchValue = sum;
        st.pendingOff = false;
      }
    }
  }
  if (sum === 0 && st.pendingOff) {
    st.latchSign = 0;
    st.pendingOff = false;
  }
  st.lastSum = sum;

  const latched = st.latchSign !== 0;
  const effective = latched ? st.latchValue : sum;
  const used = latched ? [{ value: st.latchValue, channel: 0 }] : list;
  const off = { list: used, sum: effective, blocking: false };

  if (effective === 0) {
    st.phase = "idle";
    st.frames = 0;
    st.pauseLeft = 0;
    return off;
  }

  const set = block.settings;
  if (st.phase === "idle") {
    const d = framesOf(set.delay);
    if (d > 0) {
      st.phase = "delay";
      st.frames = d;
      return { ...off, blocking: true };
    }
    const phase = enterActive(st, set);
    return { ...off, blocking: phase === "spent" };
  }

  if (st.phase === "delay") {
    st.frames -= 1;
    if (st.frames > 0) return { ...off, blocking: true };
    const phase = enterActive(st, set);
    return { ...off, blocking: phase === "spent" };
  }

  if (st.phase === "pause") {
    st.pauseLeft -= TICK;
    if (st.pauseLeft > 1e-6) return { ...off, blocking: true };
    const phase = enterActive(st, set);
    return { ...off, blocking: phase === "spent" };
  }

  if (st.phase === "on") {
    st.frames -= 1;
    if (st.frames <= 0) {
      if (set.pause <= 0) {
        st.phase = "spent";
        return { ...off, blocking: true };
      }
      st.phase = "pause";
      st.pauseLeft = set.pause;
      return { ...off, blocking: true };
    }
  }

  if (st.phase === "spent") return { ...off, blocking: true };
  return off;
}

function enterActive(st: BlockRuntime, set: Settings): Phase {
  if (set.duration <= 0) {
    st.phase = "hold";
    return st.phase;
  }
  const dur = framesOf(set.duration);
  if (dur <= 0) {
    st.phase = "spent";
    return st.phase;
  }
  st.phase = "on";
  st.frames = dur;
  return st.phase;
}

function sensorFired(block: LogicBlock, measure: number): boolean {
  const s = block.settings;
  let inside = false;
  if (block.type === "distance") {
    inside = measure >= -0.125 && measure <= s.threshold;
  } else if (block.type === "angle" || block.type === "compass" || block.type === "aiming") {
    inside = angleDelta(measure, s.direction) <= s.width / 2;
  } else {
    inside = s.invert ? measure < s.threshold : measure > s.threshold;
    return inside;
  }
  return s.invert ? !inside : inside;
}

function sensorRaw(block: LogicBlock, measure: number): number {
  const s = block.settings;
  if (s.sensorMode === "trigger") return 1;
  if (s.sensorMode === "measure") {
    return block.type === "speed" ? measure / 3.6 : measure;
  }
  const den =
    block.type === "angle" || block.type === "compass" || block.type === "aiming"
      ? s.width
      : s.threshold;
  if (den === 0) return block.type === "speed" ? measure / 3.6 : measure;
  const num = block.type === "speed" ? measure / 3.6 : measure;
  return num / den;
}

function gateValue(type: LogicBlock["type"], list: Signal[], scale: number): { value: number; debug: string } {
  const values = list.map((s) => s.value);
  const sum = values.reduce((a, b) => a + b, 0);
  const ons = values.filter(isOn).length;
  let pass = false;
  if (type === "and") pass = values.length > 0 && ons === values.length;
  else if (type === "or") pass = ons > 0;
  else if (type === "xor") pass = ons === 1;
  else if (type === "nor") pass = sum === 0;
  if (!pass) {
    return {
      value: 0,
      debug: `${type.toUpperCase()} off · inputs [${values.map(fmt).join(", ") || "—"}]`,
    };
  }
  if (type === "nor") {
    return {
      value: scale,
      debug: `NOR sum 0 → output scale ${fmt(scale)} (sum is replaced)`,
    };
  }
  const clamped = clamp11(sum);
  const value = scale * clamped;
  return {
    value,
    debug: `${type.toUpperCase()} on · sum ${fmt(sum)} clamp ${fmt(clamped)} × ${fmt(scale)} = ${fmt(value)}`,
  };
}

function comparePass(lhs: number, mode: Settings["compareMode"], threshold: number): boolean {
  if (mode === "eq") return Math.abs(lhs - threshold) < 0.0005;
  if (mode === "ne") return Math.abs(lhs - threshold) >= 0.0005;
  if (mode === "le") return round3HalfUp(lhs) <= threshold;
  if (mode === "lt") return lhs < threshold;
  if (mode === "ge") return lhs >= threshold;
  return lhs > threshold;
}

function evalMath(
  block: LogicBlock,
  st: BlockRuntime,
  list: Signal[],
  sum: number,
  rng: () => number,
  freeze: boolean,
): { value: number; debug: string } {
  const s = block.settings;
  if (block.type === "compare") {
    const lhs = s.clampInput ? clamp11(sum) : sum;
    const pass = comparePass(lhs, s.compareMode, s.threshold);
    const value = pass ? s.output : 0;
    return {
      value,
      debug: `compare ${fmt(lhs)} ${s.compareMode} ${fmt(s.threshold)} → ${pass ? fmt(value) : "off"}`,
    };
  }
  if (block.type === "display") {
    return { value: sum, debug: `display raw sum ${fmt(sum)}` };
  }
  if (block.type === "aggregate") {
    if (list.length === 0) return { value: 0, debug: "aggregate (no inputs) → 0" };
    const vals = list.map((i) => i.value);
    let value = 0;
    if (s.agg === "sum") value = vals.reduce((a, b) => a + b, 0);
    else if (s.agg === "product") value = vals.reduce((a, b) => a * b, 1);
    else if (s.agg === "min") value = Math.min(...vals);
    else value = Math.max(...vals);
    return { value, debug: `${s.agg} [${vals.map(fmt).join(", ")}] = ${fmt(value)}` };
  }
  if (block.type === "arith") {
    const x = sum;
    const c = s.constant;
    let value = 0;
    if (s.arithOp === "add") value = c + x;
    else if (s.arithOp === "sub") value = c - x;
    else if (s.arithOp === "mul") value = c * x;
    else if (s.arithOp === "div") value = x === 0 ? 0 : c / x;
    else if (s.arithOp === "mod") value = x === 0 ? 0 : c % x;
    else if (s.arithOp === "pow") value = safePow(x, c, "pow");
    else if (s.arithOp === "exp") value = safePow(c, x, "exp");
    else {
      const den = channelSum(list, 1);
      const num = channelSum(list, 0);
      value = den === 0 ? 0 : num / den;
    }
    return { value, debug: `${s.arithOp} → ${fmt(value)}` };
  }
  if (block.type === "fn") {
    const x = sum;
    let value = 0;
    const bad = () => 0;
    switch (s.fn) {
      case "abs":
        value = Math.abs(x);
        break;
      case "sign":
        value = Math.sign(x);
        break;
      case "sqrt":
        value = x < 0 ? bad() : Math.sqrt(x);
        break;
      case "sin":
        value = Math.sin((x * Math.PI) / 180);
        break;
      case "cos":
        value = Math.cos((x * Math.PI) / 180);
        break;
      case "tan": {
        const t = Math.tan((x * Math.PI) / 180);
        value = Number.isFinite(t) ? t : 0;
        break;
      }
      case "asin":
        value = x < -1 || x > 1 ? 0 : (Math.asin(x) * 180) / Math.PI;
        break;
      case "acos":
        value = x < -1 || x > 1 ? 0 : (Math.acos(x) * 180) / Math.PI;
        break;
      case "atan":
        value = (Math.atan(x) * 180) / Math.PI;
        break;
      case "floor":
        value = Math.floor(x);
        break;
      case "ceil":
        value = Math.ceil(x);
        break;
      case "round":
        value = roundHalfEven(x);
        break;
      case "atan2":
        value = (Math.atan2(channelSum(list, 0), channelSum(list, 1)) * 180) / Math.PI;
        break;
      case "log2":
        value = x <= 0 ? 0 : Math.log2(x);
        break;
      case "ln":
        value = x <= 0 ? 0 : Math.log(x);
        break;
      case "log10":
        value = x <= 0 ? 0 : Math.log10(x);
        break;
      default:
        value = 0;
    }
    return { value, debug: `${s.fn}(${fmt(x)}) = ${fmt(value)}` };
  }
  if (block.type === "random") {
    if (freeze && st.randomInit) {
      return { value: st.lastRandom, debug: `random held ${fmt(st.lastRandom)}` };
    }
    const lo = Math.min(s.min, s.max);
    const hi = Math.max(s.min, s.max);
    const roll = () => lo + rng() * (hi - lo);
    if (!st.randomInit) {
      st.randomInit = true;
      st.lastRandom = s.randomMode === "range" || s.randomMode === "split" ? roll() : 0;
    }
    const active = isOn(sum);
    let value = st.lastRandom;
    if (s.randomMode === "out") {
      value = active ? roll() : 0;
      st.lastRandom = value;
    } else if (s.randomMode === "change") {
      if (active) {
        value = roll();
        st.lastRandom = value;
      } else value = st.lastRandom;
    } else if (s.randomMode === "range") {
      if (active) {
        const vals = list.map((i) => i.value);
        const a = Math.min(...vals);
        const b = Math.max(...vals);
        const left = Math.max(lo, Math.min(a, b));
        const right = Math.min(hi, Math.max(a, b));
        if (left <= right) value = left + rng() * (right - left);
        else if (vals.some(isOn)) value = roll();
        else value = 0;
        st.lastRandom = value;
      } else value = st.lastRandom;
    } else {
      const neg = list.some((i) => i.value < 0);
      const pos = list.some((i) => i.value > 0);
      if (neg) {
        st.lastRandom = roll();
      }
      value = pos ? st.lastRandom : 0;
    }
    return { value, debug: `random ${s.randomMode} → ${fmt(value)}` };
  }
  if (block.type === "accum") {
    return { value: st.stored, debug: `accumulator ${fmt(st.stored)}` };
  }
  return { value: sum, debug: fmt(sum) };
}

function integrate(block: LogicBlock, st: BlockRuntime, sum: number, blocking: boolean) {
  if (block.type !== "accum") return;
  const accepting = !blocking && sum !== 0;
  if (accepting && block.settings.useSteps && !st.wasActive) {
    st.stored += sum * block.settings.scale;
  } else if (accepting && !block.settings.useSteps) {
    st.stored += (sum * block.settings.scale) / 60;
  }
  st.stored = clamp(st.stored, block.settings.min, block.settings.max);
  st.wasActive = accepting;
}

export function stepCircuit(
  doc: Circuit,
  prev: Runtime,
  held: Record<string, number>,
  rng: () => number = Math.random,
  opts: StepOptions = {},
): Runtime {
  const freeze = opts.freeze === true;
  const next: Runtime = {
    tick: prev.tick + (freeze ? 0 : 1),
    blocks: {},
  };
  for (const block of doc.blocks) {
    const old = prev.blocks[block.id] ?? blankRuntime(block);
    next.blocks[block.id] = { ...old };
  }

  const rcPrev = new Map<number, number>();
  for (const block of doc.blocks) {
    if (block.type !== "sender") continue;
    const st = prev.blocks[block.id];
    if (!st) continue;
    rcPrev.set(block.settings.rcChannel, (rcPrev.get(block.settings.rcChannel) ?? 0) + st.transmit);
  }

  for (const block of doc.blocks) {
    const st = next.blocks[block.id]!;
    const incoming = gather(block, doc, prev, held);
    if (block.type === "receiver") {
      const value = rcPrev.get(block.settings.rcChannel) ?? 0;
      st.output = value;
      st.meter = value;
      st.transmit = 0;
      st.debug = `RC ch ${block.settings.rcChannel} → ${fmt(value)}`;
      continue;
    }

    const ctrl = control(block, st, incoming, freeze);
    if (!freeze) integrate(block, st, ctrl.sum, ctrl.blocking);

    if (ctrl.blocking) {
      st.output = block.type === "accum" ? st.stored : 0;
      st.meter = st.output;
      st.transmit = 0;
      if (block.type === "hue") st.meter = 0;
      if (block.type === "servo" || block.type === "thruster") st.meter = 0;
      st.debug = `timer ${st.phase} · output forced off`;
      if (block.type === "accum") st.debug = `accumulator held ${fmt(st.stored)}`;
      continue;
    }

    if (block.type === "and" || block.type === "or" || block.type === "xor" || block.type === "nor") {
      const g = gateValue(block.type, ctrl.list, block.settings.output);
      st.output = g.value;
      st.meter = g.value;
      st.debug = g.debug;
    } else if (
      block.type === "compare" ||
      block.type === "arith" ||
      block.type === "fn" ||
      block.type === "aggregate" ||
      block.type === "display" ||
      block.type === "random" ||
      block.type === "accum"
    ) {
      const m = evalMath(block, st, ctrl.list, ctrl.sum, rng, freeze);
      st.output = m.value;
      st.meter = m.value;
      st.debug = m.debug;
    } else if (
      block.type === "distance" ||
      block.type === "altitude" ||
      block.type === "speed" ||
      block.type === "angle" ||
      block.type === "compass" ||
      block.type === "gravity" ||
      block.type === "position" ||
      block.type === "aiming"
    ) {
      const fired = sensorFired(block, st.measure);
      const muted = block.settings.mute && incoming.some((i) => isOn(i.value));
      const value = fired && !muted ? sensorRaw(block, st.measure) * block.settings.output : 0;
      st.output = value;
      st.meter = value;
      st.debug = `${fired ? "triggered" : "idle"}${muted ? " · muted" : ""} → ${fmt(value)}`;
    } else if (block.type === "hue") {
      st.output = 0;
      st.meter = ctrl.sum;
      st.debug = `hue ${fmt(ctrl.sum)}`;
    } else if (block.type === "servo") {
      const angle = block.settings.angle * clamp11(ctrl.sum);
      st.output = 0;
      st.meter = angle;
      st.debug = `servo ${fmt(block.settings.angle)}° × clamp(${fmt(ctrl.sum)}) = ${fmt(angle)}°`;
    } else if (block.type === "thruster") {
      const thrust = block.settings.power * clamp11(ctrl.sum);
      st.output = 0;
      st.meter = thrust;
      st.debug = `thrust ${fmt(block.settings.power)} × clamp(${fmt(ctrl.sum)}) = ${fmt(thrust)}`;
    } else if (block.type === "sender") {
      st.output = 0;
      st.meter = ctrl.sum;
      st.transmit = ctrl.sum;
      st.debug = `transmit ${fmt(ctrl.sum)} on RC ${block.settings.rcChannel}`;
    }
  }
  return next;
}

export function settle(
  doc: Circuit,
  rt: Runtime,
  held: Record<string, number>,
  times = 8,
): Runtime {
  let cur = rt;
  for (let i = 0; i < times; i++) cur = stepCircuit(doc, cur, held);
  return cur;
}

export function propagate(
  doc: Circuit,
  rt: Runtime,
  held: Record<string, number>,
  times = 8,
): Runtime {
  let cur = rt;
  for (let i = 0; i < times; i++) cur = stepCircuit(doc, cur, held, Math.random, { freeze: true });
  return cur;
}

export function displayNumber(block: LogicBlock, value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (block.type === "display") {
    const mode = block.settings.roundMode;
    let shown = value;
    if (mode === "nearest") shown = roundHalfEven(value);
    else if (mode === "floor") shown = Math.floor(value);
    else if (mode === "ceil") shown = Math.ceil(value);
    else {
      const sign = value < 0 ? -1 : 1;
      shown = (sign * Math.floor(Math.abs(value) * 100 + 0.5)) / 100;
    }
    if (Math.abs(shown) > 1000) return shown.toExponential(1);
    return fmt(shown);
  }
  if (block.type === "servo") return `${fmt(value)}°`;
  return fmt(value);
}

export function phaseLabel(phase: Phase): string {
  if (phase === "idle") return "idle";
  if (phase === "delay") return "delay";
  if (phase === "on") return "duration";
  if (phase === "hold") return "held";
  if (phase === "pause") return "pause";
  return "finished";
}
