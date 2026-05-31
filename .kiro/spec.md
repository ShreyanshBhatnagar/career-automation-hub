# Architectural Specification: Dual-Track Execution & Arbitrage Engine

## 1. System Topology & Process Isolation
The system must maintain strict runtime boundaries between processes via separate entry points to isolate faults completely:
- Process 1: Express App UI Backend Server (`api/server.js`)
- Process 2: Distributed Raw Crawler Worker (`agents/worker.js`)
- Process 3: Asynchronous AI Evaluation Worker (`agents/agent_worker.js`)
- Process 4: Social Signals Unconventional Discovery Worker (`agents/unconventional_discovery.js`)

## 2. Ingestion & Storage Decoupling (X/Y Task Allocation)
- Discovery workers must focus entirely on raw text extraction, writing listings to SQLite with state `Raw Ingested` and `score = NULL`.
- Data persistence must execute an immediate single-record database flush (`upsertOpportunity`) to ensure data transparency instantly on the UI without waiting for an execution batch to finish.
- The heavy AI multi-agent loop must process data asynchronously out of the `agent-evaluation-queue` backlogged in Redis.

## 3. Human-In-The-Loop (HITL) Tri-Pane Workspace
The UI dashboard must render an execution workspace partitioned into three specific operational blocks:
- Pane 1: Direct Clearances Block (Automated matches scoring >0.85 with no structural skill deficiencies).
- Pane 2: The Project Bridge Lab (Roles with matching core scale leverage but missing explicit sub-tools. Agent prompts a "Bro-to-Bro" alignment card tracking project delta and training references).
- Pane 3: Psychological Outreach Vault (Dynamic outreach layouts mapped to hiring manager archetypes).

## 4. Token & Security Control Gating
- Gated Model Routing: Standard data extraction/scoring runs on fast, cost-effective models. Complex contextual synthesis and copy tailoring are gated behind human "Approve" triggers.
- Local Storage Isolation: All user cookies (`li_at`), session keys, and environment variables are strictly isolated inside local environment files and never exposed to raw model logs or external network traces.