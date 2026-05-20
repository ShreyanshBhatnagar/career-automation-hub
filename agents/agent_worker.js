import pkg from 'bullmq';
const { Worker } = pkg;
import { redisConnection } from './lib/queue.js';
import { openDb, run } from '../database/db.js';
import JobAgentOrchestrator from './job_agent_orchestrator.js';
import { scoreOpportunity } from '../logic/relevance.js';

/**
 * Agent Worker
 *
 * Handles the heavy V3 Agentic Loop (Sourcer, Challenger, Tailor)
 * and scoring in the background.
 */
const agentWorker = new Worker('agent-evaluation-queue', async (job) => {
  const { id, sessionId } = job.data;
  console.log(`[AgentWorker] Evaluating Opportunity #${id} for Session ${sessionId.slice(0, 8)}...`);

  const db = openDb();
  const agent = new JobAgentOrchestrator({ db });

  try {
    // 1. Fetch Opportunity
    const { get } = await import('../database/db.js');
    const opp = await get(db, `SELECT * FROM opportunities WHERE id = ?`, [id]);
    if (!opp) return;

    // 2. Initial V2/V3 Scoring
    const scoring = scoreOpportunity(opp);

    // 3. V3 Adversarial Agent Loop
    const agentResult = await agent.processOpportunity(id);

    // 4. Update Database with Score, Notes, and Tailored Pitch
    const reasons = scoring.match_reasons.join(', ');
    await run(db, `
        UPDATE opportunities
        SET relevance_score = ?,
            notes = ?,
            status = 'Analyzed',
            tailored_pitch = ?
        WHERE id = ?
    `, [scoring.relevance_score, reasons, agentResult.tailored_pitch, id]);

    console.log(`[AgentWorker] Opportunity #${id} analysis complete. Score: ${scoring.relevance_score}`);
  } catch (e) {
    console.error(`[AgentWorker] Failed to evaluate #${id}:`, e.message);
    throw e;
  } finally {
    db.close();
  }
}, {
  connection: redisConnection,
  concurrency: 3, // Multi-agent loops are heavy, limit concurrency
});

console.log('🤖 Agent Evaluation Worker active and processing queue...');
