import type { BlockType, Category, Settings } from "./types.ts";

export interface BlockDef {
  type: BlockType;
  name: string;
  category: Category;
  blurb: string;
  hasIn: boolean;
  hasOut: boolean;
}

export const CATEGORIES: { id: Category; title: string }[] = [
  { id: "sensor", title: "Sensors" },
  { id: "gate", title: "Logic gates" },
  { id: "math", title: "Math" },
  { id: "drive", title: "Driven" },
  { id: "radio", title: "Radio" },
];

export const BLOCKS: BlockDef[] = [
  { type: "distance", name: "Distance", category: "sensor", blurb: "Ray along the face", hasIn: true, hasOut: true },
  { type: "altitude", name: "Altitude", category: "sensor", blurb: "Height vs sea level", hasIn: true, hasOut: true },
  { type: "speed", name: "Speed", category: "sensor", blurb: "Speed along the arrow", hasIn: true, hasOut: true },
  { type: "angle", name: "Angle", category: "sensor", blurb: "Tilt from up", hasIn: true, hasOut: true },
  { type: "compass", name: "Compass", category: "sensor", blurb: "Heading vs north", hasIn: true, hasOut: true },
  { type: "gravity", name: "Gravity", category: "sensor", blurb: "Felt gravity", hasIn: true, hasOut: true },
  { type: "position", name: "Position", category: "sensor", blurb: "Lat / lon", hasIn: true, hasOut: true },
  { type: "aiming", name: "Aiming", category: "sensor", blurb: "Look direction", hasIn: true, hasOut: true },
  { type: "and", name: "AND", category: "gate", blurb: "Every input on", hasIn: true, hasOut: true },
  { type: "or", name: "OR", category: "gate", blurb: "Any input on", hasIn: true, hasOut: true },
  { type: "xor", name: "XOR", category: "gate", blurb: "Exactly one on", hasIn: true, hasOut: true },
  { type: "nor", name: "NOR", category: "gate", blurb: "Fires when the sum is 0", hasIn: true, hasOut: true },
  { type: "compare", name: "Compare", category: "math", blurb: "Sum vs threshold", hasIn: true, hasOut: true },
  { type: "arith", name: "Arithmetic", category: "math", blurb: "Constant ∘ sum", hasIn: true, hasOut: true },
  { type: "fn", name: "Function", category: "math", blurb: "Unary on the sum", hasIn: true, hasOut: true },
  { type: "aggregate", name: "Aggregate", category: "math", blurb: "Sum, product, min, max", hasIn: true, hasOut: true },
  { type: "accum", name: "Accumulator", category: "math", blurb: "Integrate the input", hasIn: true, hasOut: true },
  { type: "random", name: "Randomizer", category: "math", blurb: "Random in a range", hasIn: true, hasOut: true },
  { type: "display", name: "Number display", category: "math", blurb: "Shows the raw sum", hasIn: true, hasOut: true },
  { type: "hue", name: "Hue light", category: "drive", blurb: "Color from the sum", hasIn: true, hasOut: false },
  { type: "servo", name: "Servo", category: "drive", blurb: "Angle × clamped input", hasIn: true, hasOut: false },
  { type: "thruster", name: "Thruster", category: "drive", blurb: "Thrust × clamped input", hasIn: true, hasOut: false },
  { type: "sender", name: "RC sender", category: "radio", blurb: "Broadcast the input", hasIn: true, hasOut: false },
  { type: "receiver", name: "RC receiver", category: "radio", blurb: "Sum of matching senders", hasIn: false, hasOut: true },
];

export const BLOCK_MAP: Record<BlockType, BlockDef> = Object.fromEntries(
  BLOCKS.map((b) => [b.type, b]),
) as Record<BlockType, BlockDef>;

export function defaultSettings(type: BlockType): Settings {
  const base: Settings = {
    output: 1,
    greenKey: "",
    redKey: "",
    togglePos: false,
    toggleNeg: false,
    delay: 0,
    duration: 0,
    pause: 0,
    channel: 0,
    threshold: 0,
    compareMode: "gt",
    clampInput: false,
    min: 0,
    max: 1,
    scale: 1,
    useSteps: false,
    constant: 0,
    arithOp: "add",
    fn: "abs",
    agg: "sum",
    randomMode: "out",
    roundMode: "off",
    sensorMode: "trigger",
    invert: false,
    mute: false,
    direction: 0,
    width: 40,
    angle: 90,
    power: 100,
    saturation: 1,
    brightness: 1,
    rcChannel: 1,
  };
  if (type === "distance") base.threshold = 8;
  if (type === "altitude") base.threshold = 10;
  if (type === "speed") base.threshold = 20;
  if (type === "gravity") base.threshold = 1;
  if (type === "position") base.threshold = 50;
  if (type === "compare") base.threshold = 0;
  if (type === "accum") {
    base.min = 0;
    base.max = 10;
    base.scale = 1;
    base.useSteps = true;
  }
  if (type === "random") {
    base.min = 0;
    base.max = 1;
  }
  if (type === "nor") base.output = 1;
  return base;
}

export function defaultMeasure(type: BlockType): number {
  switch (type) {
    case "distance":
      return 12;
    case "altitude":
      return 0;
    case "speed":
      return 0;
    case "gravity":
      return 1;
    case "angle":
    case "compass":
    case "aiming":
      return 0;
    case "position":
      return 0;
    default:
      return 0;
  }
}

export function measureLabel(type: BlockType): string | null {
  switch (type) {
    case "distance":
      return "Hit distance (m)";
    case "altitude":
      return "Altitude (m)";
    case "speed":
      return "Speed (km/h)";
    case "gravity":
      return "Gravity (×)";
    case "angle":
      return "Tilt (deg)";
    case "compass":
      return "Heading (deg)";
    case "aiming":
      return "Aim angle (deg)";
    case "position":
      return "Position (m)";
    default:
      return null;
  }
}
