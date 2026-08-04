import { useState, useEffect } from 'react';
import { API_BASE_URL } from './config';
import DashboardLayout from './components/DashboardLayout';
import DashboardHome from './components/DashboardHome';
import ReadingLogPage from './components/ReadingLogPage';
import CoursePlayer from './components/CoursePlayer';
import TrainingInternalList from './components/TrainingInternalList';

import ExternalTraining from './components/ExternalTraining';
import LMSCalendar from './components/LMSCalendar';
import LoginPage from './components/LoginPage';
import UserManagement from './components/UserManagement';
import AdminDashboard from './components/AdminDashboard';
import IncentiveManager from './components/IncentiveManager';
import VerifyCertificate from './components/VerifyCertificate';
import type { Page, Role, User } from './types';

import { GoogleOAuthProvider } from '@react-oauth/google';

// Session policy: 30 min idle timeout, 8 hour absolute timeout, renewed on every user activity.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const SESSION_CHECK_INTERVAL_MS = 15 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000;
const LOGIN_AT_KEY = 'lms_login_at';
const LAST_ACTIVITY_KEY = 'lms_last_activity';

function App() {
  // Public certificate verification page - accessible without login, no hooks used above this check.
  if (window.location.pathname.startsWith('/verify/')) {
    const serial = window.location.pathname.split('/verify/')[1] || '';
    return <VerifyCertificate serial={decodeURIComponent(serial)} />;
  }

  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('lms_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [sessionExpiredReason, setSessionExpiredReason] = useState<'idle' | 'absolute' | null>(null);

  const [activePage, setActivePage] = useState<Page>(() => {
    const savedPage = localStorage.getItem('lms_active_page');
    return (savedPage as Page) || 'dashboard';
  });

  const [adminView, setAdminView] = useState<string>(() => {
    return localStorage.getItem('lms_admin_view') || 'overview';
  });

  const [config, setConfig] = useState<{ moduleInternal: boolean; moduleExternal: boolean; moduleIncentive: boolean }>({
    moduleInternal: false,
    moduleExternal: false,
    moduleIncentive: false
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/config`);
        if (res.ok) {
          const data = await res.json();
          setConfig({
            moduleInternal: !!data.moduleInternal,
            moduleExternal: !!data.moduleExternal,
            moduleIncentive: !!data.moduleIncentive
          });
        }
      } catch (err) {
        console.error('Failed to fetch config:', err);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('lms_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('lms_user');
    }
  }, [user]);

  const forceLogout = (reason: 'idle' | 'absolute') => {
    setUser(null);
    setActivePage('dashboard');
    localStorage.removeItem('lms_user');
    localStorage.removeItem('lms_active_page');
    localStorage.removeItem(LOGIN_AT_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setSessionExpiredReason(reason);
  };

  // Session policy: initialize login/activity timestamps.
  // Runs whenever `user` becomes truthy (fresh login, or restored from localStorage on reload).
  useEffect(() => {
    if (!user) return;
    const now = String(Date.now());
    if (!localStorage.getItem(LOGIN_AT_KEY)) {
      localStorage.setItem(LOGIN_AT_KEY, now);
    }
    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      localStorage.setItem(LAST_ACTIVITY_KEY, now);
    }
  }, [user]);

  // Session policy: renew (touch last-activity) on any user interaction, throttled to avoid
  // hammering localStorage. Shared across tabs via localStorage so idle time resets everywhere.
  useEffect(() => {
    if (!user) return;
    let lastWrite = 0;
    const touchActivity = () => {
      const now = Date.now();
      if (now - lastWrite > ACTIVITY_WRITE_THROTTLE_MS) {
        lastWrite = now;
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      }
    };
    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    events.forEach(evt => window.addEventListener(evt, touchActivity, { passive: true }));
    return () => events.forEach(evt => window.removeEventListener(evt, touchActivity));
  }, [user]);

  // Session policy: enforce idle (30 min) and absolute (8 hour) timeouts, forcing logout on expiry.
  useEffect(() => {
    if (!user) return;
    const checkTimeouts = () => {
      const now = Date.now();
      const loginAt = Number(localStorage.getItem(LOGIN_AT_KEY)) || now;
      const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || now;

      if (now - lastActivity >= IDLE_TIMEOUT_MS) {
        forceLogout('idle');
      } else if (now - loginAt >= ABSOLUTE_TIMEOUT_MS) {
        forceLogout('absolute');
      }
    };

    checkTimeouts(); // catch expiry that happened while the tab/browser was closed
    const intervalId = setInterval(checkTimeouts, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [user]);

  useEffect(() => {
    if (activePage) {
      localStorage.setItem('lms_active_page', activePage);
    }
  }, [activePage]);

  useEffect(() => {
    if (adminView) {
      localStorage.setItem('lms_admin_view', adminView);
    }
  }, [adminView]);

  // Refresh user profile/supervisor status on page load (reload)
  useEffect(() => {
    const refreshUserSession = async () => {
      const savedUser = localStorage.getItem('lms_user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.email) {
            const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: parsed.email })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.user) {
                console.log('[AUTH] Session refreshed on reload:', data.user);
                setUser(data.user);
              }
            }
          }
        } catch (err) {
          console.error('[AUTH] Failed to refresh session on reload:', err);
        }
      }
    };
    refreshUserSession();
  }, []);

  // Session Epoch Check (Force logout if version mismatches)
  useEffect(() => {
    const checkSessionEpoch = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/session-epoch`);
        if (res.ok) {
          const data = await res.json();
          const serverEpoch = data.epoch;
          const localEpoch = localStorage.getItem('lms_session_epoch');
          const hasUser = !!localStorage.getItem('lms_user');

          if (hasUser && localEpoch !== serverEpoch) {
            console.log(`[AUTH] Session epoch mismatch (local: ${localEpoch}, server: ${serverEpoch}). Forcing logout...`);
            setUser(null);
            setActivePage('dashboard');
            localStorage.removeItem('lms_user');
            localStorage.removeItem('lms_active_page');
          }
          localStorage.setItem('lms_session_epoch', serverEpoch);
        }
      } catch (err) {
        console.error('Failed to check session epoch:', err);
      }
    };

    // Check immediately on load
    checkSessionEpoch();

    // Check periodically every 30 seconds
    const intervalId = setInterval(checkSessionEpoch, 30000);
    return () => clearInterval(intervalId);
  }, []);

  // REPLACE THIS WITH YOUR ACTUAL GOOGLE CLIENT ID
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "735607886412-vgmgsm981577uhg72etjeoh30jjp8trs.apps.googleusercontent.com";

  // If not logged in, show Login Page
  if (!user) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <LoginPage
          onLogin={(loggedInUser) => {
            localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
            localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
            setUser(loggedInUser);
          }}
          sessionExpiredReason={sessionExpiredReason}
          onSessionExpiredReasonShown={() => setSessionExpiredReason(null)}
        />
      </GoogleOAuthProvider>
    );
  }

  // Mock logout for demo
  const handleLogout = () => {
    setUser(null);
    setActivePage('dashboard');
    localStorage.removeItem('lms_user');
    localStorage.removeItem('lms_active_page');
    localStorage.removeItem(LOGIN_AT_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  };

  // We use the logged-in user's role
  const userRole: Role = user.role;


  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <DashboardLayout
        activePage={activePage}
        onNavigate={(page, view) => {
          setActivePage(page);
          if (view) setAdminView(view);
        }}
        userRole={userRole}
        user={user!}
        onLogout={handleLogout}
        onRoleChange={(role) => setUser({ ...user!, role })}
        adminView={adminView}
        config={config}
      >
        {activePage === 'dashboard' && <DashboardHome onNavigate={setActivePage} userRole={userRole} userEmail={user?.email} userName={user?.name} config={config} />}
        {activePage === 'reading-log' && (
          <ReadingLogPage
            user={user!}
            onBack={() => setActivePage('dashboard')}
          />
        )}
        {activePage === 'courses' && <CoursePlayer user={user!} />}
        {activePage === 'internal' && <TrainingInternalList userRole={userRole} user={user!} isManagementMode={false} />}


        {/* External Training (Unified Component) */}
        {activePage === 'external' && (
          <ExternalTraining 
            currentUser={user!} 
            isManagementMode={userRole === 'HR' || userRole === 'HR_ADMIN'} 
          />
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
            initialView={adminView}
          />
        )}
      </DashboardLayout>
    </GoogleOAuthProvider>
  );
}

export default App;
