export type SupportedElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "line"
  | "arrow"
  | "text"
  | "image";

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
  fileId?: string;
  crop?: unknown;
  scale?: unknown;
  isDeleted?: boolean;
};

export type RawSceneFile = {
  id?: string;
  mimeType?: string;
  dataURL?: string;
};

export type RawExcalidrawScene = {
  elements?: RawExcalidrawElement[];
  appState?: {
    viewBackgroundColor?: string;
  };
  files?: Record<string, RawSceneFile>;
};

export type NormalizedCommonElement = {
  id: string;
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
};

export type NormalizedShapeElement = NormalizedCommonElement & {
  type: "rectangle" | "ellipse" | "diamond";
};

export type NormalizedLineLikeElement = NormalizedCommonElement & {
  type: "line" | "arrow";
  points: Point[];
};

export type NormalizedTextElement = NormalizedCommonElement & {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: number;
  lineHeight: number;
  containerId?: string;
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
};

export type NormalizedImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NormalizedImageElement = NormalizedCommonElement & {
  type: "image";
  fileId: string;
  dataURL: string;
  mimeType: string;
  crop?: NormalizedImageCrop;
};

export type NormalizedElement =
  | NormalizedShapeElement
  | NormalizedLineLikeElement
  | NormalizedTextElement
  | NormalizedImageElement;

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
  printLicenses: boolean;
};
