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
  strokeWidth?: number;
  opacity?: number;
  points?: unknown;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  lineHeight?: number;
  isDeleted?: boolean;
};

export type RawExcalidrawScene = {
  elements?: RawExcalidrawElement[];
  appState?: {
    viewBackgroundColor?: string;
  };
};

export type NormalizedElement = {
  type: SupportedElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  opacity: number;
  points: Point[];
  text: string;
  fontSize: number;
  fontFamily: number;
  lineHeight: number;
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
