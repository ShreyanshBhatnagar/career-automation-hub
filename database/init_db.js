import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('./database/career_engine.db');
const SCHEMA_PATH = path.resolve('./database/schema.sql');

async function initDB() {
    const db = new sqlite3.Database(DB_PATH);
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

    db.serialize(() => {
        db.exec(schema, (err) => {
            if (err) {
                console.error('Error initializing database:', err.message);
            } else {
                console.log('✅ Database initialized successfully at', DB_PATH);
            }
            db.close();
        });
    });
}

initDB();
