import type * as Cesium from 'cesium';
import type { Target, VisibilityManifest } from './visibility-data.mjs';
export class CesiumVisibilityController {
  constructor(module: typeof Cesium, viewer: Cesium.Viewer, baseUrl: string,
    manifest: VisibilityManifest, onApplied?: (timeUTC: string) => void);
  static create(module: typeof Cesium, viewer: Cesium.Viewer, manifestUrl: string,
    onApplied?: (timeUTC: string) => void): Promise<CesiumVisibilityController>;
  supportedTimes: string[];
  manifest: VisibilityManifest;
  setTime(timeUTC: string): Promise<boolean>;
  setVisible(target: Target, visible: boolean): void;
  setOpacity(target: Target, alpha: number): void;
  sample(target: Target, longitudeEastDegrees: number, latitudeDegrees: number): {
    fraction: number; percentage: number; timeUTC: string; resolutionMeters: number;
  } | null;
  dispose(): void;
}
