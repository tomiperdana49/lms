# Setup Guide

## Prerequisites
- Node.js (v18+)
- MySQL (v8.0+)
- Google Cloud Console Project (for OAuth)
- Gmail App Password (for email notifications)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd lms
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Configuration:**
    Create a `.env` file in the root directory with the following variables:

    ```env
    # Database Configuration (LMS)
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=your_password
    DB_NAME=lms_db
    PORT=3001

    # Frontend Configuration
    VITE_API_BASE_URL=http://localhost:3001

    # Database Configuration (SimAsset Integration)
    SIMAS_HOST=localhost
    SIMAS_USER=root
    SIMAS_PASSWORD=your_password
    SIMAS_NAME=simasset
    SIMAS_PORT=3306

    # Email Service (Gmail SMTP)
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your_email@gmail.com
    SMTP_PASS=your_app_password

    # Google OAuth (Optional - required for real login)
    VITE_GOOGLE_CLIENT_ID=your_google_client_id
    ```

    **Note:** 
    - You can use the provided `.env.example` as a template.
    - If you don't have a `simasset` database, the application will still run, but employee syncing features will fail gracefully or show errors in logs.

## Running the Application

1.  **Start the Backend Server:**
    ```bash
    npm run server
    ```
    This starts the Express server on port `3001` (as configured in `.env`). It will automatically initialize the database tables if they don't exist.

2.  **Start the Frontend Development Server:**
    ```bash
    npm run dev
    ```
    This starts the Vite server (usually on `http://localhost:5173`).

3.  **Run Both Concurrently:**
    ```bash
    npm run dev:full
    ```

4.  **Open in Browser:**
    Navigate to `http://localhost:5173` (or the port shown in the terminal).

## Default Accounts (Debug Mode)

If Google OAuth is not configured, you can use the debug bypass login:

- **Staff:**
  - Email: `staff@nusa.com`
  - Password: `123`

- **HR Admin:**
  - Email: `hr@nusa.com`
  - Password: `123`

## Troubleshooting

- **Database Errors:** Ensure MySQL is running and the credentials in `.env` are correct.
- **Email Errors:** Check your internet connection and ensure the App Password for Gmail is generated correctly (not your regular password).
- **Google Login:** Ensure the authorized origin in your Google Cloud Console matches your frontend URL (e.g., `http://localhost:5173`).
