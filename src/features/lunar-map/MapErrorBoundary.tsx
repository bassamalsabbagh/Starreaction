import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './MapErrorBoundary.module.css';

interface MapErrorBoundaryProps {
  children: ReactNode;
}

interface MapErrorBoundaryState {
  failed: boolean;
}

/**
 * Keeps a map failure to the map. Without it, a browser without WebGL, a blocked graphics card or a
 * map chunk that fails to load would blank the whole app; with it, only the 3D Moon is replaced by
 * a short note and the panels, checks and timeline keep working. A class, because React catches
 * render and effect errors only in class components.
 */
export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('The 3D Moon could not start.', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={styles.fallback} role="status">
        <p className={styles.title}>The 3D Moon couldn’t start in this browser.</p>
        <p className={styles.text}>
          It needs WebGL (graphics acceleration). Everything else still works: the sites and their
          checks, the timeline, Compare and Lessons. Turn on hardware acceleration in the
          browser&apos;s settings, or try another browser, then reload.
        </p>
      </div>
    );
  }
}
