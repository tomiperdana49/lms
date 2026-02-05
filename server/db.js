import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// --- LMS POOL ---
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lms_db',
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- SIMASSET POOL ---
export const simAssetPool = mysql.createPool({
    host: process.env.SIMAS_HOST || process.env.DB_HOST,
    user: process.env.SIMAS_USER || process.env.DB_USER,
    password: process.env.SIMAS_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.SIMAS_NAME || 'simasset',
    port: process.env.SIMAS_PORT ? parseInt(process.env.SIMAS_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export const initDB = async () => {
    try {
        const connection = await pool.getConnection();
        const dbName = process.env.DB_NAME || 'lms_db';

        // 1. Create DB if not exists (Safe check)
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.query(`USE \`${dbName}\``);
        console.log(`Using database: ${dbName}`);

        // 2. Create Tables from Schema
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await connection.query(schema);
        console.log('Tables initialized successfully.');

        // Migration: Add video columns if they don't exist
        try {
            await connection.query("ALTER TABLE course_modules ADD COLUMN video_id VARCHAR(255)");
            console.log("Added video_id column.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE course_modules ADD COLUMN video_type VARCHAR(50) DEFAULT 'youtube'");
            console.log("Added video_type column.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE course_modules ADD COLUMN quiz_data JSON");
            console.log("Added quiz_data column to course_modules.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE courses MODIFY COLUMN duration VARCHAR(50)");
            console.log("Modified courses.duration to VARCHAR(50).");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE courses ADD COLUMN assessment_data JSON");
            console.log("Added assessment_data column to courses.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN link VARCHAR(255)");
            console.log("Added link column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        // 3. Seed Data if Users table is empty

        const [rows] = await connection.query('SELECT COUNT(*) as count FROM users');
        if (rows[0].count === 0) {
            console.log('Seeding data...');

            // Seed Users
            const users = [
                ['1678891234', 'staff@nusa.com', '123', 'Budi Santoso', 'STAFF'],
                ['1678891235', 'spv@nusa.com', '123', 'Siti Aminah', 'SUPERVISOR'],
                ['1678891236', 'hr@nusa.com', '123', 'Dewi Sartika', 'HR']
            ];
            await connection.query('INSERT INTO users (id, email, password, name, role) VALUES ?', [users]);

            // Seed Courses
            const [courseResult] = await connection.query(`
                INSERT INTO courses (title, category, description, duration) VALUES 
                ('Dasar Keamanan Informasi', 'IT Security', 'Pengenalan dasar security awareness.', 120),
                ('Komunikasi Efektif', 'Soft Skills', 'Cara berkomunikasi yang baik.', 60)
            `);

            // Seed Modules (Hardcoded IDs based only on order of insertion above is risky in real app, but ok for demo)
            // Assuming IDs 1 and 2
            await connection.query(`
                INSERT INTO course_modules (course_id, title, duration, is_locked) VALUES 
                (1, 'Password Security', '15:00', 0),
                (1, 'Phishing Awareness', '10:00', 1),
                (2, 'Verbal Communication', '10:00', 0),
                (2, 'Non-verbal Cues', '20:00', 1)
            `);

            // Seed Meetings
            await connection.query(`
                INSERT INTO meetings (title, date, time, location, agenda) VALUES 
                ('Evaluasi Kinerja Q1', '2026-01-25', '14:00', 'Ruang Meeting A', 'Review KPI')
            `);

            // Seed Reading Logs
            await connection.query(`
                INSERT INTO reading_logs (title, author, category, date, duration, review, status, user_name) VALUES 
                ('Clean Code', 'Robert C. Martin', 'Teknologi', '2026-01-10', 45, 'Great book', 'APPROVED', 'Budi Santoso')
            `);

            console.log('Data seeding completed.');
        }

        // Standardize employee_id across all tables
        const trackingTables = ['reading_logs', 'training_requests', 'quiz_results', 'progress', 'incentives', 'meetings'];
        for (const table of trackingTables) {
            try {
                await connection.query(`ALTER TABLE ${table} ADD COLUMN employee_id VARCHAR(50)`);
                console.log(`Added employee_id column to ${table}.`);
            } catch (e) { /* Ignore if exists */ }
        }

        try {
            await connection.query("ALTER TABLE meetings ADD COLUMN type VARCHAR(50) DEFAULT 'Offline'");
            console.log("Added type column to meetings.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE meetings ADD COLUMN meetLink VARCHAR(255)");
            console.log("Added meetLink column to meetings.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE meetings ADD COLUMN host VARCHAR(255)");
            console.log("Added host column to meetings.");
        } catch (e) { /* Ignore if exists */ }

        connection.release();
    } catch (err) {
        console.error('Database initialization failed:', err);
    }
};

export default pool;
