import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultSettings } from "./catalog.ts";
import { createRuntime, hueCss, settle, stepCircuit } from "./engine.ts";
import type { BlockType, Circuit, LogicBlock, Settings } from "./types.ts";

let seq = 1;

function block(type: BlockType, patch: Partial<Settings> = {}, id?: string): LogicBlock {
  return {
    id: id ?? `b${seq++}`,
    type,
    x: 0,
    y: 0,
    settings: { ...defaultSettings(type), ...patch },
  };
}

function run(doc: Circuit, held: Record<string, number> = {}, ticks = 6) {
  return settle(doc, createRuntime(doc), held, ticks);
}

describe("trailmakers gate math", () => {
  it("AND scales the clamped sum, and a cancelling sum is off", () => {
    const a = block("arith", { constant: 0.8, arithOp: "add" }, "a");
    const b = block("arith", { constant: 0.5, arithOp: "add" }, "b");
    const g = block("and", { output: 0.5 }, "g");
    const doc: Circuit = {
      name: "and",
      blocks: [a, b, g],
      wires: [
        { id: "w1", from: "a", to: "g" },
        { id: "w2", from: "b", to: "g" },
      ],
    };
    const rt = run(doc);
    assert.equal(rt.blocks.g!.output, 0.5);

    const n = block("arith", { constant: -0.5, arithOp: "add" }, "n");
    const p = block("arith", { constant: 1, arithOp: "add" }, "p");
    const n2 = block("arith", { constant: -0.5, arithOp: "add" }, "n2");
    const and = block("and", { output: 1 }, "and");
    const cancel: Circuit = {
      name: "cancel",
      blocks: [p, n, n2, and],
      wires: [
        { id: "1", from: "p", to: "and" },
        { id: "2", from: "n", to: "and" },
        { id: "3", from: "n2", to: "and" },
      ],
    };
    assert.equal(run(cancel).blocks.and!.output, 0);
  });

  it("OR is any-on, but opposite values that sum to 0 stay off", () => {
    const hi = block("arith", { constant: 1, arithOp: "add" }, "hi");
    const lo = block("arith", { constant: -1, arithOp: "add" }, "lo");
    const g = block("or", {}, "g");
    const doc: Circuit = {
      name: "or",
      blocks: [hi, lo, g],
      wires: [
        { id: "1", from: "hi", to: "g" },
        { id: "2", from: "lo", to: "g" },
      ],
    };
    assert.equal(run(doc).blocks.g!.output, 0);
  });

  it("XOR is exactly one input, not odd parity", () => {
    const ones = ["a", "b", "c"].map((id) => block("arith", { constant: 1, arithOp: "add" }, id));
    const xor = block("xor", {}, "x");
    const two: Circuit = {
      name: "xor",
      blocks: [...ones, xor],
      wires: [
        { id: "1", from: "a", to: "x" },
        { id: "2", from: "b", to: "x" },
      ],
    };
    assert.equal(run(two).blocks.x!.output, 0);
    const one: Circuit = {
      name: "xor1",
      blocks: [ones[0]!, xor],
      wires: [{ id: "1", from: "a", to: "x" }],
    };
    assert.equal(run(one).blocks.x!.output, 1);
  });

  it("NOR replaces a zero sum with the output scale, including no inputs", () => {
    const lonely = block("nor", { output: 0.4 }, "n");
    assert.equal(run({ name: "n", blocks: [lonely], wires: [] }).blocks.n!.output, 0.4);

    const p = block("arith", { constant: 1, arithOp: "add" }, "p");
    const a = block("arith", { constant: -0.5, arithOp: "add" }, "a");
    const b = block("arith", { constant: -0.5, arithOp: "add" }, "b");
    const nor = block("nor", { output: 1 }, "nor");
    const doc: Circuit = {
      name: "nor",
      blocks: [p, a, b, nor],
      wires: [
        { id: "1", from: "p", to: "nor" },
        { id: "2", from: "a", to: "nor" },
        { id: "3", from: "b", to: "nor" },
      ],
    };
    assert.equal(run(doc).blocks.nor!.output, 1);
  });

  it("a configured keybind counts as an input even while released", () => {
    const src = block("arith", { constant: 1, arithOp: "add" }, "s");
    const g = block("and", { greenKey: "1" }, "g");
    const doc: Circuit = {
      name: "key",
      blocks: [src, g],
      wires: [{ id: "1", from: "s", to: "g" }],
    };
    assert.equal(run(doc, {}).blocks.g!.output, 0);
    assert.equal(run(doc, { "1": 1 }).blocks.g!.output, 1);
  });

  it("math blocks do not clamp, gates do", () => {
    const a = block("arith", { constant: 0.8 }, "a");
    const b = block("arith", { constant: 0.5 }, "b");
    const disp = block("display", {}, "d");
    const or = block("or", {}, "o");
    const doc: Circuit = {
      name: "clamp",
      blocks: [a, b, disp, or],
      wires: [
        { id: "1", from: "a", to: "d" },
        { id: "2", from: "b", to: "d" },
        { id: "3", from: "a", to: "o" },
        { id: "4", from: "b", to: "o" },
      ],
    };
    const rt = run(doc);
    assert.equal(rt.blocks.d!.output, 1.3);
    assert.equal(rt.blocks.o!.output, 1);
  });
});

describe("math blocks", () => {
  it("comparison uses 0.0005 equality and half-up rounding on < =", () => {
    const src = block("arith", { constant: 1.0004 }, "s");
    const eq = block("compare", { compareMode: "eq", threshold: 1, output: 1 }, "eq");
    const doc: Circuit = {
      name: "eq",
      blocks: [src, eq],
      wires: [{ id: "1", from: "s", to: "eq" }],
    };
    assert.equal(run(doc).blocks.eq!.output, 1);

    src.settings.constant = 1.002;
    const far = block("compare", { compareMode: "eq", threshold: 1 }, "far");
    assert.equal(
      run({
        name: "far",
        blocks: [src, far],
        wires: [{ id: "1", from: "s", to: "far" }],
      }).blocks.far!.output,
      0,
    );

    const edge = block("arith", { constant: 1.0004 }, "e");
    const le = block("compare", { compareMode: "le", threshold: 1, output: 1 }, "le");
    assert.equal(
      run({
        name: "le",
        blocks: [edge, le],
        wires: [{ id: "1", from: "e", to: "le" }],
      }).blocks.le!.output,
      1,
    );
  });

  it("arithmetic guards divide-by-zero and both 0^0 cases", () => {
    const div = block("arith", { arithOp: "div", constant: 5 }, "d");
    assert.equal(run({ name: "d", blocks: [div], wires: [] }).blocks.d!.output, 0);
    const pow = block("arith", { arithOp: "pow", constant: 0 }, "p");
    assert.equal(run({ name: "p", blocks: [pow], wires: [] }).blocks.p!.output, 1);
    const exp = block("arith", { arithOp: "exp", constant: 0 }, "e");
    assert.equal(run({ name: "e", blocks: [exp], wires: [] }).blocks.e!.output, 0);
  });

  it("variable division reads logic channels, trig uses degrees", () => {
    const num = block("arith", { constant: 6, channel: 0 }, "n");
    const den = block("arith", { constant: 2, channel: 1 }, "d");
    const vd = block("arith", { arithOp: "vardiv" }, "v");
    assert.equal(
      run({
        name: "vd",
        blocks: [num, den, vd],
        wires: [
          { id: "1", from: "n", to: "v" },
          { id: "2", from: "d", to: "v" },
        ],
      }).blocks.v!.output,
      3,
    );

    const ninety = block("arith", { constant: 90 }, "a");
    const fn = block("fn", { fn: "sin" }, "f");
    const out = run({
      name: "sin",
      blocks: [ninety, fn],
      wires: [{ id: "1", from: "a", to: "f" }],
    }).blocks.f!.output;
    assert.ok(Math.abs(out - 1) < 1e-9);

    const neg = block("arith", { constant: -4 }, "neg");
    const root = block("fn", { fn: "sqrt" }, "root");
    assert.equal(
      run({
        name: "sqrt",
        blocks: [neg, root],
        wires: [{ id: "1", from: "neg", to: "root" }],
      }).blocks.root!.output,
      0,
    );
  });

  it("steps an accumulator once per press and continuously per tick", () => {
    const acc = block("accum", { useSteps: true, scale: 1, min: 0, max: 10, greenKey: "1" }, "a");
    const doc: Circuit = { name: "acc", blocks: [acc], wires: [] };
    let rt = createRuntime(doc);
    rt = stepCircuit(doc, rt, { "1": 1 });
    assert.equal(rt.blocks.a!.output, 1);
    rt = stepCircuit(doc, rt, { "1": 1 });
    assert.equal(rt.blocks.a!.output, 1);
    rt = stepCircuit(doc, rt, {});
    rt = stepCircuit(doc, rt, { "1": 1 });
    assert.equal(rt.blocks.a!.output, 2);

    const cont = block("accum", { useSteps: false, scale: 60, min: -100, max: 100, greenKey: "2" }, "c");
    const live: Circuit = { name: "c", blocks: [cont], wires: [] };
    let rt2 = createRuntime(live);
    rt2 = stepCircuit(live, rt2, { "2": 1 });
    assert.ok(Math.abs(rt2.blocks.c!.output - 1) < 1e-9);
  });
});

describe("timers, sensors, hue", () => {
  it("delay holds the output off for floor(seconds * 60) ticks", () => {
    const g = block("or", { greenKey: "1", delay: 2 / 60 }, "g");
    const doc: Circuit = { name: "t", blocks: [g], wires: [] };
    let rt = createRuntime(doc);
    rt = stepCircuit(doc, rt, { "1": 1 });
    assert.equal(rt.blocks.g!.output, 0);
    rt = stepCircuit(doc, rt, { "1": 1 });
    assert.equal(rt.blocks.g!.output, 0);
    rt = stepCircuit(doc, rt, { "1": 1 });
    assert.equal(rt.blocks.g!.output, 1);
  });

  it("altitude triggers only above the threshold and can be muted", () => {
    const alt = block("altitude", { threshold: 10, output: 1 }, "s");
    const doc: Circuit = { name: "alt", blocks: [alt], wires: [] };
    let rt = createRuntime(doc);
    rt.blocks.s!.measure = 4;
    rt = stepCircuit(doc, rt, {});
    assert.equal(rt.blocks.s!.output, 0);
    rt.blocks.s!.measure = 12;
    rt = stepCircuit(doc, rt, {});
    assert.equal(rt.blocks.s!.output, 1);

    const muted = block("altitude", { threshold: 10, mute: true, greenKey: "1" }, "m");
    const mdoc: Circuit = { name: "m", blocks: [muted], wires: [] };
    let rt2 = createRuntime(mdoc);
    rt2.blocks.m!.measure = 20;
    rt2 = stepCircuit(mdoc, rt2, { "1": 1 });
    assert.equal(rt2.blocks.m!.output, 0);
  });

  it("hue is black at 0 and white at -1", () => {
    assert.equal(hueCss(0, 1, 1), "rgb(0, 0, 0)");
    assert.equal(hueCss(-1, 1, 1), "rgb(255, 255, 255)");
    assert.equal(hueCss(0.0001, 1, 1).startsWith("rgb("), true);
  });
});
