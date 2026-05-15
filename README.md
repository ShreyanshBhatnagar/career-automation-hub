# 🚀 Career Automation: The Opportunity Map

This is a long-term, modular automation system for tracking career opportunities, focusing on the intersection of technical engineering (PSCAD/MATLAB) and commercial control (SAP/Contract Admin).

## 📂 Project Structure

- **`/api`**: The Central Hub. An Express server that manages the database and coordinates between agents.
- **`/database`**: SQLite storage for opportunities, contacts, and actions.
- **`/logic`**: Core algorithms for job scoring and profile matching.
- **`/agents`**: Specialized modular scripts (e.g., Scrapers, Resume Tailors, Social Media posters).
- **`/workflows`**: n8n JSON exports for version-controlled automation flows.
- **`/docs`**: System blueprints and user profiles.

## 🛠 Setup & O&M

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Database**:
   ```bash
   node career-automation/database/init_db.js
   ```

3. **Start the Hub API**:
   ```bash
   node career-automation/api/server.js
   ```

## 🔗 n8n Integration
The Hub API exposes endpoints for n8n:
- `POST /opportunities`: Add a new job from LinkedIn/Websites.
- `GET /opportunities/top`: Fetch ranked roles for a dashboard.

## 🤝 Maintenance (O&M)
- Update `docs/brother_profile.json` as new skills are acquired.
- Adjust scoring logic in `api/server.js` or `logic/` as targets shift.
- Push changes to Git to track system evolution.
