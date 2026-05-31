-- Database schema for Career Opportunity Engine

CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    role_title TEXT NOT NULL,
    sector TEXT,
    location TEXT,
    source_url TEXT UNIQUE,
    relevance_score REAL,
    status TEXT DEFAULT 'New', -- New, Reviewed, Applied, Interview, Closed
    next_action TEXT,
    notes TEXT,
    description TEXT,
    requirements TEXT,
    tailored_pitch TEXT,
    posted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT,
    company TEXT,
    relation_strength TEXT, -- Warm, Cold, Referral
    last_contacted_at TIMESTAMP,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER,
    action_type TEXT, -- Apply, DM, Follow-up
    due_date DATE,
    status TEXT DEFAULT 'Open',
    FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
);

-- Audit Trail: Tracks every scan the AI performs
CREATE TABLE IF NOT EXISTS scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name TEXT NOT NULL,
    status TEXT, -- 'Success', 'Failed', 'No Matches'
    findings_count INTEGER DEFAULT 0,
    details TEXT,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Future Leads: News signals that predict future hiring
CREATE TABLE IF NOT EXISTS hidden_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    source_url TEXT,
    summary TEXT,
    predicted_role_type TEXT,
    confidence_score REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
