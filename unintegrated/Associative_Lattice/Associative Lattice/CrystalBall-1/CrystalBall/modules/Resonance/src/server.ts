// ============================================================
// SERVER ENTRY POINT
// ============================================================

import express from 'express';
import { TrajectoryStore } from './trajectory/store';
import { AuthorshipSignatureEngine } from './ase/signature';
import { IDLStore } from './idl/store';
import { FeedGenerator } from './feed/generator';
import { createRouter } from './api/routes';

const PORT  = process.env.PORT ? parseInt(process.env.PORT) : 4747;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const DATA_DIR = process.env.DATA_DIR || './data';

const app = express();
app.use(express.json({ limit: '2mb' }));

const store = new TrajectoryStore({ dataDir: `${DATA_DIR}/trajectories`, maxSignalsPerUser: 500 });
const ase   = new AuthorshipSignatureEngine({ dataDir: `${DATA_DIR}/signatures`, emaAlpha: 0.15, driftThreshold: 0.12, minSamples: 5 });
const idlStore = new IDLStore(`${DATA_DIR}/idl`);
const feedGenerator = new FeedGenerator(store, idlStore);

const router = createRouter({ store, ase, idlStore, feedGenerator, extractorConfig: { apiKey: API_KEY, llmThreshold: 0.55 } });

app.use('/api', router);

app.listen(PORT, () => {
  console.log(`[resonance-engine] :${PORT}  data=${DATA_DIR}  llm=${API_KEY ? 'on' : 'off (heuristic only)'}`);
});

export { app };
