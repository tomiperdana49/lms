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

// --- SIMASSET POOL (Unified to same DB) ---
export const simAssetPool = pool;

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
            await connection.query("ALTER TABLE course_modules ADD COLUMN pre_quiz_data JSON");
            console.log("Added pre_quiz_data column to course_modules.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE courses ADD COLUMN entry_pre_test_data JSON");
            console.log("Added entry_pre_test_data column to courses.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE courses ADD COLUMN pre_assessment_data JSON");
            console.log("Added pre_assessment_data column to courses.");
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

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN approved_by VARCHAR(255)");
            console.log("Added approved_by column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN sn VARCHAR(255)");
            console.log("Added sn column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN approved_at DATETIME");
            console.log("Added approved_at column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN planned_finish_date DATETIME");
            console.log("Added planned_finish_date column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN location VARCHAR(100)");
            console.log("Added location column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN source VARCHAR(100)");
            console.log("Added source column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN cancelled_at DATETIME");
            console.log("Added cancelled_at column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN cancelled_by VARCHAR(255)");
            console.log("Added cancelled_by column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        // MIGRATION: Add unique constraint to prevent duplicate syncs
        try {
            await connection.query(`
                DELETE l1 FROM reading_logs l1
                INNER JOIN reading_logs l2 
                WHERE l1.id < l2.id 
                AND l1.source = l2.source 
                AND l1.employee_id = l2.employee_id 
                AND l1.sn = l2.sn 
                AND DATE(l1.start_date) = DATE(l2.start_date)
                AND l1.source = 'SIMAS'
            `);
            await connection.query("ALTER TABLE reading_logs ADD UNIQUE KEY unique_simas_loan (source, employee_id, sn, start_date)");
            console.log("Added unique_simas_loan constraint.");
        } catch (e) { /* Ignore if exists or precision issues */ }

        try {
            await connection.query("UPDATE reading_logs SET planned_finish_date = finish_date WHERE planned_finish_date IS NULL AND finish_date IS NOT NULL");
            console.log("Migrated NULL planned_finish_date to match finish_date.");
        } catch (e) { /* Ignore */ }

        // Standardize employee_id across all tables
        const trackingTables = ['reading_logs', 'training_requests', 'quiz_results', 'progress', 'incentives', 'meetings'];
        for (const table of trackingTables) {
            try {
                await connection.query(`ALTER TABLE ${table} ADD COLUMN employee_id VARCHAR(50)`);
                console.log(`Added employee_id column to ${table}.`);
            } catch (e) { /* Ignore if exists */ }
        }

        try {
            await connection.query("ALTER TABLE quiz_results ADD COLUMN quiz_type VARCHAR(20) DEFAULT 'POST'");
            console.log("Added quiz_type column to quiz_results.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE quiz_results ADD COLUMN meeting_id INT");
            console.log("Added meeting_id column to quiz_results.");
        } catch (e) { /* Ignore if exists */ }

        try {
            // Nusawork's note API returns { data: { id_group } } on success - stored here against the
            // completing quiz_results row so a future update/delete of that note can reference it.
            await connection.query("ALTER TABLE quiz_results ADD COLUMN nusawork_id_group INT");
            console.log("Added nusawork_id_group column to quiz_results.");
        } catch (e) { /* Ignore if exists */ }

        try {
            // Tracks the Nusawork note id_group per (meeting, employee) for Internal Training - kept
            // separate from quiz_results since attendance/payment isn't tied to taking a quiz.
            await connection.query(`
                CREATE TABLE IF NOT EXISTS nusawork_training_notes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    meeting_id INT NOT NULL,
                    employee_id VARCHAR(50) NOT NULL,
                    id_group INT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_meeting_employee (meeting_id, employee_id)
                )
            `);
            console.log("Verified nusawork_training_notes table exists.");
        } catch (e) { console.error("Failed to create nusawork_training_notes:", e.message); }

        try {
            // External Training is one row per employee already, so the Nusawork note reference is
            // stored directly on the row instead of a separate tracking table.
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN nusawork_id_group INT");
            console.log("Added nusawork_id_group column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            // Reading Log is also one row per employee per book, same reasoning as External Training.
            await connection.query("ALTER TABLE reading_logs ADD COLUMN nusawork_id_group INT");
            console.log("Added nusawork_id_group column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

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

            await connection.query("ALTER TABLE meetings ADD COLUMN pre_test_link VARCHAR(500)");
            await connection.query("ALTER TABLE meetings ADD COLUMN material_link VARCHAR(500)");
            await connection.query("ALTER TABLE meetings ADD COLUMN post_test_link VARCHAR(500)");
            await connection.query("ALTER TABLE meetings ADD COLUMN feedback_link VARCHAR(500)");
            console.log("Added training resource columns to meetings.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE meetings ADD COLUMN pre_test_data JSON");
            await connection.query("ALTER TABLE meetings ADD COLUMN post_test_data JSON");
            await connection.query("ALTER TABLE meetings ADD COLUMN feedback_data JSON");
            console.log("Added quiz and feedback data columns to meetings.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE meetings ADD COLUMN deleted_at DATETIME DEFAULT NULL");
            console.log("Added deleted_at column to meetings.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN location VARCHAR(100)");
            console.log("Added location column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE reading_logs ADD COLUMN source VARCHAR(100)");
            console.log("Added source column to reading_logs.");
        } catch (e) { /* Ignore if exists */ }

        // MIGRATION: Add course_feedback table
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS course_feedback (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(50),
                    employee_id VARCHAR(50),
                    course_id INT,
                    meeting_id INT,
                    feedback_data JSON,
                    submitted_at DATETIME,
                    UNIQUE KEY unique_course_feedback (user_id, course_id),
                    UNIQUE KEY unique_meeting_feedback (user_id, meeting_id)
                )
            `);
            console.log("Verified course_feedback table exists.");
        } catch (e) {
            console.error("Error creating course_feedback table:", e);
        }

        try {
            await connection.query("ALTER TABLE course_feedback ADD COLUMN is_imported TINYINT DEFAULT 0");
            console.log("Added is_imported column to course_feedback.");
        } catch (e) { /* Ignore if exists */ }

        // MIGRATION: Post Training Evaluation - a Likert-scale evaluation form template. Not yet
        // tied to any Internal Training meeting/attendee flow (meeting_id kept nullable for now so
        // that link can be added later without another migration).
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS post_training_evaluation_forms (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    meeting_id INT NULL,
                    category VARCHAR(100),
                    created_by VARCHAR(255),
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    scale_min_label VARCHAR(255),
                    scale_max_label VARCHAR(255),
                    status ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at DATETIME NULL
                )
            `);
            console.log("Verified post_training_evaluation_forms table exists.");
        } catch (e) {
            console.error("Error creating post_training_evaluation_forms table:", e);
        }

        try {
            await connection.query("ALTER TABLE post_training_evaluation_forms MODIFY COLUMN meeting_id INT NULL");
            console.log("Made meeting_id nullable on post_training_evaluation_forms.");
        } catch (e) { /* Ignore if already nullable */ }

        try {
            await connection.query("ALTER TABLE post_training_evaluation_forms ADD COLUMN category VARCHAR(100)");
            console.log("Added category column to post_training_evaluation_forms.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE post_training_evaluation_forms ADD COLUMN created_by VARCHAR(255)");
            console.log("Added created_by column to post_training_evaluation_forms.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE post_training_evaluation_forms ADD COLUMN description TEXT");
            console.log("Added description column to post_training_evaluation_forms.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS post_training_evaluation_questions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    form_id INT NOT NULL,
                    order_index INT NOT NULL,
                    type ENUM('SCALE','TEXT') NOT NULL DEFAULT 'SCALE',
                    competency_label VARCHAR(255),
                    question_text TEXT NOT NULL
                )
            `);
            console.log("Verified post_training_evaluation_questions table exists.");
        } catch (e) {
            console.error("Error creating post_training_evaluation_questions table:", e);
        }

        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS post_training_evaluation_responses (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    form_id INT NOT NULL,
                    meeting_id INT NULL,
                    evaluatee_employee_id VARCHAR(50) NOT NULL,
                    evaluator_employee_id VARCHAR(50) NOT NULL,
                    answers JSON NOT NULL,
                    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_form_meeting_evaluatee (form_id, meeting_id, evaluatee_employee_id)
                )
            `);
            console.log("Verified post_training_evaluation_responses table exists.");
        } catch (e) {
            console.error("Error creating post_training_evaluation_responses table:", e);
        }

        // MIGRATION: a PTE form template can be reused across multiple meetings, but the response
        // table used to only key on (form_id, evaluatee_employee_id) - evaluating the same person
        // a second time under a reused template silently overwrote their first meeting's answers.
        // meeting_id makes each meeting's response independent; server.js backfills existing rows'
        // meeting_id once query()/getFormMeetings() are available (see backfillPteResponseMeetingIds).
        try {
            await connection.query("ALTER TABLE post_training_evaluation_responses ADD COLUMN meeting_id INT NULL AFTER form_id");
            console.log("Added meeting_id column to post_training_evaluation_responses.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE post_training_evaluation_responses DROP INDEX unique_form_evaluatee");
            console.log("Dropped old unique_form_evaluatee index on post_training_evaluation_responses.");
        } catch (e) { /* Ignore if already dropped/never existed */ }

        try {
            await connection.query("ALTER TABLE post_training_evaluation_responses ADD UNIQUE KEY unique_form_meeting_evaluatee (form_id, meeting_id, evaluatee_employee_id)");
            console.log("Added unique_form_meeting_evaluatee index on post_training_evaluation_responses.");
        } catch (e) { /* Ignore if already exists */ }

        // Only succeeds once every row has been backfilled with a real meeting_id (see server.js) -
        // fails harmlessly on earlier runs while NULLs still remain, and locks the column down once
        // the backfill has caught up.
        try {
            await connection.query("ALTER TABLE post_training_evaluation_responses MODIFY COLUMN meeting_id INT NOT NULL");
            console.log("Made meeting_id required on post_training_evaluation_responses.");
        } catch (e) { /* Ignore until backfill has filled every row */ }

        // A meeting picks one existing Post Training Evaluation template to use (the same template
        // can be reused across many meetings, so this lives on meetings, not on the form). The
        // linked form is auto-published when the meeting is marked Paid - see PUT /api/meetings/:id.
        try {
            await connection.query("ALTER TABLE meetings ADD COLUMN pte_form_id INT NULL");
            console.log("Added pte_form_id column to meetings.");
        } catch (e) { /* Ignore if exists */ }

        // MIGRATION: Add external_training_requests table
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS external_training_requests (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    employee_id VARCHAR(50),
                    employee_name VARCHAR(255),
                    category VARCHAR(50),
                    title VARCHAR(255),
                    vendor VARCHAR(255),
                    location VARCHAR(255),
                    start_date DATE,
                    end_date DATE,
                    status VARCHAR(50) DEFAULT 'Pending',
                    registration_fee DECIMAL(15,2) DEFAULT 0,
                    travel_flight_cost DECIMAL(15,2) DEFAULT 0,
                    accommodation_cost DECIMAL(15,2) DEFAULT 0,
                    miscellaneous_cost DECIMAL(15,2) DEFAULT 0,
                    payment_method VARCHAR(50),
                    attachment_link VARCHAR(500),
                    approved_by VARCHAR(255),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            console.log("Verified external_training_requests table exists.");
        } catch (e) {
            console.error("Error creating external_training_requests table:", e);
        }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN certificate_link VARCHAR(500)");
            console.log("Added certificate_link column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN certificate_expiry_date DATE");
            console.log("Added certificate_expiry_date column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests MODIFY COLUMN start_date DATETIME");
            await connection.query("ALTER TABLE external_training_requests MODIFY COLUMN end_date DATETIME");
            console.log("Widened external_training_requests start_date/end_date to DATETIME.");
        } catch (e) { /* Ignore if already widened */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN certification_result VARCHAR(20)");
            console.log("Added certification_result column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN incentive_reward DECIMAL(15,2)");
            console.log("Added incentive_reward column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN incentive_payment_type VARCHAR(20)");
            console.log("Added incentive_payment_type column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN renewal_certificate_link VARCHAR(500)");
            console.log("Added renewal_certificate_link column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        // Frozen at first approval so it survives later renewals; certificate_expiry_date keeps tracking the current/latest expiry.
        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN original_certificate_expiry_date DATE");
            console.log("Added original_certificate_expiry_date column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN hr_name VARCHAR(255)");
            console.log("Added hr_name column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN training_gr_type VARCHAR(20)");
            console.log("Added training_gr_type column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN participation_type VARCHAR(30)");
            console.log("Added participation_type column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN learning_hours DECIMAL(6,2)");
            console.log("Added learning_hours column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE external_training_requests ADD COLUMN deleted_at DATETIME DEFAULT NULL");
            console.log("Added deleted_at column to external_training_requests.");
        } catch (e) { /* Ignore if exists */ }

        // MIGRATION: Add internal_certificates table (issued internal training certificates)
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS internal_certificates (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    meeting_id INT NOT NULL,
                    employee_id VARCHAR(50),
                    employee_name VARCHAR(255) NOT NULL,
                    training_title VARCHAR(255) NOT NULL,
                    training_date DATE,
                    cert_no VARCHAR(100),
                    serial VARCHAR(20) UNIQUE NOT NULL,
                    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_internal_cert (meeting_id, employee_id)
                )
            `);
            console.log("Verified internal_certificates table exists.");
        } catch (e) {
            console.error("Error creating internal_certificates table:", e);
        }

        // MIGRATION: Add role column to internal_certificates (distinguishes host vs participant certs)
        try {
            const [roleCol] = await connection.query(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'internal_certificates' AND COLUMN_NAME = 'role'"
            );
            if (roleCol.length === 0) {
                await connection.query("ALTER TABLE internal_certificates ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'participant'");
                await connection.query("ALTER TABLE internal_certificates DROP INDEX unique_internal_cert");
                await connection.query("ALTER TABLE internal_certificates ADD UNIQUE KEY unique_internal_cert (meeting_id, employee_id, role)");
                console.log("Added role column to internal_certificates and widened unique key.");
            }
        } catch (e) {
            console.error("Error adding role column to internal_certificates:", e);
        }

        // MIGRATION: Add online_certificates table (issued online-module certificates)
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS online_certificates (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    course_id INT NOT NULL,
                    user_id VARCHAR(50) NOT NULL,
                    employee_id VARCHAR(50),
                    employee_name VARCHAR(255) NOT NULL,
                    course_title VARCHAR(255) NOT NULL,
                    completion_date DATE,
                    cert_no VARCHAR(100),
                    serial VARCHAR(20) UNIQUE NOT NULL,
                    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_online_cert (course_id, user_id)
                )
            `);
            console.log("Verified online_certificates table exists.");
        } catch (e) {
            console.error("Error creating online_certificates table:", e);
        }

        try {
            await connection.query("ALTER TABLE internal_certificates ADD COLUMN branch VARCHAR(100)");
            console.log("Added branch column to internal_certificates.");
        } catch (e) { /* Ignore if exists */ }

        try {
            await connection.query("ALTER TABLE online_certificates ADD COLUMN branch VARCHAR(100)");
            console.log("Added branch column to online_certificates.");
        } catch (e) { /* Ignore if exists */ }

        // MIGRATION: Add idp_plans table (Individual Development Plan)
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS idp_plans (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    employee_id VARCHAR(50) NOT NULL,
                    employee_name VARCHAR(255),
                    job_position VARCHAR(255),
                    department VARCHAR(255),
                    supervisor_name VARCHAR(255),
                    period_year INT NOT NULL,
                    join_date_label VARCHAR(255),
                    achievements TEXT,
                    career_goal TEXT,
                    existing_skills TEXT,
                    development_area TEXT,
                    status VARCHAR(20) DEFAULT 'Draft',
                    created_by_date DATE,
                    approved_date DATE,
                    approved_by VARCHAR(255),
                    rejection_reason TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_employee_period (employee_id, period_year)
                )
            `);
            console.log("Verified idp_plans table exists.");
        } catch (e) {
            console.error("Error creating idp_plans table:", e);
        }

        // MIGRATION: Add idp_action_items table (development action checklist rows within an IDP)
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS idp_action_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    idp_id INT NOT NULL,
                    action_description TEXT,
                    target_time VARCHAR(100),
                    is_mandatory TINYINT DEFAULT 0,
                    is_completed TINYINT DEFAULT 0,
                    notes TEXT,
                    sort_order INT DEFAULT 0,
                    FOREIGN KEY (idp_id) REFERENCES idp_plans(id) ON DELETE CASCADE
                )
            `);
            console.log("Verified idp_action_items table exists.");
        } catch (e) {
            console.error("Error creating idp_action_items table:", e);
        }

        // MIGRATION: Add idp_reviews table (periodic 1-on-1 review notes + HR verification, per IDP)
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS idp_reviews (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    idp_id INT NOT NULL,
                    review_date DATE,
                    supervisor_note TEXT,
                    reviewed_by VARCHAR(255),
                    hr_verification_date DATE,
                    hr_note TEXT,
                    hr_verified_by VARCHAR(255),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (idp_id) REFERENCES idp_plans(id) ON DELETE CASCADE
                )
            `);
            console.log("Verified idp_reviews table exists.");
        } catch (e) {
            console.error("Error creating idp_reviews table:", e);
        }

        // MIGRATION: Add hr_note to idp_plans — general HR feedback on what's missing/needs adding,
        // independent of the approve/reject decision.
        try {
            await connection.query("ALTER TABLE idp_plans ADD COLUMN hr_note TEXT");
            console.log("Added hr_note column to idp_plans.");
        } catch (e) { /* Ignore if exists */ }

        // MIGRATION: Add hr_note_by — the name of the HR person who left hr_note, so the note shown
        // to the employee/supervisor is attributed instead of appearing to come from "HR" anonymously.
        try {
            await connection.query("ALTER TABLE idp_plans ADD COLUMN hr_note_by VARCHAR(255)");
            console.log("Added hr_note_by column to idp_plans.");
        } catch (e) { /* Ignore if exists */ }

        // MIGRATION: Add the supervisor's final approval columns to idp_plans — the closing step of
        // the IDP cycle, done by the direct supervisor after HR's initial approval and the year's
        // monthly reviews. Separate from approved_by/approved_date, which record HR's approval.
        try {
            await connection.query("ALTER TABLE idp_plans ADD COLUMN supervisor_approved_by VARCHAR(255)");
            console.log("Added supervisor_approved_by column to idp_plans.");
        } catch (e) { /* Ignore if exists */ }
        try {
            await connection.query("ALTER TABLE idp_plans ADD COLUMN supervisor_approved_date DATE");
            console.log("Added supervisor_approved_date column to idp_plans.");
        } catch (e) { /* Ignore if exists */ }

        // MIGRATION: Remove SUPERVISOR from users.role — supervisor status is now determined
        // dynamically via checkIsSupervisor() against the SIMAS org chart, not stored on the user.
        try {
            await connection.query("UPDATE users SET role = 'STAFF' WHERE role = 'SUPERVISOR'");
            await connection.query("ALTER TABLE users MODIFY COLUMN role ENUM('STAFF', 'HR') NOT NULL");
            console.log("Removed SUPERVISOR from users.role enum.");
        } catch (e) { /* Ignore if already migrated */ }

        connection.release();
    } catch (err) {
        console.error('Database initialization failed:', err);
    }
};

export default pool;
