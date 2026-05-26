/**
 * logger.js — Structured JSON operational logger
 *
 * Outputs one JSON object per line to stdout/stderr so any log aggregator
 * (Datadog, CloudWatch, Loki, plain grep) can parse it without a schema.
 *
 * Schema:
 * {
 *   timestamp:       ISO-8601 string
 *   level:           "ERROR" | "WARN" | "INFO"
 *   context:         "API_SERVER" | "INGESTION_WORKER" | "EVAL_WORKER"
 *   message:         human-readable summary
 *   source_target:   URL / company name / job ID — whatever is relevant
 *   stack_trace:     err.stack or raw system error code (omitted when null)
 *   beyond_remarks:  operational payload, recovery action, or extra metadata
 * }
 *
 * Usage:
 *   import logger from '../api/utils/logger.js';
 *   logger.error('EVAL_WORKER', 'Agent loop failed', { source_target: `opp#${id}`, stack_trace: e.stack, beyond_remarks: 'BullMQ will retry' });
 *   logger.warn('INGESTION_WORKER', 'Rate-limited — backing off', { source_target: item.url });
 *   logger.info('API_SERVER', 'Server started', { beyond_remarks: `port ${PORT}` });
 */

/** @typedef {'API_SERVER'|'INGESTION_WORKER'|'EVAL_WORKER'} Context */
/** @typedef {'ERROR'|'WARN'|'INFO'} Level */

/**
 * @param {Level} level
 * @param {Context} context
 * @param {string} message
 * @param {{
 *   source_target?: string,
 *   stack_trace?:   string,
 *   beyond_remarks?: string | Record<string, unknown>
 * }} [meta]
 */
function write(level, context, message, meta = {}) {
  const entry = {
    timestamp:      new Date().toISOString(),
    level,
    context,
    message:        String(message),
    source_target:  meta.source_target  ?? null,
    stack_trace:    meta.stack_trace    ?? null,
    beyond_remarks: meta.beyond_remarks ?? null,
  };

  // Strip null fields to keep log lines lean — consumers should treat absence as null
  for (const key of Object.keys(entry)) {
    if (entry[key] === null) delete entry[key];
  }

  const line = JSON.stringify(entry);

  // ERROR → stderr, everything else → stdout
  if (level === 'ERROR') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/**
 * Convenience: build meta from a caught Error object.
 * Merges err.stack into stack_trace and any extra fields you pass.
 *
 * @param {Error} err
 * @param {object} [extra]
 * @returns {object}
 */
function fromError(err, extra = {}) {
  return {
    stack_trace: err?.stack ?? String(err),
    ...extra,
  };
}

const logger = {
  /**
   * @param {Context} context
   * @param {string} message
   * @param {object} [meta]
   */
  error: (context, message, meta) => write('ERROR', context, message, meta),

  /**
   * @param {Context} context
   * @param {string} message
   * @param {object} [meta]
   */
  warn:  (context, message, meta) => write('WARN',  context, message, meta),

  /**
   * @param {Context} context
   * @param {string} message
   * @param {object} [meta]
   */
  info:  (context, message, meta) => write('INFO',  context, message, meta),

  /** Helper — build meta from a caught Error */
  fromError,
};

export default logger;
