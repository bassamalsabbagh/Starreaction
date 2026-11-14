export type Target = 'sun' | 'earth';
export interface NumericGrid {
  width: number; height: number; radius_m: number; source_pixel_spacing_m: number;
  nodata: number; geotransform: number[]; values: number[]; units: string;
}
export interface VisibilityFrame {
  target: Target; time_utc: string; image: string; numerical: string;
  rectangle_degrees: [number, number, number, number];
}
export interface VisibilityManifest {
  frames: VisibilityFrame[]; interval_minutes?: number; status?: string;
  pixel_spacing_m?: number; limitations?: string[]; colors?: Record<string, Record<string, string>>;
}
export function sampleVisibility(grid: NumericGrid, longitudeEastDegrees: number,
  latitudeDegrees: number): number | null;
export function loadVisibilityFrame(baseUrl: string, manifest: VisibilityManifest,
  target: Target, timeUTC: string, signal?: AbortSignal): Promise<{
    frame: VisibilityFrame; grid: NumericGrid; imageUrl: string;
  }>;
