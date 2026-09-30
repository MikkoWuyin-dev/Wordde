import { killPreviewListener } from './helpers/preview-server';

/**
 * Global teardown: the offline spec respawns a preview server after its
 * mid-test kill (so later specs have a live server); this reaps it. Tolerant
 * of the port already being free.
 */
export default function globalTeardown(): void {
  killPreviewListener();
}
