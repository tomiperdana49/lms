-- Database creation handled by db.js
-- USE statement handled by db.js connection


CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role ENUM('STAFF', 'SUPERVISOR', 'HR') NOT NULL,
    avatar VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS reading_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    category VARCHAR(255),
    date DATETIME NOT NULL,
    duration INT,
    review TEXT,
    status VARCHAR(50) DEFAULT 'Reading',
    user_name VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS training_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    vendor VARCHAR(255),
    cost DECIMAL(15, 2),
    date DATE,
    status VARCHAR(50) DEFAULT 'PENDING_HR',
    submitted_at DATETIME,
    rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS meetings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(50),
    location VARCHAR(255),
    agenda TEXT,
    guests_json JSON
);

CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    description TEXT,
    duration INT
);

CREATE TABLE IF NOT EXISTS course_modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT,
    title VARCHAR(255),
    duration VARCHAR(50),
    is_locked BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Additional tables for full compatibility
CREATE TABLE IF NOT EXISTS progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50),
    course_id INT,
    completed_module_ids JSON,
    last_access DATETIME,
    UNIQUE KEY unique_progress (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS quiz_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(50),
    student_name VARCHAR(255),
    course_id INT,
    module_id INT,
    score INT,
    date DATETIME
);

CREATE TABLE IF NOT EXISTS incentives (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    amount DECIMAL(15, 2),
    status VARCHAR(50) DEFAULT 'Pending',
    date DATETIME
);
