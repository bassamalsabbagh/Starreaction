/**
 * A typed bridge to the team's vendored controller (./visibility, copied unchanged from their
 * handoff). The globe is a CesiumWidget, not a Viewer: the controller only uses `scene` and
 * `imageryLayers`, which the widget has with the same types (checked below). Only the three Cesium
 * classes it uses are passed, so the whole Cesium namespace is not pulled into the bundle.
 */
import {
  Ellipsoid,
  Rectangle,
  SingleTileImageryProvider,
  type CesiumWidget,
  type ImageryLayer,
  type Viewer,
} from 'cesium';
import type * as Cesium from 'cesium';
import { CesiumVisibilityController } from './visibility/cesium-visibility-controller.mjs';
import { VISIBILITY_TARGETS, type FrameRequester } from './visibilityLayer';

export type { CesiumVisibilityController };

/** The globe's one controller and the queue that feeds it frames. */
export interface VisibilityHandle {
  readonly controller: CesiumVisibilityController;
  readonly requester: FrameRequester;
}

/**
 * The controller's current Sun and Earth imagery layers. They live in its `layers` field, which
 * its declaration file leaves out; read here only to put them on top of the other layers.
 */
export function controllerLayers(controller: CesiumVisibilityController): ImageryLayer[] {
  const { layers } = controller as unknown as {
    layers?: Partial<Record<(typeof VISIBILITY_TARGETS)[number], ImageryLayer>>;
  };
  return VISIBILITY_TARGETS.flatMap((target) => {
    const layer = layers?.[target];
    return layer ? [layer] : [];
  });
}

const CESIUM_PARTS: Pick<typeof Cesium, 'Ellipsoid' | 'Rectangle' | 'SingleTileImageryProvider'> = {
  Ellipsoid,
  Rectangle,
  SingleTileImageryProvider,
};

/** Loads the manifest and makes the controller; rejects when the manifest cannot be read. */
export function createVisibilityController(
  widget: CesiumWidget,
  manifestUrl: string,
  onApplied: (timeUTC: string) => void,
): Promise<CesiumVisibilityController> {
  const host: Pick<Viewer, 'scene' | 'imageryLayers'> = widget;
  return CesiumVisibilityController.create(
    CESIUM_PARTS as typeof Cesium,
    host as Viewer,
    manifestUrl,
    onApplied,
  );
}
