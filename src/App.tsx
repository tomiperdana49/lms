import { useState, useEffect, useRef } from 'react';
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
import LearningReport from './components/LearningReport';
import VerifyCertificate from './components/VerifyCertificate';
import HelpPage from './components/HelpPage';
import IDPPage from './components/IDPPage';
import PostTrainingEvaluationTeam from './components/PostTrainingEvaluationTeam';
import type { Page, Role, User } from './types';

import { GoogleOAuthProvider } from '@react-oauth/google';

// Session policy: 30 min idle timeout, 8 hour absolute timeout, renewed on every user activity.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const SESSION_CHECK_INTERVAL_MS = 15 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000;
const LOGIN_AT_KEY = 'lms_login_at';
const LAST_ACTIVITY_KEY = 'lms_last_activity';

// Mirrors the Page union in types.ts - kept as a runtime list so a URL path (typed by hand, or
// visited via back/forward) can be validated before being cast to Page.
const VALID_PAGES: Page[] = ['dashboard', 'reading-log', 'courses', 'internal', 'external', 'external-approval', 'pte-team', 'calendar', 'users', 'admin-logs', 'admin-dashboard', 'incentives', 'learning-report', 'help', 'idp'];
const isValidPage = (value: string): value is Page => (VALID_PAGES as string[]).includes(value);

// These four live under the sidebar's "Training" group, so their URL nests the same way
// (/training/internal) instead of sitting flat at the root like every other page.
const TRAINING_SUB_PAGES: Page[] = ['internal', 'external', 'external-approval', 'pte-team'];

// Mirrors adminSubItems' `view` values in DashboardLayout.tsx - the Admin Panel's own sidebar
// group, nested under /admin/<view> (e.g. /admin/calendar) the same way Training nests.
const ADMIN_VIEWS = ['overview', 'calendar', 'users', 'courses', 'meetings', 'training', 'post-training-evaluation', 'logs', 'quiz-reports', 'reports', 'employee-learning-report', 'idp'];
const isValidAdminView = (value: string): boolean => ADMIN_VIEWS.includes(value);

// A couple of internal view ids don't read as their sidebar label (e.g. 'logs' is the "Reading
// Log" section) - give those a URL slug that matches what the menu actually says instead of the
// internal id. Every other view's slug is just its id.
const ADMIN_VIEW_TO_SLUG: Record<string, string> = { logs: 'reading-log', users: 'user-management' };
const ADMIN_SLUG_TO_VIEW: Record<string, string> = Object.fromEntries(
    Object.entries(ADMIN_VIEW_TO_SLUG).map(([view, slug]) => [slug, view])
);
const adminViewToSlug = (view: string): string => ADMIN_VIEW_TO_SLUG[view] || view;
const adminSlugToView = (slug: string): string | null => {
    if (ADMIN_SLUG_TO_VIEW[slug]) return ADMIN_SLUG_TO_VIEW[slug];
    return ADMIN_VIEWS.includes(slug) ? slug : null;
};

// adminView doubles as a generic "last view" hint for non-admin deep links (e.g. External
// Training's team-approvals tab), so it isn't always a real admin view - fall back to overview
// rather than putting that unrelated value into the admin URL.
const pageToPath = (page: Page, adminView: string): string => {
    if (page === 'admin-dashboard') return `/admin/${adminViewToSlug(isValidAdminView(adminView) ? adminView : 'overview')}`;
    if (TRAINING_SUB_PAGES.includes(page)) return `/training/${page}`;
    return `/${page}`;
};

const pathToRoute = (pathname: string): { page: Page; adminView?: string } | null => {
    const trimmed = pathname.replace(/^\/+/, '');
    if (trimmed.startsWith('admin/')) {
        const view = adminSlugToView(trimmed.slice('admin/'.length));
        return view ? { page: 'admin-dashboard', adminView: view } : null;
    }
    if (trimmed.startsWith('training/')) {
        const sub = trimmed.slice('training/'.length);
        return TRAINING_SUB_PAGES.includes(sub as Page) ? { page: sub as Page } : null;
    }
    return isValidPage(trimmed) ? { page: trimmed } : null;
};

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

  // Deep links (e.g. from WhatsApp notifications, or the dashboard's "Perlu Tindakan Anda" widget)
  // can force the External Training tab via ?tab= on load, or via onNavigate('external', tab) later.
  const [deepLinkTab, setDeepLinkTab] = useState<string | null>(() => new URLSearchParams(window.location.search).get('tab'));

  const [activePage, setActivePage] = useState<Page>(() => {
    // A path like /dashboard, /training/internal or /admin/calendar (typed directly, bookmarked,
    // or restored via refresh) wins over the legacy ?page= deep link and the last page remembered
    // in localStorage.
    const route = pathToRoute(window.location.pathname);
    if (route) return route.page;
    const linkedPage = new URLSearchParams(window.location.search).get('page');
    if (linkedPage) return linkedPage as Page;
    const savedPage = localStorage.getItem('lms_active_page');
    return (savedPage as Page) || 'dashboard';
  });

  // Strip the deep-link query params once read, so they don't linger in the URL bar or get re-applied on refresh.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const [adminView, setAdminView] = useState<string>(() => {
    const route = pathToRoute(window.location.pathname);
    if (route?.adminView) return route.adminView;
    return localStorage.getItem('lms_admin_view') || 'overview';
  });

  const [config, setConfig] = useState<{ moduleInternal: boolean; moduleExternal: boolean; moduleIncentive: boolean; moduleIDP: boolean }>({
    moduleInternal: false,
    moduleExternal: false,
    moduleIncentive: false,
    moduleIDP: false
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
            moduleIncentive: !!data.moduleIncentive,
            moduleIDP: !!data.moduleIDP
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

  // LoginPage renders below regardless of the URL whenever there's no user, so the address bar
  // should say so too - shows /login on logout, on session expiry, and for a fresh unauthenticated
  // visit to any URL. Once logged back in, the activePage-sync effect takes back over and moves
  // the URL to wherever activePage points.
  useEffect(() => {
    if (!user && window.location.pathname !== '/login') {
      window.history.replaceState({}, '', '/login');
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

  // Keeps the address bar in sync with the active page (e.g. clicking "Dashboard" in the sidebar
  // shows /dashboard, "Internal" under Training shows /training/internal, an Admin Panel section
  // shows /admin/<view>) - replaceState on the very first sync (page load) so it doesn't add a
  // spare history entry before the user has navigated anywhere, pushState afterwards so
  // back/forward work. Depends on adminView too, since navigating within the Admin Panel changes
  // the URL without necessarily changing activePage. Skipped while logged out - activePage isn't
  // what's on screen then (LoginPage is, regardless of its value), and syncing it would stomp the
  // /login the effect below just set.
  const hasSyncedUrlOnce = useRef(false);
  useEffect(() => {
    if (!activePage || !user) return;
    localStorage.setItem('lms_active_page', activePage);

    const targetPath = pageToPath(activePage, adminView);
    if (window.location.pathname !== targetPath) {
      if (hasSyncedUrlOnce.current) {
        window.history.pushState({ page: activePage, adminView }, '', targetPath);
      } else {
        window.history.replaceState({ page: activePage, adminView }, '', targetPath);
      }
    }
    hasSyncedUrlOnce.current = true;
  }, [activePage, adminView, user]);

  // Browser back/forward - read the page back out of the URL instead of the history state object,
  // since state is empty for entries that existed before this SPA-routing sync was added.
  useEffect(() => {
    const handlePopState = () => {
      const route = pathToRoute(window.location.pathname);
      if (!route) return;
      setActivePage(route.page);
      if (route.adminView) setAdminView(route.adminView);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Admin Panel is HR/HR_ADMIN only (enforced again at render below, which is what used to make
  // this render blank instead of wrong). Now that /admin/... is a real, guessable/bookmarkable
  // URL, a staff account landing here - via a shared link, stale localStorage, or a role
  // downgrade while already on the page - must bounce to the dashboard, not sit on a blank page.
  useEffect(() => {
    if (activePage === 'admin-dashboard' && user && user.role !== 'HR' && user.role !== 'HR_ADMIN') {
      setActivePage('dashboard');
    }
  }, [activePage, user]);

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
          if (view) {
            setAdminView(view);
            if (page === 'external') setDeepLinkTab(view);
          }
        }}
        userRole={userRole}
        user={user!}
        onLogout={handleLogout}
        onRoleChange={(role) => setUser({ ...user!, role })}
        adminView={adminView}
        config={config}
      >
        {activePage === 'dashboard' && (
          <DashboardHome
            onNavigate={(page, view) => {
              setActivePage(page);
              if (view) {
                setAdminView(view);
                if (page === 'external') setDeepLinkTab(view);
              }
            }}
            userRole={userRole}
            isSupervisor={user?.isSupervisor}
            userEmail={user?.email}
            userName={user?.name}
            userEmployeeId={user?.employee_id}
            config={config}
          />
        )}
        {activePage === 'reading-log' && (
          <ReadingLogPage
            user={user!}
            onBack={() => setActivePage('dashboard')}
          />
        )}
        {activePage === 'courses' && <CoursePlayer user={user!} />}
        {activePage === 'internal' && <TrainingInternalList userRole={userRole} user={user!} isManagementMode={false} />}
        {activePage === 'pte-team' && <PostTrainingEvaluationTeam user={user!} />}
        {activePage === 'help' && <HelpPage />}
        {activePage === 'idp' && <IDPPage currentUser={user} />}


        {/* External Training (Unified Component) */}
        {activePage === 'external' && (
          <ExternalTraining
            currentUser={user!}
            isManagementMode={userRole === 'HR' || userRole === 'HR_ADMIN'}
            defaultTab={deepLinkTab === 'team_approvals' ? 'team_approvals' : undefined}
          />
        )}

        {activePage === 'calendar' && <LMSCalendar userEmail={user?.email} />}

        {activePage === 'learning-report' && (
          <LearningReport
            userEmail={user?.email}
            userName={user?.name}
            userEmployeeId={user?.employee_id}
            isSupervisor={user?.isSupervisor}
          />
        )}
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
