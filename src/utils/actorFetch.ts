import { API_BASE_URL } from '../config';

// Stamps every call to our own API with who is making it, so the server's activity log (Admin
// Panel > Logs) can attribute write requests without each component passing the user along.
// Values are URI-encoded because header values must be Latin-1 and names often aren't.
export const installActorFetch = () => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
        if (!url || !url.startsWith(API_BASE_URL)) return originalFetch(input, init);

        let user: Record<string, unknown> | null = null;
        try {
            const saved = localStorage.getItem('lms_user');
            user = saved ? JSON.parse(saved) : null;
        } catch {
            user = null;
        }
        if (!user) return originalFetch(input, init);

        const headers = new Headers(init?.headers);
        const setActor = (name: string, value: unknown) => {
            if (value !== undefined && value !== null && value !== '') headers.set(name, encodeURIComponent(String(value)));
        };
        setActor('X-Actor-Id', user.id);
        setActor('X-Actor-Employee-Id', user.employee_id);
        setActor('X-Actor-Name', user.name);
        setActor('X-Actor-Email', user.email);
        setActor('X-Actor-Role', user.role);

        return originalFetch(input, { ...init, headers });
    };
};
