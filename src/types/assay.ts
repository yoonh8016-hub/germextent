export interface Point {
  x: number;
  y: number;
}

export type CalibrationMode = 'disc' | 'dish' | 'custom';

export type MeasurementMethod = 'center-edge' | 'two-point' | 'three-point';

export type ToolMode = 'measure' | 'calibrate' | 'pan';

export type ControlType = 'none' | 'positive' | 'negative';

export interface CalibrationState {
  mode: CalibrationMode;
  p1: Point;
  p2: Point;
  knownMm: number;
  pixelsPerMm: number;
  isCalibrated: boolean;
}

export interface ImageAdjustments {
  brightness: number; // percentage: 50 to 200
  contrast: number; // percentage: 50 to 250
  grayscale: boolean;
  invert: boolean;
  clarityBoost: boolean;
}

export interface DraftCircle {
  center: Point;
  radiusPx: number;
  method: MeasurementMethod;
  anchorPoints: Point[];
}

export interface SampleMeasurement {
  id: string;
  index: number;
  sampleName: string;
  concentration: string;
  discDiameterMm: number;
  center: Point;
  radiusPx: number;
  zoneDiameterMm: number;
  zoneRadiusMm: number;
  totalAreaMm2: number;
  discAreaMm2: number;
  netAreaMm2: number;
  controlType: ControlType;
  visible: boolean;
  notes: string;
}

export interface ExperimentMeta {
  title: string;
  organism: string;
  medium: string;
  researcher: string;
  date: string;
}
