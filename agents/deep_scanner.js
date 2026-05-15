/**
 * @deprecated Use: npm run scan  OR  POST /scan/run
 */
import { runDeepScan } from './orchestrator.js';

runDeepScan()
  .then((r) => console.log('Scan complete:', r))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
