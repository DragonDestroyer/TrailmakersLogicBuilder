import { defaultSettings } from "./catalog.ts";
import type { Circuit, LogicBlock } from "./types.ts";

function b(id: string, type: LogicBlock["type"], x: number, y: number, patch: Partial<LogicBlock["settings"]> = {}): LogicBlock {
  return { id, type, x, y, settings: { ...defaultSettings(type), ...patch } };
}

export const EXAMPLES: { id: string; name: string; note: string; circuit: Circuit }[] = [
  {
    id: "bench",
    name: "Signal bench",
    note: "AND clamps 0.8+0.5 to 1, then × 0.5. The number display keeps 1.3. The loose NOR is an always-on 1.",
    circuit: {
      name: "Signal bench",
      blocks: [
        b("a", "arith", 40, 48, { constant: 0.8, arithOp: "add" }),
        b("c", "arith", 40, 196, { constant: 0.5, arithOp: "add" }),
        b("and", "and", 280, 110, { output: 0.5 }),
        b("disp", "display", 280, 280),
        b("nor", "nor", 40, 380, { output: 1 }),
        b("servo", "servo", 280, 400, { angle: 90 }),
      ],
      wires: [
        { id: "w1", from: "a", to: "and" },
        { id: "w2", from: "c", to: "and" },
        { id: "w3", from: "a", to: "disp" },
        { id: "w4", from: "c", to: "disp" },
        { id: "w5", from: "nor", to: "servo" },
      ],
    },
  },
  {
    id: "cancel",
    name: "Cancelling OR",
    note: "1 and −1 are both “on”, but the sum is 0, so the OR sends nothing. That is the game, not boolean logic.",
    circuit: {
      name: "Cancelling OR",
      blocks: [
        b("p", "arith", 48, 80, { constant: 1 }),
        b("n", "arith", 48, 240, { constant: -1 }),
        b("o", "or", 300, 150),
        b("servo", "servo", 540, 150, { angle: 90 }),
      ],
      wires: [
        { id: "w1", from: "p", to: "o" },
        { id: "w2", from: "n", to: "o" },
        { id: "w3", from: "o", to: "servo" },
      ],
    },
  },
  {
    id: "nand",
    name: "NAND from NOR",
    note: "Hold 1 and 2 together. AND only passes when both are down; NOR then goes quiet. Either key alone leaves the servo at 90°.",
    circuit: {
      name: "NAND",
      blocks: [
        b("and", "and", 80, 140, { greenKey: "1" }),
        b("k", "or", 80, 300, { greenKey: "2" }),
        b("nor", "nor", 340, 210),
        b("servo", "servo", 580, 210, { angle: 90 }),
      ],
      wires: [
        { id: "w1", from: "k", to: "and" },
        { id: "w2", from: "and", to: "nor" },
        { id: "w3", from: "nor", to: "servo" },
      ],
    },
  },
  {
    id: "counter",
    name: "Step counter",
    note: "Tap 1. The accumulator adds the latched input once per press, clamped to 0…5, and the display shows it.",
    circuit: {
      name: "Step counter",
      blocks: [
        b("acc", "accum", 80, 140, { greenKey: "1", useSteps: true, scale: 1, min: 0, max: 5 }),
        b("disp", "display", 340, 140),
      ],
      wires: [{ id: "w1", from: "acc", to: "disp" }],
    },
  },
  {
    id: "altitude",
    name: "Altitude cutoff",
    note: "Drag the altitude sensor’s world value. It stays off at or below 25 m and passes its output scale once you climb past it.",
    circuit: {
      name: "Altitude cutoff",
      blocks: [
        b("alt", "altitude", 60, 150, { threshold: 25, output: 0.7, sensorMode: "trigger" }),
        b("servo", "servo", 340, 150, { angle: 40 }),
      ],
      wires: [{ id: "w1", from: "alt", to: "servo" }],
    },
  },
];
