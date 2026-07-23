import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth.store.ts';

export const api = axios.create({
  baseURL: import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Endpoints where a 401 means "wrong credentials", not "session expired". */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/send-otp', '/auth/verify-otp', '/auth/register', '/auth/reset-password'];

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ error?: string }>) => {
    const url = error.config?.url ?? '';
    const isAuthAttempt = AUTH_ENDPOINTS.some((e) => url.includes(e));
    const hadSession = Boolean(useAuthStore.getState().token);

    // Only a 401 on an authenticated request means the session died. Redirect
    // then — and only if there was a session to lose, so an anonymous request
    // can't bounce the user around either.
    if (error.response?.status === 401 && !isAuthAttempt && hadSession) {
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string, cf_turnstile_token?: string) =>
    api.post<{ success: boolean; data: { token: string; user: any } }>('/auth/login', { email, password, cf_turnstile_token }),
  me: () => api.get('/auth/me'),
  updateProfile: (data: Record<string, any>) => api.put('/auth/profile', data),
  changePassword: (data: { current_password: string; new_password: string }) => api.post('/auth/change-password', data),
  logout: () => api.post('/auth/logout'),
};

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
  activity: () => api.get('/dashboard/activity'),
};

// ─── Properties ──────────────────────────────────────────────────────────────
export const propertiesApi = {
  search: (params?: Record<string, any>) => api.get('/properties', { params }),
  get: (id: string) => api.get(`/properties/${id}`),
  create: (data: any) => api.post('/properties', data),
  update: (id: string, data: any) => api.put(`/properties/${id}`, data),
  remove: (id: string) => api.delete(`/properties/${id}`),
  stats: () => api.get('/properties/stats'),
  cities: () => api.get('/properties/cities'),
  districts: (cityId: number) => api.get(`/properties/cities/${cityId}/districts`),
};

// ─── Uploads ─────────────────────────────────────────────────────────────────
export const uploadsApi = {
  image: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ success: boolean; data: { url: string } }>('/uploads/image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  images: (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return api.post<{ success: boolean; data: { urls: string[] } }>('/uploads/images', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ─── Clients ─────────────────────────────────────────────────────────────────
export const clientsApi = {
  list: (params?: Record<string, any>) => api.get('/clients', { params }),
  get: (id: string) => api.get(`/clients/${id}`),
  create: (data: any) => api.post('/clients', data),
  update: (id: string, data: any) => api.put(`/clients/${id}`, data),
  matches: (id: string) => api.get(`/clients/${id}/matches`),
  stats: () => api.get('/clients/stats'),
  addNote: (id: string, data: { content: string; is_private?: boolean }) =>
    api.post(`/clients/${id}/notes`, data),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  list:    ()                          => api.get('/users'),
  pending: ()                          => api.get('/users/pending'),
  approve: (id: string, role?: string) => api.post(`/users/${id}/approve`, { role }),
  reject:  (id: string)                => api.post(`/users/${id}/reject`),
  create:  (data: any)                 => api.post('/users', data),
  update:  (id: string, data: any)     => api.put(`/users/${id}`, data),
  remove:  (id: string)                => api.delete(`/users/${id}`),
};

// ─── WhatsApp ────────────────────────────────────────────────────────────────
export const whatsappApi = {
  status: (instance: string) => api.get(`/whatsapp/status/${instance}`),
};

// ─── Conversations ───────────────────────────────────────────────────────────
export const conversationsApi = {
  list: (params?: Record<string, any>) => api.get('/conversations', { params }),
  messages: (id: string) => api.get(`/conversations/${id}/messages`),
  send: (id: string, text: string) => api.post(`/conversations/${id}/send`, { text }),
  toggleAI: (id: string) => api.patch(`/conversations/${id}/toggle-ai`),
  markRead: (id: string) => api.patch(`/conversations/${id}/read`),
  remove: (id: string) => api.delete(`/conversations/${id}`),
};

// --- Notifications ---
export const notificationsApi = {
  list:        ()            => api.get('/notifications'),
  markRead:    (id: string)  => api.patch(`/notifications/${id}/read`),
  markAllRead: ()            => api.patch('/notifications/read-all'),
};
// --- Settings ---
export const settingsApi = {
  getAll:     ()                        => api.get('/settings'),
  get:        (key: string)             => api.get(`/settings/${key}`),
  save:       (key: string, value: any) => api.put(`/settings/${key}`, { value }),
  testEmail:  (to: string)              => api.post('/settings/test-email', { to }),
  getCompany: ()                        => api.get('/settings/company'),
};