import { useState } from 'react';
import DashboardLayout from './components/DashboardLayout';
import DashboardHome from './components/DashboardHome';
import ReadingLogPage from './components/ReadingLogPage';
import CoursePlayer from './components/CoursePlayer';
import InternalMeetingList from './components/InternalMeetingList';
import TrainingRequestForm from './components/TrainingRequestForm';
import LMSCalendar from './components/LMSCalendar';
import LoginPage from './components/LoginPage';
import UserManagement from './components/UserManagement';
import AdminDashboard from './components/AdminDashboard';
import type { Page, Role, User } from './types';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activePage, setActivePage] = useState<Page>('dashboard');
  /* readingLogs removed */

  // If not logged in, show Login Page
  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  // Mock logout for demo
  const handleLogout = () => setUser(null);

  // We use the logged-in user's role
  const userRole: Role = user.role;

  return (
    <DashboardLayout
      activePage={activePage}
      onNavigate={setActivePage}
      userRole={userRole}
      // Actually, let's update DashboardLayout to show Logout instead of just switch.
      // For now, let's keep the prop to avoid breaking build, but effective role comes from user.
      onLogout={handleLogout}
      onRoleChange={(role) => setUser({ ...user, role })}
    >
      {activePage === 'dashboard' && <DashboardHome onNavigate={setActivePage} userRole={userRole} userEmail={user?.email} userName={user?.name} />}
      {activePage === 'reading-log' && (
        <ReadingLogPage
          user={user!}
          onBack={() => setActivePage('dashboard')}
        />
      )}
      {activePage === 'courses' && <CoursePlayer user={user!} />}
      {activePage === 'internal' && <InternalMeetingList userRole={userRole} userEmail={user?.email || ''} />}
      {activePage === 'external' && <TrainingRequestForm userRole={userRole} userName={user?.name} />}
      {activePage === 'calendar' && <LMSCalendar userEmail={user?.email} />}
      {/* User Management Route - Only for HR */}
      {activePage === 'users' && <UserManagement userRole={userRole} onBack={() => setActivePage('dashboard')} />}

      {/* Admin Panel Route - Replaces individual admin routes for a unified dashboard */}
      {activePage === 'admin-dashboard' && (userRole === 'HR' || userRole === 'HR_ADMIN') && (
        <AdminDashboard
          user={user!}
          onNavigate={setActivePage}
          onLogout={handleLogout}
        />
      )}
    </DashboardLayout>
  );
}

export default App;
