import { useState, useEffect } from 'react';
import DashboardLayout from './components/DashboardLayout';
import DashboardHome from './components/DashboardHome';
import ReadingLogPage from './components/ReadingLogPage';
import CoursePlayer from './components/CoursePlayer';
import TrainingInternalList from './components/TrainingInternalList';
import TrainingExternalForm from './components/TrainingExternalForm';
import TrainingExternalManager from './components/TrainingExternalManager';
import LMSCalendar from './components/LMSCalendar';
import LoginPage from './components/LoginPage';
import UserManagement from './components/UserManagement';
import AdminDashboard from './components/AdminDashboard';
import IncentiveManager from './components/IncentiveManager';
import PinjamBukuForm from './components/PinjamBukuForm';
import type { Page, Role, User } from './types';

import { GoogleOAuthProvider } from '@react-oauth/google';

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('lms_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  
  const [activePage, setActivePage] = useState<Page>(() => {
    if (window.location.pathname === '/pinjam-buku') return 'pinjam-buku';
    
    const savedPage = localStorage.getItem('lms_active_page');
    
    // Prevent auto-redirecting to /pinjam-buku when user specifically visits root /
    if (window.location.pathname === '/' && savedPage === 'pinjam-buku') {
      return 'dashboard';
    }
    
    return (savedPage as Page) || 'dashboard';
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('lms_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('lms_user');
    }
  }, [user]);

  useEffect(() => {
    if (activePage) {
      localStorage.setItem('lms_active_page', activePage);
      // Synchronize URL without appending to history
      if (activePage === 'pinjam-buku' && window.location.pathname !== '/pinjam-buku') {
        window.history.replaceState(null, '', '/pinjam-buku');
      } else if (activePage !== 'pinjam-buku' && window.location.pathname === '/pinjam-buku') {
        window.history.replaceState(null, '', '/');
      }
    }
  }, [activePage]);

  // REPLACE THIS WITH YOUR ACTUAL GOOGLE CLIENT ID
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "735607886412-vgmgsm981577uhg72etjeoh30jjp8trs.apps.googleusercontent.com";

  // If not logged in, show Login Page
  if (!user) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <LoginPage onLogin={setUser} />
      </GoogleOAuthProvider>
    );
  }

  // Mock logout for demo
  const handleLogout = () => {
    setUser(null);
    setActivePage('dashboard');
    localStorage.removeItem('lms_user');
    localStorage.removeItem('lms_active_page');
  };

  // We use the logged-in user's role
  const userRole: Role = user.role;

  if (activePage === 'pinjam-buku') {
    return (
        <PinjamBukuForm user={user!} onClose={() => setActivePage('dashboard')} />
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <DashboardLayout
        activePage={activePage}
        onNavigate={setActivePage}
        userRole={userRole}
        user={user!}
        onLogout={handleLogout}
        onRoleChange={(role) => setUser({ ...user!, role })}
      >
        {activePage === 'dashboard' && <DashboardHome onNavigate={setActivePage} userRole={userRole} userEmail={user?.email} userName={user?.name} />}
        {activePage === 'reading-log' && (
          <ReadingLogPage
            user={user!}
            onBack={() => setActivePage('dashboard')}
          />
        )}
        {activePage === 'courses' && <CoursePlayer user={user!} />}
        {activePage === 'internal' && <TrainingInternalList userRole={userRole} userEmail={user?.email || ''} />}


        {/* External Training: Request Form (For Everyone) */}
        {activePage === 'external' && (
          <TrainingExternalForm user={user!} onNavigate={(p) => setActivePage(p as Page)} />
        )}

        {/* External Training: Team Approvals (For Supervisor) */}
        {activePage === 'external-approval' && userRole === 'SUPERVISOR' && (
          <TrainingExternalManager userRole={userRole} userName={user?.name} />
        )}

        {activePage === 'calendar' && <LMSCalendar userEmail={user?.email} />}
        {/* User Management Route - Only for HR */}
        {activePage === 'users' && <UserManagement userRole={userRole} onBack={() => setActivePage('dashboard')} />}

        {activePage === 'incentives' && (
          <IncentiveManager user={user!} viewMode="personal" />
        )}

        {/* Admin Panel Route */}
        {activePage === 'admin-dashboard' && (userRole === 'HR' || userRole === 'HR_ADMIN') && (
          <AdminDashboard
            user={user!}
            onNavigate={setActivePage}
            onLogout={handleLogout}
          />
        )}
      </DashboardLayout>
    </GoogleOAuthProvider>
  );
}

export default App;
