import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach auth token and organization ID
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const orgId = localStorage.getItem('organizationId');
  if (orgId) {
    config.headers['X-Organization-Id'] = orgId;
  }

  config.headers['X-Client'] = 'web';

  return config;
});

// Token refresh queue — prevents concurrent refresh races where the second
// request tries to use a refresh token that was already consumed by the first.
let refreshPromise: Promise<string> | null = null;

function doRefresh(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('No refresh token');

    const { data } = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, { refreshToken });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.accessToken as string;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// Response interceptor: handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const newToken = await doRefresh();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('organizationId');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    // Handle 429 Too Many Requests — dispatch a custom event for rate limit toast
    if (error.response?.status === 429) {
      const detail = error.response.data as Record<string, unknown> | undefined;
      window.dispatchEvent(
        new CustomEvent('devsignal:rate-limited', {
          detail: {
            message: detail?.error ?? 'Too many requests. Please wait a moment and try again.',
          },
        }),
      );
    }

    // Handle 402 Payment Required — dispatch a custom event for the UpgradeModal
    if (error.response?.status === 402) {
      const detail = error.response.data as Record<string, unknown> | undefined;
      window.dispatchEvent(
        new CustomEvent('devsignal:plan-limit', {
          detail: {
            error: detail?.error ?? 'Plan limit reached',
            current: detail?.current,
            limit: detail?.limit,
            tier: detail?.tier,
          },
        }),
      );
    }

    return Promise.reject(error);
  }
);

export default api;
