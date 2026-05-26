/**
 * Process 4: Social Signals Unconventional Discovery Worker
 * ──────────────────────────────────────────────────────────
 * Runs on its own independent queue loop (no BullMQ dependency).
 * Targets open social aggregation streams, community boards, and
 * public text posts (Reddit, HN, tech mailing lists, infra logs)
 * looking for indirect hiring phrases, custom hiring signals, and
 * undocumented startup domain links.
 *
 * When a confirmed target domain pattern is found it:
 *   1. Parses the clean root domain from the discovered URL
 *   2. Appends it to agents/sources.json under "unconventional_sources"
 *      without duplicating existing entries
 *   3. Upserts the raw opportunity into SQLite (state = "Raw Ingested")
 *
 * Runs completely independently — safe to start alongside worker.js
 * and agent_worker.js without any shared state or queue contention.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { openDb, run, get } from '../database/db.js';
import { smartFetch, stripHtml, extractLines } from './lib/fetch.js';
import { upsertOpportunity } from './lib/persist.js';

// ─── Paths ────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_PATH = path.resolve(__dirname, 'sources.json');

// ─── Tuning constants ─────────────────────────────────────────────────────────
const LOOP_INTERVAL_MS   = 4 * 60 * 1000;  // 4-minute cycle between full sweeps
const REQUEST_DELAY_MS   = 1800;            // polite delay between individual fetches
const MAX_POSTS_PER_FEED = 40;              // cap posts parsed per community feed
const SESSION_ID_PREFIX  = 'unconventional';

// ─── Indirect hiring signal patterns ─────────────────────────────────────────
// Matches phrases that appear in community posts before a formal job listing
// exists — e.g. "we're growing", "looking for someone who", "DM if interested"
const HIRING_SIGNAL_PATTERNS = [
  /\bwe(?:'re| are) (?:hiring|growing|looking for|building out)\b/i,
  /\blooking for (?:a |an )?(?:strong |senior |experienced )?(?:engineer|manager|lead|ops|pm|founder|head)\b/i,
  /\b(?:join(?:ing)? (?:our|the) team|come (?:build|work) with us)\b/i,
  /\b(?:open (?:role|position|headcount)|headcount (?:approved|open))\b/i,
  /\b(?:DM|ping|reach out|drop (?:a |your )?(?:CV|resume|mail))\b/i,
  /\b(?:stealth(?: mode)?|pre-launch|seed[- ]stage|series[- ][ab])\s+(?:startup|company|team)\b/i,
  /\b(?:founding|early[- ]stage)\s+(?:engineer|team|hire)\b/i,
  /\b(?:contract|freelance|consulting)\s+(?:opportunity|gig|role|work)\b/i,
  /\b(?:infrastructure|data.?center|substation|EPC|SAP|SCADA|HV|renewable)\s+(?:hiring|vacancy|opening|role)\b/i,
  /\b(?:project controls?|site manager|commissioning|procurement)\s+(?:needed|required|wanted|opening)\b/i,
];

// Domain patterns that indicate a legitimate company careers page or ATS
const DOMAIN_SIGNAL_PATTERNS = [
  /https?:\/\/(?:www\.)?([a-z0-9-]+\.(?:com|in|io|co\.in|org|net))\/(?:careers?|jobs?|hiring|openings?|vacancies?|work-with-us|join-us)/i,
  /https?:\/\/(?:jobs|careers|work|apply)\.([a-z0-9-]+\.(?:com|in|io|co\.in|org|net))/i,
  /https?:\/\/([a-z0-9-]+\.(?:com|in|io|co\.in|org|net))\/(?:about\/team|team\/join)/i,
  // ATS platforms that host company-specific subdomains
  /https?:\/\/([a-z0-9-]+)\.(?:greenhouse\.io|lever\.co|workable\.com|darwinbox\.in|keka\.com|zohorecruit\.com|recruitcrm\.io)/i,
];

// ─── Community feed sources to scan ──────────────────────────────────────────
// These are public, no-auth RSS / JSON feeds or scrapeable HTML pages.
const COMMUNITY_FEEDS = [
  // Hacker News "Who is Hiring?" threads (monthly, public JSON via Algolia)
  {
    name: 'HN Who Is Hiring',
    url: 'https://hn.algolia.com/api/v1/search?query=who+is+hiring&tags=story&hitsPerPage=20',
    type: 'hn_algolia',
    channel: 'hackernews',
  },
  // HN "Who wants to be hired?" — reverse signal: companies DM candidates
  {
    name: 'HN Who Wants To Be Hired',
    url: 'https://hn.algolia.com/api/v1/search?query=who+wants+to+be+hired&tags=story&hitsPerPage=10',
    type: 'hn_algolia',
    channel: 'hackernews',
  },
  // Reddit r/cscareerquestions new posts (public JSON)
  {
    name: 'Reddit r/cscareerquestions',
    url: 'https://www.reddit.com/r/cscareerquestions/new.json?limit=25&t=day',
    type: 'reddit_json',
    channel: 'reddit',
  },
  // Reddit r/IndiaJobs
  {
    name: 'Reddit r/IndiaJobs',
    url: 'https://www.reddit.com/r/IndiaJobs/new.json?limit=25&t=day',
    type: 'reddit_json',
    channel: 'reddit',
  },
  // Reddit r/IndiaTech — startup hiring signals
  {
    name: 'Reddit r/IndiaTech',
    url: 'https://www.reddit.com/r/IndiaTech/new.json?limit=25&t=day',
    type: 'reddit_json',
    channel: 'reddit',
  },
  // Reddit r/startups — "we're hiring" posts
  {
    name: 'Reddit r/startups',
    url: 'https://www.reddit.com/r/startups/new.json?limit=25&t=day',
    type: 'reddit_json',
    channel: 'reddit',
  },
  // Reddit r/RenewableEnergy — infra/ops hiring signals
  {
    name: 'Reddit r/RenewableEnergy',
    url: 'https://www.reddit.com/r/RenewableEnergy/new.json?limit=20&t=week',
    type: 'reddit_json',
    channel: 'reddit',
  },
  // Indie Hackers "hiring" board (public HTML)
  {
    name: 'Indie Hackers Jobs',
    url: 'https://www.indiehackers.com/jobs',
    type: 'html',
    channel: 'indiehackers',
  },
  // YC Work at a Startup (public HTML)
  {
    name: 'YC Work at a Startup',
    url: 'https://www.workatastartup.com/jobs?demographic=any&hasEquity=any&hasSalary=any&industry=any&interviewProcess=any&jobType=any&layout=list-compact&sortBy=created_desc&tab=any&usVisaNotRequired=any',
    type: 'html',
    channel: 'yc_startup',
  },
  // Wellfound (AngelList) India infra jobs (public HTML)
  {
    name: 'Wellfound India Infrastructure',
    url: 'https://wellfound.com/jobs?locations=India&role=operations',
    type: 'html',
    channel: 'wellfound',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the clean root domain from a URL string.
 * Returns null if the URL is not parseable.
 */
function extractRootDomain(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // Strip leading "www." for normalisation
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Extract the full careers URL from a text blob using DOMAIN_SIGNAL_PATTERNS.
 * Returns the first match or null.
 */
function extractCareersUrl(text) {
  for (const pattern of DOMAIN_SIGNAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * Check whether a text snippet contains at least one indirect hiring signal.
 */
function hasHiringSignal(text) {
  return HIRING_SIGNAL_PATTERNS.some((p) => p.test(text));
}

/**
 * Atomically read → deduplicate → write sources.json.
 * Appends the new entry under the "unconventional_sources" array.
 * Returns true if the entry was actually added (not a duplicate).
 */
function appendToSourcesJson(entry) {
  let sources;
  try {
    sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));
  } catch (e) {
    console.error('[UnconvDiscovery] Failed to read sources.json:', e.message);
    return false;
  }

  if (!Array.isArray(sources.unconventional_sources)) {
    sources.unconventional_sources = [];
  }

  // Deduplicate by URL (exact) and by root domain
  const existingUrls   = new Set(sources.unconventional_sources.map((s) => s.url));
  const existingDomains = new Set(sources.unconventional_sources.map((s) => s.domain));

  // Also check all other channel arrays so we never re-add a known portal
  const allKnownUrls = new Set([
    ...(sources.career_portals   || []).map((s) => s.url),
    ...(sources.hiring_boards    || []).map((s) => s.url),
    ...(sources.tenders_and_signals || []).map((s) => s.url),
  ]);

  if (
    existingUrls.has(entry.url) ||
    existingDomains.has(entry.domain) ||
    allKnownUrls.has(entry.url)
  ) {
    return false; // already tracked
  }

  sources.unconventional_sources.push(entry);

  try {
    writeFileSync(SOURCES_PATH, JSON.stringify(sources, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[UnconvDiscovery] Failed to write sources.json:', e.message);
    return false;
  }
}

// ─── Feed parsers ─────────────────────────────────────────────────────────────

/**
 * Parse Algolia HN search API response.
 * Returns an array of { title, text, url } objects.
 */
function parseHnAlgolia(json) {
  const hits = json?.hits || [];
  return hits.slice(0, MAX_POSTS_PER_FEED).map((h) => ({
    title: h.title || '',
    text:  (h.story_text || h.comment_text || h.title || ''),
    url:   h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
  }));
}

/**
 * Parse Reddit listing JSON response.
 * Returns an array of { title, text, url } objects.
 */
function parseRedditJson(json) {
  const children = json?.data?.children || [];
  return children.slice(0, MAX_POSTS_PER_FEED).map((c) => {
    const d = c.data || {};
    return {
      title: d.title || '',
      text:  `${d.title || ''} ${d.selftext || ''}`,
      url:   d.url || `https://reddit.com${d.permalink || ''}`,
    };
  });
}

/**
 * Parse generic HTML page into text lines.
 * Returns an array of { title, text, url } objects (one per meaningful line).
 */
function parseHtml(html, sourceUrl) {
  const text  = stripHtml(html);
  const lines = extractLines(text, 30, 600);
  return lines.slice(0, MAX_POSTS_PER_FEED).map((line) => ({
    title: line.slice(0, 100),
    text:  line,
    url:   sourceUrl,
  }));
}

// ─── Core scan logic ──────────────────────────────────────────────────────────

/**
 * Scan a single community feed.
 * Returns the count of new domain sources discovered.
 */
async function scanFeed(feed, db, sessionId) {
  const log = (msg) => console.log(`[UnconvDiscovery][${feed.channel}] ${msg}`);
  log(`Scanning: ${feed.name}`);

  const page = await smartFetch(feed.url, { type: 'basic', timeout: 15000 });
  if (!page.ok) {
    log(`Fetch failed (${page.status || page.error}) — skipping`);
    return 0;
  }

  // Parse feed into post objects
  let posts = [];
  try {
    if (feed.type === 'hn_algolia' || feed.type === 'reddit_json') {
      const json = JSON.parse(page.html);
      posts = feed.type === 'hn_algolia'
        ? parseHnAlgolia(json)
        : parseRedditJson(json);
    } else {
      posts = parseHtml(page.html, feed.url);
    }
  } catch (e) {
    log(`Parse error: ${e.message}`);
    return 0;
  }

  let discovered = 0;

  for (const post of posts) {
    const combinedText = `${post.title} ${post.text}`;

    // Gate 1: must contain at least one indirect hiring signal
    if (!hasHiringSignal(combinedText)) continue;

    // Gate 2: must contain a domain pattern pointing to a careers page
    const careersUrl = extractCareersUrl(combinedText) || extractCareersUrl(post.url);
    if (!careersUrl) continue;

    const domain = extractRootDomain(careersUrl);
    if (!domain) continue;

    // Derive a human-readable company name from the domain
    const companyName = domain
      .split('.')[0]
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const sourceEntry = {
      name:       `${companyName} (Unconventional Discovery)`,
      url:        careersUrl,
      domain,
      channel:    'unconventional',
      discovered_via: feed.channel,
      signal_snippet: combinedText.slice(0, 200),
      discovered_at:  new Date().toISOString(),
    };

    // Append to sources.json (deduplication handled inside)
    const added = appendToSourcesJson(sourceEntry);
    if (added) {
      log(`✅ New source appended → ${domain} (via ${feed.channel})`);
    }

    // Always upsert the raw opportunity into SQLite regardless of dedup
    // so the UI reflects the signal immediately
    try {
      await upsertOpportunity(db, run, {
        company_name:   companyName,
        role_title:     post.title.slice(0, 120) || `Hiring Signal — ${companyName}`,
        sector:         'Unconventional Discovery',
        location:       'India',
        source_url:     careersUrl,
        source_channel: feed.channel,
        source_type:    'unconventional_signal',
        is_offbeat:     1,
        raw_snippet:    combinedText.slice(0, 500),
        notes:          `Indirect hiring signal detected on ${feed.name}. Domain: ${domain}`,
        description:    post.text.slice(0, 1000),
        requirements:   '',
        scan_session_id: sessionId,
      });
    } catch (dbErr) {
      // Non-fatal — log and continue so we don't interrupt the loop
      log(`DB upsert warning for ${domain}: ${dbErr.message}`);
    }

    discovered++;
  }

  log(`Sweep complete — ${discovered} new signal(s) from ${posts.length} posts`);
  return discovered;
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function runDiscoveryLoop() {
  console.log('🔍 Unconventional Discovery Worker started — independent queue loop active');

  let cycleCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    cycleCount++;
    const sessionId = `${SESSION_ID_PREFIX}-${Date.now()}-${cycleCount}`;
    const db = openDb();

    console.log(`\n[UnconvDiscovery] ── Cycle #${cycleCount} | Session: ${sessionId} ──`);

    let totalDiscovered = 0;

    for (const feed of COMMUNITY_FEEDS) {
      try {
        const count = await scanFeed(feed, db, sessionId);
        totalDiscovered += count;
      } catch (err) {
        // Isolate per-feed failures — never crash the loop
        console.error(`[UnconvDiscovery] Feed error (${feed.name}):`, err.message);
      }

      // Polite inter-request delay
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }

    db.close();

    console.log(
      `[UnconvDiscovery] Cycle #${cycleCount} complete — ${totalDiscovered} new source(s) discovered. ` +
      `Next sweep in ${LOOP_INTERVAL_MS / 60000} min.`
    );

    // Wait for the next cycle
    await new Promise((r) => setTimeout(r, LOOP_INTERVAL_MS));
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
runDiscoveryLoop().catch((err) => {
  console.error('[UnconvDiscovery] Fatal loop error:', err);
  process.exit(1);
});
