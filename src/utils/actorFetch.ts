import { API_BASE_URL } from '../config';

// Where the session token from /api/login or /api/auth/google is kept (see App.tsx).
export const AUTH_TOKEN_KEY = 'lms_token';
// Fired when the server rejects the stored token (expired, revoked by a session-epoch bump, or
// the account was removed) - App.tsx listens and logs the user out.
export const SESSION_INVALID_EVENT = 'lms:session-invalid';

// Attaches the session token to every call to our own API, so components don't each have to.
// The server identifies the caller (including for the Admin Panel > Logs activity log) from it.
export const installActorFetch = () => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
        if (!url || !url.startsWith(API_BASE_URL)) return originalFetch(input, init);

        let token: string | null = null;
        try {
            token = localStorage.getItem(AUTH_TOKEN_KEY);
        } catch {
            token = null;
        }
        if (!token) return originalFetch(input, init);

        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${token}`);
        const response = await originalFetch(input, { ...init, headers });
        if (response.status === 401) window.dispatchEvent(new Event(SESSION_INVALID_EVENT));
        return response;
    };
};
