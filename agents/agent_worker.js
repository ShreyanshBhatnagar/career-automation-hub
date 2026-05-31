import pkg from 'bullmq';
const { Worker } = pkg;
import { redisConnection } from './lib/queue.js';
import { openDb, run, get } from '../database/db.js';
import JobAgentOrchestrator from './job_agent_orchestrator.js';
import { scoreOpportunity } from '../logic/relevance.js';
import logger from '../api/utils/logger.js';

/**
 * Agent Evaluation Worker
 *
 * Consumes the `agent-evaluation-queue` and runs the full V4 adversarial
 * loop (Sourcer → Challenger → Tailor) for each opportunity.
 * Writes relevance_score, notes, and tailored_pitch back to SQLite.
 */
const agentWorker = new Worker('agent-evaluation-queue', async (job) => {
  const { id, sessionId } = job.data;
  console.log(`[AgentWorker] Evaluating Opportunity #${id} for Session ${sessionId?.slice(0, 8) ?? 'unknown'}…`);

  const db = openDb();
  const agent = new JobAgentOrchestrator({ db });

  try {
    // 1. Fetch opportunity — bail cleanly if it no longer exists
    const opp = await get(db, `SELECT * FROM opportunities WHERE id = ?`, [id]);
    if (!opp) {
      logger.warn('EVAL_WORKER', `Opportunity #${id} not found in DB — skipping job`, {
        source_target:  `opp#${id}`,
        beyond_remarks: `sessionId=${sessionId?.slice(0, 8)} | row may have been deleted before evaluation ran`,
      });
      return;
    }

    // 2. V3.2 scoring
    const scoring = scoreOpportunity(opp);

    // 3. V4 adversarial agent loop
    const agentResult = await agent.processOpportunity(id);
    if (!agentResult || !agentResult.agent_c) {
      throw new Error(`Agent loop returned no result for opportunity #${id}`);
    }

    // 4. Persist score, match reasons, and tailored pitch
    const reasons = scoring.match_reasons.join(', ');
    const coverage = agentResult.agent_a?.coverage_score ?? null;
    await run(db, `
      UPDATE opportunities
      SET relevance_score = ?,
          notes           = ?,
          status          = 'Analyzed',
          tailored_pitch  = ?,
          coverage_score  = ?
      WHERE id = ?
    `, [scoring.relevance_score, reasons, agentResult.agent_c.tailored_pitch, coverage, id]);

    logger.info('EVAL_WORKER', `Opportunity #${id} evaluated`, {
      source_target:  `${opp.company_name} — ${opp.role_title}`,
      beyond_remarks: `score=${scoring.relevance_score} verdict=${agentResult.loop_verdict} bridge_cards=${agentResult.agent_c.bridge_cards?.length ?? 0}`,
    });
  } catch (e) {
    logger.error('EVAL_WORKER', `Failed to evaluate opportunity #${id}: ${e.message}`, {
      source_target:  `opp#${id}`,
      stack_trace:    e.stack,
      beyond_remarks: `sessionId=${sessionId?.slice(0, 8)} attempt=${job.attemptsMade} | BullMQ will retry up to 2 times`,
    });
    throw e; // Re-throw so BullMQ applies retry/backoff
  } finally {
    db.close();
  }
}, {
  connection: redisConnection,
  concurrency: 3, // Multi-agent loops are heavy — keep concurrency low
});

agentWorker.on('completed', (job) => {
  logger.info('EVAL_WORKER', `Job ${job.id} completed`);
});

agentWorker.on('failed', (job, err) => {
  logger.error('EVAL_WORKER', `Job ${job?.id} failed: ${err.message}`, {
    source_target:  `opp#${job?.data?.id}`,
    stack_trace:    err.stack,
    beyond_remarks: `attempt=${job?.attemptsMade} | max_attempts=2 | check agent loop and DB connectivity`,
  });
});

logger.info('EVAL_WORKER', 'Agent Evaluation Worker started', {
  beyond_remarks: 'listening on agent-evaluation-queue | concurrency=3',
});
