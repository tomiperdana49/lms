# Frontend Documentation

The frontend is a Single Page Application (SPA) built with **React**, **TypeScript**, and **Vite**. It uses `tailwindcss` for styling.

## Architecture

- **Entry Point:** `src/main.tsx` renders the `App` component.
- **Routing:** The application uses state-based routing (`activePage` state in `App.tsx`) instead of a library like `react-router-dom`.
- **Authentication:** Managed via `GoogleOAuthProvider` and a local `user` state in `App.tsx`.
- **API Communication:** Components fetch data directly from the backend API using `fetch`.

## Key Components

### 1. `App.tsx`
- **Responsibility:** Main application container. Handles authentication state, user role, and navigation between pages.
- **State:** `user` (User object), `activePage` (Current view).

### 2. `DashboardLayout` (`src/components/DashboardLayout.tsx`)
- **Responsibility:** Provides the persistent sidebar navigation and header. Wraps the active page content.
- **Props:** `activePage`, `userRole`, `onNavigate`, `onLogout`.

### 3. `DashboardHome` (`src/components/DashboardHome.tsx`)
- **Responsibility:** The landing page after login. Displays widgets for quick access to features (Reading Log, Training, Calendar, etc.).

### 4. `ReadingLogPage` (`src/components/ReadingLogPage.tsx`)
- **Responsibility:** Allows users to log books they've read, submit reviews, and view their history.
- **Features:** Book search, manual entry, evidence upload.

### 5. `CoursePlayer` (`src/components/CoursePlayer.tsx`)
- **Responsibility:** The core learning interface.
- **Features:**
    - Displays list of courses and modules.
    - Video player (YouTube integration).
    - Progress tracking (unlocking modules).
    - Quiz interface.

### 6. `TrainingExternalForm` & `TrainingExternalManager`
- **Responsibility:** Handling external training requests.
- **Form:** Employees submit requests with details and costs.
- **Manager:** Supervisors and HR review, approve, or reject requests.

### 7. `LMSCalendar` (`src/components/LMSCalendar.tsx`)
- **Responsibility:** Displays scheduled meetings and training events.
- **Features:** Create new meetings, invite guests (email integration).

### 8. `AdminDashboard` (`src/components/AdminDashboard.tsx`)
- **Responsibility:** Central hub for HR/Admin tasks.
- **Features:**
    - User Management (`UserManagement.tsx`).
    - Incentive Management (`IncentiveManager.tsx`).
    - Reports (Reading Logs, Quiz Results).

## State Management

- **Local State:** Most components manage their own data using `useState` and `useEffect`.
- **Global State:** Authentication and user profile are passed down from `App.tsx` via props.
- **Data Persistence:** Relies on the backend database. No complex client-side caching (like Redux or React Query) is currently implemented, but `fetch` calls are used extensively.

## Styling

- **Tailwind CSS:** Used for all styling.
- **Icons:** `lucide-react` library.
