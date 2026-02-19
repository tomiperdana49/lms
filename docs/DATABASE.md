# Database Schema Documentation

This document describes the database schema used in the LMS application. The application uses MySQL as its primary database and integrates with a secondary `simasset` database for employee and asset information.

## Primary Database (`lms_db`)

### 1. `users`
Stores user authentication and profile information.
- `id` (VARCHAR(50)): Unique identifier (timestamp-based string).
- `email` (VARCHAR(255)): User email (unique).
- `password` (VARCHAR(255)): User password (hashed or placeholder).
- `name` (VARCHAR(255)): Full name.
- `role` (ENUM): User role ('STAFF', 'SUPERVISOR', 'HR').
- `avatar` (VARCHAR(255)): URL to user avatar.
- `employee_id` (VARCHAR(50)): Link to SimAsset employee record.
- `branch` (VARCHAR(255)): User's branch location.

### 2. `reading_logs`
Tracks books read by employees.
- `id` (INT): Primary Key.
- `title` (VARCHAR(255)): Book title.
- `author` (VARCHAR(255)): Author name.
- `category` (VARCHAR(255)): Book category.
- `date` (DATETIME): Date of reading entry.
- `duration` (INT): Duration in minutes.
- `review` (TEXT): User's review of the book.
- `link` (VARCHAR(255)): Link to book resource.
- `status` (VARCHAR(50)): Status ('Reading', 'Finished', 'APPROVED', 'REJECTED').
- `user_name` (VARCHAR(255)): Name of the user who read the book.
- `employee_id` (VARCHAR(50)): Employee ID.
- `start_date` (DATETIME): Reading start date.
- `finish_date` (DATETIME): Reading completion date.
- `evidence_url` (VARCHAR(255)): URL to evidence (photo/screenshot).
- `reading_duration` (INT): Total time spent reading (minutes).
- `hr_approval_status` (VARCHAR(50)): HR approval status ('Pending', 'Approved', 'Rejected').
- `incentive_amount` (DECIMAL): Approved incentive amount.
- `rejection_reason` (TEXT): Reason for rejection if applicable.

### 3. `training_requests`
Manages external training requests submitted by employees.
- `id` (INT): Primary Key.
- `title` (VARCHAR(255)): Training title.
- `vendor` (VARCHAR(255)): Training provider.
- `cost` (DECIMAL): Estimated cost.
- `date` (DATE): Training date.
- `status` (VARCHAR(50)): Request status ('PENDING_SUPERVISOR', 'PENDING_HR', 'APPROVED', 'REJECTED').
- `submitted_at` (DATETIME): Submission timestamp.
- `rejection_reason` (TEXT): Reason for rejection.
- `employee_name` (VARCHAR(255)): Requester's name.
- `employee_id` (VARCHAR(50)): Requester's employee ID.
- `employee_role` (VARCHAR(50)): Requester's role.
- `supervisor_name` (VARCHAR(255)): Approving supervisor's name.
- `supervisor_approved_at` (DATETIME): Supervisor approval timestamp.
- `hr_name` (VARCHAR(255)): Approving HR's name.
- `hr_approved_at` (DATETIME): HR approval timestamp.
- `cost_training` (DECIMAL): Training fee.
- `cost_transport` (DECIMAL): Transport cost.
- `cost_accommodation` (DECIMAL): Accommodation cost.
- `cost_others` (DECIMAL): Other costs.
- `justification` (TEXT): Reason for training.
- `evidence_url` (VARCHAR(255)): URL to supporting documents.

### 4. `meetings`
Schedules and tracks meetings.
- `id` (INT): Primary Key.
- `title` (VARCHAR(255)): Meeting title.
- `date` (DATE): Meeting date.
- `time` (VARCHAR(50)): Meeting time.
- `host` (VARCHAR(255)): Meeting host.
- `location` (VARCHAR(255)): Physical location.
- `type` (VARCHAR(50)): Type ('Offline', 'Online').
- `meetLink` (VARCHAR(255)): Virtual meeting link.
- `agenda` (TEXT): Meeting agenda/description.
- `guests_json` (JSON): List of guests and their status.
- `cost_report_json` (JSON): Cost breakdown for the meeting.
- `employee_id` (VARCHAR(50)): Host's employee ID.

### 5. `courses`
Internal training courses.
- `id` (INT): Primary Key.
- `title` (VARCHAR(255)): Course title.
- `category` (VARCHAR(255)): Course category.
- `description` (TEXT): Course description.
- `duration` (VARCHAR(50)): Total duration.
- `assessment_data` (JSON): Final assessment details.

### 6. `course_modules`
Individual modules/lessons within a course.
- `id` (INT): Primary Key.
- `course_id` (INT): Foreign Key to `courses`.
- `title` (VARCHAR(255)): Module title.
- `duration` (VARCHAR(50)): Module duration.
- `video_id` (VARCHAR(255)): ID of the video content.
- `video_type` (VARCHAR(50)): Source type (e.g., 'youtube').
- `is_locked` (BOOLEAN): Whether the module is locked by default.
- `quiz_data` (JSON): Quiz associated with the module.

### 7. `progress`
Tracks user progress through courses.
- `id` (INT): Primary Key.
- `user_id` (VARCHAR(50)): User ID.
- `employee_id` (VARCHAR(50)): Employee ID.
- `course_id` (INT): Course ID.
- `completed_module_ids` (JSON): Array of completed module IDs.
- `module_progress` (JSON): Detailed progress per module.
- `last_access` (DATETIME): Last access timestamp.

### 8. `quiz_results`
Stores results of course quizzes.
- `id` (INT): Primary Key.
- `student_id` (VARCHAR(50)): Student User ID.
- `student_name` (VARCHAR(255)): Student Name.
- `employee_id` (VARCHAR(50)): Student Employee ID.
- `course_id` (INT): Course ID.
- `module_id` (INT): Module ID.
- `score` (INT): Quiz score (0-100).
- `date` (DATETIME): Date taken.

### 9. `incentives`
Tracks financial incentives for employees.
- `id` (INT): Primary Key.
- `employee_name` (VARCHAR(255)): Employee Name.
- `employee_id` (VARCHAR(50)): Employee ID.
- `course_name` (VARCHAR(255)): Course/Activity Name.
- `description` (TEXT): Description.
- `start_date` (DATE): Start date.
- `end_date` (DATE): End date.
- `evidence_url` (VARCHAR(255)): Evidence URL.
- `status` (VARCHAR(50)): Status ('Pending', 'Active', 'Completed').
- `reward` (DECIMAL): Reward amount.
- `monthly_amount` (DECIMAL): Recurring monthly amount.
- `payment_type` (ENUM): Payment type ('One-Time', 'Recurring').
- `approved_date` (DATETIME): Approval timestamp.

## External Database (`simasset`)

The application connects to a secondary database for:
- **Employees**: Fetching employee details (`employees` table).
- **Assets**: Fetching book inventory (`assets`, `categories`, `sub_categories` tables).
- **Branches**: Fetching branch information (`branches` table).
- **Borrowing History**: Tracking asset assignment history (`asset_holders` table).
