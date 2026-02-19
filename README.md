# LMS (Learning Management System)

A comprehensive Learning Management System built with React, TypeScript, and Express.js, designed to manage employee training, reading logs, and internal courses.

## Features

- **User Management:** Google OAuth authentication and role-based access control (Staff, Supervisor, HR).
- **Training Requests:** Workflow for submitting and approving external training requests.
- **Reading Logs:** Track employee reading habits, reviews, and verify evidence.
- **Internal Courses:** Video-based courses with progress tracking and quizzes.
- **Meeting Scheduler:** Organize meetings, invite guests, and track costs.
- **Incentives:** Manage financial rewards for completed training and reading.
- **SimAsset Integration:** Syncs employee data and asset borrowing history from an external system.

## Documentation

- [Setup Guide](docs/SETUP.md) - Installation and configuration instructions.
- [Database Schema](docs/DATABASE.md) - Detailed database structure.
- [API Documentation](docs/API.md) - Backend API endpoints.
- [Frontend Architecture](docs/FRONTEND.md) - Overview of the React application structure.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express.js
- **Database:** MySQL (mysql2)
- **Email:** Nodemailer (Gmail SMTP)
- **Auth:** Google OAuth 2.0

## Quick Start

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Configure `.env` (see [Setup Guide](docs/SETUP.md)).
4.  Run the development server: `npm run dev:full`

## Project Structure

- `src/`: Frontend source code (React components).
- `server/`: Backend source code (Express server, database logic).
- `simasset_databases_sql/`: Database dumps for the external SimAsset system.
- `scripts/`: Utility scripts for data migration and testing.
- `docs/`: Project documentation.
