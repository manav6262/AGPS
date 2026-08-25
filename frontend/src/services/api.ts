/**
 * AGPS Frontend API Client
 *
 * Handles HTTP requests, JWT header injection, refresh token rotation, and error normalization.
 */

// In development this stays '/api' and is proxied to localhost:5000 by Vite.
// In production VITE_API_URL points at the deployed API origin.
// Do NOT set VITE_API_URL in a local .env file — it would bypass the proxy.
const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

let currentAccessToken: string | null = localStorage.getItem('agps_token');

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
  if (token) {
    localStorage.setItem('agps_token', token);
  } else {
    localStorage.removeItem('agps_token');
  }
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: any;

  constructor(status: number, message: string, code?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (currentAccessToken) {
    headers['Authorization'] = `Bearer ${currentAccessToken}`;
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Include httpOnly refresh cookie
  };

  let response = await fetch(`${API_BASE}${endpoint}`, config);

  // If unauthorized and not already calling refresh/login, attempt silent refresh
  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    const refreshed = await silentRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${currentAccessToken}`;
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.message || data.error || 'An unexpected error occurred',
      data.error,
      data.details
    );
  }

  return data;
}

async function silentRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      setAccessToken(data.accessToken);
      return true;
    }
  } catch {
    // refresh failed
  }
  setAccessToken(null);
  return false;
}

// API Methods
export const api = {
  // Auth
  auth: {
    login: (credentials: { email: string; password: string }) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    register: (data: any) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    logout: () =>
      request('/auth/logout', { method: 'POST' }),
    me: () =>
      request('/auth/me'),
    refresh: () =>
      request('/auth/refresh', { method: 'POST' }),
  },

  // Tenders
  tenders: {
    list: (params?: Record<string, string>) => {
      const query = params ? `?${new URLSearchParams(params).toString()}` : '';
      return request(`/tenders${query}`);
    },
    getById: (id: string) =>
      request(`/tenders/${id}`),
    create: (data: any) =>
      request('/tenders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request(`/tenders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    transition: (id: string, targetStatus: string) =>
      request(`/tenders/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ targetStatus }),
      }),
    getBids: (id: string) =>
      request(`/tenders/${id}/bids`),
    submitBid: (id: string, bidData: any) =>
      request(`/tenders/${id}/bids`, {
        method: 'POST',
        body: JSON.stringify(bidData),
      }),
    evaluate: (id: string) =>
      request(`/tenders/${id}/evaluate`, { method: 'POST' }),
    getEvaluation: (id: string) =>
      request(`/tenders/${id}/evaluation`),
    confirmWinner: (id: string) =>
      request(`/tenders/${id}/award/confirm`, { method: 'POST', body: JSON.stringify({}) }),
    overrideWinner: (id: string, targetBidId: string, justification: string) =>
      request(`/tenders/${id}/award/override`, {
        method: 'POST',
        body: JSON.stringify({ targetBidId, justification }),
      }),
    close: (id: string, closureNotes?: string) =>
      request(`/tenders/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({ closureNotes }),
      }),
    getExplainability: (id: string) =>
      request(`/tenders/${id}/explainability`),
    compareBids: (id: string, bidIds: string[]) =>
      request(`/tenders/${id}/compare?bidIds=${bidIds.join(',')}`),
    simulate: (id: string, criteria: any[]) =>
      request(`/tenders/${id}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ criteria }),
      }),
    getBreakeven: (id: string) =>
      request(`/tenders/${id}/breakeven`),
    downloadReportCsv: async (id: string) => {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/tenders/${id}/report.csv`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to download CSV report');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tender-${id}-report.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  },

  // Dashboard
  dashboard: {
    getSummary: () =>
      request('/dashboard/summary'),
  },

  // Bids
  bids: {
    getMyBids: () =>
      request('/bids/me'),
    getById: (id: string) =>
      request(`/bids/${id}`),
  },

  // Vendor Profile
  vendors: {
    getMyProfile: () =>
      request('/vendors/me/profile'),
    updateMyProfile: (data: any) =>
      request('/vendors/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
};
