export type BlockType =
  | "and"
  | "or"
  | "xor"
  | "nor"
  | "compare"
  | "accum"
  | "random"
  | "arith"
  | "fn"
  | "aggregate"
  | "display"
  | "distance"
  | "altitude"
  | "speed"
  | "angle"
  | "compass"
  | "gravity"
  | "position"
  | "aiming"
  | "hue"
  | "servo"
  | "thruster"
  | "sender"
  | "receiver";

export type CompareMode = "lt" | "le" | "gt" | "ge" | "eq" | "ne";
export type ArithOp = "add" | "sub" | "mul" | "div" | "mod" | "pow" | "exp" | "vardiv";
export type FnOp =
  | "abs"
  | "sign"
  | "sqrt"
  | "sin"
  | "cos"
  | "tan"
  | "asin"
  | "acos"
  | "atan"
  | "floor"
  | "ceil"
  | "round"
  | "atan2"
  | "log2"
  | "ln"
  | "log10";
export type AggOp = "sum" | "product" | "min" | "max";
export type RandomMode = "out" | "change" | "range" | "split";
export type RoundMode = "off" | "nearest" | "floor" | "ceil";
export type SensorMode = "trigger" | "measure" | "normalized";
export type Category = "gate" | "math" | "sensor" | "drive" | "radio";

export interface Settings {
  output: number;
  greenKey: string;
  redKey: string;
  togglePos: boolean;
  toggleNeg: boolean;
  delay: number;
  duration: number;
  pause: number;
  channel: number;
  threshold: number;
  compareMode: CompareMode;
  clampInput: boolean;
  min: number;
  max: number;
  scale: number;
  useSteps: boolean;
  constant: number;
  arithOp: ArithOp;
  fn: FnOp;
  agg: AggOp;
  randomMode: RandomMode;
  roundMode: RoundMode;
  sensorMode: SensorMode;
  invert: boolean;
  mute: boolean;
  direction: number;
  width: number;
  angle: number;
  power: number;
  saturation: number;
  brightness: number;
  rcChannel: number;
}

export interface LogicBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  settings: Settings;
}

export interface Wire {
  id: string;
  from: string;
  to: string;
}

export interface Circuit {
  name: string;
  blocks: LogicBlock[];
  wires: Wire[];
}

export type Phase = "idle" | "delay" | "on" | "hold" | "pause" | "spent";

export interface BlockRuntime {
  output: number;
  meter: number;
  lastSum: number;
  latchSign: -1 | 0 | 1;
  latchValue: number;
  pendingOff: boolean;
  phase: Phase;
  frames: number;
  pauseLeft: number;
  stored: number;
  wasActive: boolean;
  lastRandom: number;
  randomInit: boolean;
  measure: number;
  transmit: number;
  debug: string;
}

export interface Runtime {
  tick: number;
  blocks: Record<string, BlockRuntime>;
}

export interface Signal {
  value: number;
  channel: number;
}
