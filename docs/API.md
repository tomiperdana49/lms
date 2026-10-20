# API Documentation

The backend is built with Express.js and provides a RESTful API. All responses are in JSON format.

## Base URL
`http://localhost:3003/api` (default)

## Authentication

### `POST /api/login`
Authenticates a user.
- **Body:** `{ identifier, password }` (identifier can be email or employee ID)
- **Response:** `{ success: true, user: { id, name, role, email, branch, employee_id } }`

### `POST /api/auth/google`
Authenticates via Google OAuth.
- **Body:** `{ email }`
- **Response:** `{ success: true, user: { ... } }`

## Users

### `GET /api/users`
Returns a list of all users.

### `POST /api/users`
Creates a new user.
- **Body:** `{ email, password, name, role, employee_id }`

### `PUT /api/users/:id`
Updates a user's information.
- **Body:** `{ name, email, role, ... }`

### `DELETE /api/users/:id`
Deletes a user.

## Employees (SimAsset Integration)

### `GET /api/employees`
Fetches employees from the external SimAsset database.

### `GET /api/branches`
Fetches branches from the external SimAsset database.

## Reading Logs

### `GET /api/logs`
Returns all reading logs.

### `POST /api/logs`
Creates a new reading log entry.
- **Body:** `{ title, author, category, date, duration, review, status, userName, employee_id, evidenceUrl, ... }`

### `PUT /api/logs/:id`
Updates a reading log entry.
- **Body:** `{ status, review, evidenceUrl, hrApprovalStatus, incentiveAmount, rejectionReason, ... }`

### `DELETE /api/logs/:id`
Deletes a reading log entry.

## Books (Borrowing)

### `POST /api/books/borrow`
Creates a reading log entry specifically for borrowing a book.
- **Body:** `{ title, category, location, source, evidenceUrl, userName, employee_id }`

### `POST /api/books/return`
Updates a reading log entry to mark a book as returned/finished.
- **Body:** `{ id, review, link, evidenceUrl, readingDuration, startDate, finishDate }`

### `GET /api/simasset/books-history`
Fetches book borrowing history from SimAsset.
- **Query Params:** `employeeId`, `title`, `startDate`, `endDate`

## Training Requests

### `GET /api/training`
Returns all training requests.

### `POST /api/training`
Submits a new training request.
- **Body:** `{ title, vendor, cost, date, employeeName, employee_id, employeeRole, justification, evidenceUrl, ... }`

### `POST /api/training/:id/approve`
Approves or rejects a training request.
- **Body:** `{ action: 'approve' | 'reject', reason, approverName, ... }`

## Meetings

### `GET /api/meetings`
Returns all scheduled meetings.

### `POST /api/meetings`
Creates a new meeting.
- **Body:** `{ title, date, time, host, location, type, meetLink, agenda, guests, ... }`

### `PUT /api/meetings/:id`
Updates a meeting.

### `DELETE /api/meetings/:id`
Cancels a meeting.

## Courses & Modules

### `GET /api/courses`
Returns all courses with their modules.

### `POST /api/courses`
Creates a new course with modules.
- **Body:** `{ title, category, description, duration, modules: [ ... ] }`

### `PUT /api/courses/:id`
Updates a course and its modules.

### `DELETE /api/courses/:id`
Deletes a course.

## Progress & Quizzes

### `GET /api/progress/:userId/:courseId`
Returns a user's progress for a specific course.

### `POST /api/progress/complete`
Marks a module as completed.
- **Body:** `{ userId, courseId, moduleId, employee_id }`

### `POST /api/progress/time`
Logs time spent on a module.
- **Body:** `{ userId, courseId, moduleId, timestamp }`

### `POST /api/quiz/submit`
Submits a quiz score.
- **Body:** `{ studentId, studentName, courseId, moduleId, score }`

### `GET /api/quiz/results/:userId/:courseId`
Returns quiz results for a user in a course.

### `GET /api/admin/quiz-reports`
Returns all quiz results for admin reporting.

## Incentives

### `GET /api/incentives`
Returns all incentive records.

### `POST /api/incentives`
Creates a new incentive record.
- **Body:** `{ employeeName, employee_id, courseName, description, startDate, endDate, evidenceUrl, status }`

### `PUT /api/incentives/:id`
Updates an incentive record (e.g., approval, payment details).
- **Body:** `{ status, reward, paymentType, approvedDate, ... }`

### `DELETE /api/incentives/:id`
Deletes an incentive record.

## File Upload

### `POST /api/upload`
Uploads a file.
- **Body:** Form-data with `file` field.
- **Response:** `{ success: true, fileUrl: '/uploads/filename.ext' }`

## External API (Client Systems)

For other systems that call the LMS without a user login. Uses the OAuth2 `client_credentials` flow: exchange the client credentials for a Bearer token, then send it as `Authorization: Bearer <access_token>` on every `/api/external/v1/*` call. Credentials come from `EXTERNAL_API_CLIENT_ID` / `EXTERNAL_API_CLIENT_SECRET` in `.env`; token lifetime is `EXTERNAL_API_TOKEN_TTL` seconds (default 3600).

Errors use the shape `{ error, error_description }`.

A client-facing version of this section is served at `GET /api-docs` (public, no login; page source: `server/api-docs.html`). Share that URL with client systems instead of this file, and keep both in sync when the endpoints change.

### `POST /api/oauth/token`
Issues an access token.
- **Body:** `{ grant_type: 'client_credentials', client_id, client_secret }` (JSON or form-urlencoded)
- **Response:** `{ access_token, token_type: 'Bearer', expires_in }`

```bash
curl -X POST https://lms.example.com/api/oauth/token \
  -H "Content-Type: application/json" \
  -d '{ "grant_type": "client_credentials", "client_id": "CLIENT_ID", "client_secret": "CLIENT_SECRET" }'
```

### `GET /api/external/v1/employees/:employeeId/learning-hours`
Returns an employee's total learning hours, broken down by source.
- **Query Params:** `startDate`, `endDate` (optional)

### `GET /api/external/v1/reading-logs/categories`
Returns the valid `category` values for starting a reading log, so clients can show a picker instead of typing them.
- **Response:** `{ categories: ['Buku Fiksi/Novel', 'Majalah', ...] }`

### `POST /api/external/v1/reading-logs`
Reports a finished personal book - the API version of the in-app "Report Private Reading" form. Saves the log as `status: 'Finished'`, `hr_approval_status: 'Draft'`, `source: 'Personal Book'`, `location: 'Personal'`; the employee then claims the incentive in the LMS. Also syncs the reading note to Nusawork.
- **Content-Type:** `multipart/form-data` (includes the photo)
- **Fields:**
  - `email` (required) - the employee's LMS email, case-insensitive
  - `title` (required)
  - `category` (required, case-insensitive) - a value from `GET /api/external/v1/reading-logs/categories`
  - `start_date`, `finish_date` (required, ISO 8601) - `finish_date` must be more than 1 day after `start_date`, same rule as the in-app form
  - `review_link` (required)
  - `evidence` (required) - image file, max 10 MB, stored in `uploads/` like other uploads
  - `author` (optional)
- **Response:** `201` with `{ id, email, employee_id, name, title, author, category, source, status, hr_approval_status, start_date, finish_date, review_link, evidence_url }`

```bash
curl -X POST https://lms.example.com/api/external/v1/reading-logs \
  -H "Authorization: Bearer <access_token>" \
  -F "email=employee@nusa.id" \
  -F "title=Atomic Habits" \
  -F "category=Buku Pengembangan Diri" \
  -F "start_date=2026-10-01" \
  -F "finish_date=2026-10-15" \
  -F "review_link=https://docs.google.com/document/d/xxxx" \
  -F "evidence=@/path/to/photo.jpg"
```

### `POST /api/external/v1/external-trainings`
Files an external training "Permintaan Baru" that is already approved by the employee's leader (`findApprovingLeaders`, the same leaders who see it under Team Approvals; the first one is recorded in `approved_by` under their LMS user name) - the API version of the in-app request form plus the leader's Approve button. Inserts the request, then runs the same approval step as `POST /api/external-training/approve` (`approveExternalTrainingRequest`: budget notice for the CC list), and sends HR the usual "approved" IS5 ticket. The leader notification is skipped since the request is already approved.
- **Content-Type:** `multipart/form-data` (can include a file)
- **Fields:**
  - `email` (required) - the employee's LMS email, case-insensitive
  - `category` (required, case-insensitive) - the value saved in the database; only these 3:

    | Value | Label in the LMS (EN) | Label in the LMS (ID) |
    |---|---|---|
    | `Sertifikat` | Training with Competency Certification | Pelatihan dengan Sertifikasi Kompetensi |
    | `Training` | Training with Certificate of Participation | Pelatihan dengan Sertifikat Kepesertaan |
    | `Modul` | E-Learning / Self-Paced Learning | E-Learning / Pembelajaran Mandiri |

  - `title`, `vendor`, `location` (required)
  - `start_date`, `end_date` (required, ISO 8601; a bare date is read as WIB midnight, like the web form) - `end_date` cannot be before `start_date`
  - `registration_fee` (optional, default 0) - when more than 0, `payment_method` (`Reimbursement` / `Direct Payment`) is required
  - `attachment` (optional) - image or PDF, max 10 MB; or `attachment_link` (optional URL, category `Modul` only, as in the web form) instead, not both
  - `cc_emails` (optional) - comma-separated emails, each must be a registered employee
  - `approval_note` (optional, default `Approved via external API`)
- **Response:** `201` with `{ id, email, employee_id, name, category, title, vendor, location, start_date, end_date, registration_fee, payment_method, attachment_url, cc_employee_ids, status: 'Approved', approved_by, approval_note, exceeds_personal_budget }`
- **422** `no_leader` when the employee has no active leader in SimAsset.

```bash
curl -X POST https://lms.example.com/api/external/v1/external-trainings \
  -H "Authorization: Bearer <access_token>" \
  -F "email=employee@nusa.id" \
  -F "category=Training" \
  -F "title=AWS Solutions Architect Associate" \
  -F "vendor=Training Provider" \
  -F "location=Jakarta" \
  -F "start_date=2026-11-03" \
  -F "end_date=2026-11-04" \
  -F "registration_fee=2500000" \
  -F "payment_method=Direct Payment" \
  -F "attachment=@/path/to/brochure.pdf"
```

### Error codes

| Status | Meaning |
|---|---|
| `401` | Missing, invalid, or expired access token |
| `400` | Missing required field, file of the wrong type / over 10 MB, unknown `category`, invalid date, or a broken field rule (reading period of 1 day or less, fee without `payment_method`, unknown `cc_emails`, ...) |
| `404` | Email not registered |
| `409` | Already submitted, e.g. a retried request. Reading log: same email, title, start and finish date (body includes `reading_log`). External training: same email, title and start date (body includes `external_training`). |
| `422` | External training only: the employee has no active leader in SimAsset (`no_leader`). |
