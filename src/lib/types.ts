export type SupportedElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "line"
  | "arrow"
  | "text";

export type Point = [number, number];

export type RawExcalidrawElement = {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  roundness?: unknown;
  points?: unknown;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  lineHeight?: number;
  containerId?: string;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  isDeleted?: boolean;
};

export type RawExcalidrawScene = {
  elements?: RawExcalidrawElement[];
  appState?: {
    viewBackgroundColor?: string;
  };
};

export type NormalizedElement = {
  id: string;
  type: SupportedElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "solid" | "hachure" | "cross-hatch";
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  roughness: number;
  opacity: number;
  roundness: number;
  points: Point[];
  text: string;
  fontSize: number;
  fontFamily: number;
  lineHeight: number;
  containerId?: string;
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
};

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type CoordinateTransform = {
  x: (rawX: number) => number;
  y: (rawY: number) => number;
  len: (rawLen: number) => number;
};

export type CliOptions = {
  in: string;
  out: string;
  padding: number;
  scale: number;
};
