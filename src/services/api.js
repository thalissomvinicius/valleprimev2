import axios from 'axios';

// Em produção: use VITE_API_BASE se definido; senão fallback para a API no Render
const ENV_API = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const isDev = import.meta.env.DEV;
const PRODUCTION_API = 'https://valleprimev2.onrender.com';
// Se estiver no Cloudflare Pages (*.pages.dev), sempre usar a API no Render
const isPagesDev = typeof window !== 'undefined' && /\.pages\.dev$/i.test(window.location?.hostname || '');
const API_BASE_URL = ENV_API || (isPagesDev ? PRODUCTION_API : (isDev ? '' : PRODUCTION_API));

const CLIENT_BASE = '/api/manage-clients';
const API_BASE = '/api/consulta';
const USERS_BASE = '/api/users';
const AUTH_BASE = '/api/auth';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: 15000,
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const shouldRetry = (error) => {
  const status = error?.response?.status;
  if (status && [502, 503, 504].includes(status)) return true;
  if (error?.code === 'ECONNABORTED') return true;
  if (error?.message?.toLowerCase?.().includes('timeout')) return true;
  if (!error?.response && error?.request) return true;
  return false;
};

const requestWithRetry = async (fn, { retries = 2, baseDelay = 800 } = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) throw error;
      const delay = baseDelay * (attempt + 1);
      await sleep(delay);
    }
  }
  throw lastError;
};

// Request interceptor: em *.pages.dev usar URL absoluta para o Render (garante que a requisição vá ao backend)
const RENDER_API = 'https://valleprimev2.onrender.com';
api.interceptors.request.use(config => {
  if (typeof window !== 'undefined' && /\.pages\.dev$/i.test(window.location?.hostname || '') && config.url?.startsWith?.('/api')) {
    config.url = RENDER_API + config.url; // URL absoluta → axios ignora baseURL
    config.baseURL = '';
  }
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
  } catch {
    throw new Error('Resposta inválida do servidor.');
  }
};

export const authLogin = async (username, password) => {
  const response = await requestWithRetry(() => api.get('/api/login-get', {
    params: { username, password },
    responseType: 'text',
    transformResponse: [data => data],
    timeout: 30000
  }), { retries: 2, baseDelay: 1000 });
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
    const response = await requestWithRetry(() => api.get(`${API_BASE}/${obraCode}`, {
      params: { t: Date.now() },
      timeout: 20000
    }), { retries: 2, baseDelay: 800 });
    const res = response.data;
    if (!res) throw new Error('Resposta vazia');
    const list = Array.isArray(res.data) ? res.data : (res.success ? res.data : []);
    const normalized = Array.isArray(list) ? list : [];
    if (res?.success === false && normalized.length === 0) {
      throw new Error(res?.error || 'Consulta indisponível no servidor.');
    }
    const lastUpdate = res.Data_Atualizacao || (normalized[0] && normalized[0].Data_Atualizacao);
    if (lastUpdate) {
      normalized.lastUpdate = lastUpdate; // attach metadata to array object
    }
    return normalized;
  } catch (error) {
    console.error('Network Error:', error);
    const status = error?.response?.status;
    if (status === 503) {
      throw new Error('Consulta indisponível no servidor. Tente novamente em instantes.');
    }
    if (error?.code === 'ECONNABORTED' || error?.message?.toLowerCase?.().includes('timeout')) {
      throw new Error('Tempo de resposta excedido. Tente novamente.');
    }
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
    const normalizeClients = (payload) => {
      if (!payload || !Array.isArray(payload.clients)) return payload;
      const normalizedClients = payload.clients.map((client) => {
        const rawData = client?.data;
        if (!rawData || typeof rawData !== 'string') {
          return client;
        }
        try {
          const parsed = JSON.parse(rawData);
          return { ...client, data: parsed };
        } catch {
          return client;
        }
      });
      return { ...payload, clients: normalizedClients };
    };
    // Normalize: backend may return { clients } or { success, clients, total_count }
    if (data && Array.isArray(data.clients) && data.success === undefined) {
      const payload = { success: true, clients: data.clients, total_count: data.clients.length };
      return normalizeClients(payload);
    }
    return normalizeClients(data);
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
