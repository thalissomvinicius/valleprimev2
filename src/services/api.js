import axios from 'axios';

// Em produção: use VITE_API_BASE se definido; senão use '' (chamadas relativas /api → proxy do host)
const ENV_API = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const isDev = import.meta.env.DEV;
const API_BASE_URL = ENV_API || '';
const CLIENT_BASE = '/api/manage-clients';
const API_BASE = '/api/consulta';
const USERS_BASE = '/api/users';
const AUTH_BASE = '/api/auth';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: 15000,
});

// Request interceptor to add token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('valle_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, error => {
  return Promise.reject(error);
});

// Response interceptor to handle 401 (logout)
api.interceptors.response.use(response => response, error => {
  if (error.response && error.response.status === 401) {
    // Optional: Auto logout if 401
    // localStorage.removeItem('valle_token');
    // window.location.href = '/login'; 
  }
  return Promise.reject(error);
});

const parseJsonResponse = (payload) => {
  if (typeof payload !== 'string') return payload;
  const trimmed = payload.trim();
  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
    throw new Error('Resposta HTML recebida. Verifique VITE_API_BASE.');
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    throw new Error('Resposta inválida do servidor.');
  }
};

export const authLogin = async (username, password) => {
  // Usando GET com query params para contornar problema de body parsing
  const response = await api.get('/api/login-get', {
    params: { username, password },
    responseType: 'text',
    transformResponse: [data => data]
  });
  return parseJsonResponse(response.data);
};

export const authMe = async () => {
  const response = await api.get(`${AUTH_BASE}/me`);
  return response.data;
};

// User Management
export const getUsers = async () => {
  const response = await api.get(USERS_BASE);
  return response.data;
};

export const createUser = async (userData) => {
  const response = await api.post(USERS_BASE, userData);
  return response.data;
};

export const updateUser = async (id, data) => {
  const response = await api.put(`${USERS_BASE}/${id}`, data);
  return response.data;
};

export const deleteUser = async (id) => {
  const response = await api.delete(`${USERS_BASE}/${id}`);
  return response.data;
};

export const fetchAvailability = async (obraCode = '624') => {
  try {
    const response = await api.get(`${API_BASE}/${obraCode}`);
    if (response.data && response.data.success) {
      return response.data.data;
    } else {
      console.error('API Error:', response.data);
      throw new Error('Failed to fetch data');
    }
  } catch (error) {
    console.error('Network Error:', error);
    throw error;
  }
};

export const getClients = async ({ search = '', page = 1, limit = 50, type = '', created_by = '' } = {}) => {
  try {
    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (type) params.append('type', type);
    if (created_by) params.append('created_by', created_by);
    params.append('page', page);
    params.append('limit', limit);

    const response = await api.get(`${CLIENT_BASE}?${params.toString()}`);
    const data = response.data;
    // Normalize: backend may return { clients } or { success, clients, total_count }
    if (data && Array.isArray(data.clients) && data.success === undefined) {
      return { success: true, clients: data.clients, total_count: data.clients.length };
    }
    return data;
  } catch (error) {
    console.error('Error fetching clients:', error);
    throw error;
  }
};

export const saveClient = async (clientData) => {
  try {
    const response = await api.post(CLIENT_BASE, clientData);
    return response.data; // Response should be { success: true } or { error: ... }
  } catch (error) {
    const details = error?.response?.data;
    console.error('Error saving client:', error, details);
    throw error;
  }
};

export const deleteClient = async (id) => {
  try {
    const response = await api.delete(`${CLIENT_BASE}/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting client:', error);
    throw error;
  }
};

export const checkDuplicate = async (cpf, tipo = 'PF', clientId = null) => {
  try {
    let url = `${CLIENT_BASE}/check-duplicate?cpf_cnpj=${encodeURIComponent(cpf)}&tipo_pessoa=${tipo}`;
    if (clientId) url += `&client_id=${clientId}`;
    const response = await api.get(url);
    return response.data; //{ exists: bool }
  } catch (e) {
    console.error("Duplicate check error", e);
    return { exists: false };
  }
}


