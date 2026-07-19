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

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ error?: string }>) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ success: boolean; data: { token: string; user: any } }>('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
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
  stats: () => api.get('/properties/stats'),
  cities: () => api.get('/properties/cities'),
  districts: (cityId: number) => api.get(`/properties/cities/${cityId}/districts`),
};

// ─── Clients ─────────────────────────────────────────────────────────────────
export const clientsApi = {
  list: (params?: Record<string, any>) => api.get('/clients', { params }),
  get: (id: string) => api.get(`/clients/${id}`),
  create: (data: any) => api.post('/clients', data),
  update: (id: string, data: any) => api.put(`/clients/${id}`, data),
  stats: () => api.get('/clients/stats'),
  addNote: (id: string, data: { content: string; is_private?: boolean }) =>
    api.post(`/clients/${id}/notes`, data),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => api.get('/users'),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  remove: (id: string) => api.delete(`/users/${id}`),
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
};
