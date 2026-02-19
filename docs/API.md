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
