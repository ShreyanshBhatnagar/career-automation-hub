# V3 Architecture: Quantitative Career Arbitrage Engine

## 1. Core Vision
To pivot a candidate from traditional sectors (e.g., Electrical Engineering/Renewables) into high-leverage "Arbitrage" sectors (AI, SaaS, DeepTech) by identifying **Structural Skill Overlaps** that recruiters ignore but companies desperately need.

## 2. The GraphRAG Ontology (Skill Mapping)
### Stack: Neo4j + pgvector
- **The Graph (Neo4j):**
    - Nodes: `AtomicSkill`, `IndustrySector`, `RoleArchetype`, `LeveragePoint`.
    - Edges: `TRANSFERABLE_TO`, `REQUIRES_LEVERAGE`, `SITUATIONAL_OVERLAP`.
    - *Example:* `Electrical Site Management` --(Structural Overlap)--> `SaaS Customer Success (Implementation)`. Both require high-stakes vendor negotiation, timeline management, and technical troubleshooting under pressure.
- **The Vector (pgvector):**
    - Stores high-dimensional embeddings of Job Descriptions (JDs) to find "Vibe-matches" for high-growth cultures.

## 3. Stealth Ingestion Pipeline
### Primary Method: XHR/GraphQL Interception
- **Anti-Bot Stack:**
    - **TLS Fingerprint Spoofing:** Using `cycle-tls` or custom `https.Agent` configurations to mimic common browser fingerprints (e.g., Chrome v120 on Mac).
    - **Header Entropy:** Randomized header ordering to avoid Cloudflare's JA3 fingerprinting.
    - **Interceptors:** Hooks into `playwright.request` to capture raw JSON/GraphQL payloads from Greenhouse, Lever, and LinkedIn before they are rendered into HTML.
- **High-Growth Signal Tracking:**
    - **Crunchbase/Pitchbook API:** Monitor Series A/B rounds.
    - **X/LinkedIn Scraping:** Track "Stealth Mode Founder" keywords.

## 4. Red Teaming Orchestrator (Adversarial Loop)
### The Squad:
1. **Agent A (The Sourcer):**
    - *Input:* User Atomic Nodes + Sector Ontology.
    - *Task:* Identify roles with high "Transferable Leverage."
2. **Agent B (The Challenger - "The Pessimistic Recruiter"):**
    - *Task:* Actively look for 3 reasons to reject the candidate (e.g., "Lack of SaaS experience," "Overqualified for X but missing Y").
3. **Agent C (The Tailor):**
    - *Adversarial Goal:* Rewrite the resume and pitch specifically to **neutralize** Agent B's critiques without lying.
    - *Prompt Structure:*
      > "Agent B says: [Critique]. Rewrite the 'Solar Project Management' bullet point as 'Technical Infrastructure Implementation' to highlight the transferable skill of [Atomic Node] and neutralize the rejection point."

## 5. Deployment Model
- **Infrastructure:** Python (LangGraph) for orchestration, Node.js (Playwright) for stealth fetching.
- **Database:** PostgreSQL (with pgvector extension) as the primary store, Neo4j as the ontology layer.
