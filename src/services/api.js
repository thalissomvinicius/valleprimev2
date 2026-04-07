import axios from 'axios';

// STRATEGY:
// - In Cloudflare Pages (*.pages.dev): use relative /api/* URLs
//   → Cloudflare Pages Function at functions/api/[[path]].js proxies to Render
//   → NO CORS issues because it's same-origin
// - In local dev: proxy via vite.config.js (already configured)
// - Only fall back to absolute Render URL if explicitly set via env var

const ENV_API = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const isDev = import.meta.env.DEV;

// Always use relative URLs in production (Cloudflare Pages handles the proxy)
const API_BASE_URL = ENV_API || (isDev ? 'http://localhost:5000' : '');

const CLIENT_BASE = '/api/manage-clients';
const API_BASE = '/api/consulta';
const USERS_BASE = '/api/users';
const AUTH_BASE = '/api/auth';

// Create axios instance with relative base URL
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

// Request interceptor: add auth token
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
  } catch {
    throw new Error('Resposta inválida do servidor.');
  }
};

export const authLogin = async (username, password) => {
  const response = await requestWithRetry(() => api.post(`${AUTH_BASE}/login`,
    { username, password },
    {
      responseType: 'text',
      transformResponse: [data => data],
      timeout: 120000 // 120 seconds to bear with Render's hard cold start
    }
  ), { retries: 1, baseDelay: 1000 });
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
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tempo de resposta excedido. Tente novamente.')), 25000);
    });
    const response = await Promise.race([
      requestWithRetry(() => api.get(`${API_BASE}/${obraCode}`, {
        params: { t: Date.now() },
        timeout: 20000
      }), { retries: 2, baseDelay: 800 }),
      timeoutPromise
    ]);
    const raw = response?.data;
    const res = typeof raw === 'string' ? parseJsonResponse(raw) : raw;
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

export const getProposals = async ({ page = 1, limit = 50 } = {}) => {
  const response = await requestWithRetry(() => api.get(`/api/proposals?page=${page}&limit=${limit}`, {
    timeout: 30000
  }), { retries: 2, baseDelay: 1000 });
  return response.data;
};

export const getProposalById = async (id) => {
  const response = await api.get(`/api/proposals/${id}`);
  return response.data;
};

export const updateProposal = async (id, payload) => {
  const response = await api.put(`/api/proposals/${id}`, { payload });
  return response.data;
};

export const deleteProposal = async (id) => {
  const response = await api.delete(`/api/proposals/${id}`);
  return response.data;
};

export const printProposal = async (id) => {
  const response = await api.get(`/api/proposals/${id}/pdf`, { responseType: 'blob' });
  return response.data;
};



// URL base das APIs locais do corretor (Cloudflare tunnel — pode mudar a cada reinício)
const CORRETORES_TUNNEL_URL = 'https://functional-stand-hobbies-stand.trycloudflare.com';

// URL da API no Render (sempre online) — usada como fallback de cache
const RENDER_CLOUD_API = 'https://valleprimev2-api.onrender.com';

// Lista estática de obras como fallback quando o túnel estiver offline
const OBRAS_FALLBACK = [
  { empresa: 13, obra: '70100', nome: 'RESIDENCIAL JARDIM DO VALLE - DOM ELISEU' },
  { empresa: 12, obra: '70100', nome: 'RESIDENCIAL JARDIM AMERICA - CAPANEMA' },
  { empresa: 9, obra: '70100', nome: 'RESIDENCIAL SALLES JARDIM - CASTANHAL' },
  { empresa: 6, obra: '70100', nome: 'RESIDENCIAL JARDIM CASTANHAL - CASTANHAL' },
  { empresa: 6, obra: '70400', nome: 'RESIDENCIAL IPITINGA - TOMÉ-AÇU' },
  { empresa: 28, obra: '70100', nome: 'RESIDENCIAL VALLE DO IPITINGA II - TOMÉ-AÇU' },
  { empresa: 6, obra: '70300', nome: 'RESIDENCIAL JARDIM DO VALLE - TAILANDIA' },
  { empresa: 15, obra: '70100', nome: 'RESIDENCIAL JARDIM DO VALLE - BARCARENA' },
  { empresa: 22, obra: '70100', nome: 'RESIDENCIAL JARDIM DO VALLE II - TAILANDIA' },
  { empresa: 983, obra: '70100', nome: 'RESIDENCIAL JARDIM VALLE DO URAIM - PARAGOMINAS' },
  { empresa: 6, obra: '70500', nome: 'RESIDENCIAL PARQUE DO VALLE - RONDON' },
  { empresa: 24, obra: '70100', nome: 'RESIDENCIAL JARDIM CASTANHAL III - CASTANHAL' },
  { empresa: 29, obra: '70100', nome: 'RESIDENCIAL VALLE DOS IPÊS - TOMÉ AÇU' },
  { empresa: 12, obra: '70101', nome: 'RESIDENCIAL JARDIM AMÉRICA II - CAPANEMA' },
  { empresa: 6, obra: '70101', nome: 'RESIDENCIAL JARDIM CASTANHAL II - CASTANHAL' },
  { empresa: 9, obra: '70101', nome: 'RESIDENCIAL SALLES JARDIM II - CASTANHAL' },
  { empresa: 9, obra: '70102', nome: 'RESIDENCIAL SALLES JARDIM III - CASTANHAL' },
  { empresa: 9, obra: '70103', nome: 'RESIDENCIAL SALLES JARDIM IV - CASTANHAL' },
];

export const fetchConfigObras = async () => {
  try {
    const response = await axios.get(`${CORRETORES_TUNNEL_URL}/api/integracao/config/obras`, {
      timeout: 10000
    });
    return response.data;
  } catch {
    // Túnel offline: retorna lista estática embutida
    console.warn('[fetchConfigObras] Túnel offline, usando lista estática de obras.');
    return { total: OBRAS_FALLBACK.length, obras: OBRAS_FALLBACK, is_cache: true };
  }
};

export const fetchCorretoresData = async (filters = {}) => {
  const { empresa = 28, obra = '70100', corretor_id, mes, data_inicio, data_fim } = filters;
  const params = new URLSearchParams();
  params.append('empresa', empresa);
  params.append('obra', obra);
  if (corretor_id) params.append('corretor_id', corretor_id);
  if (mes) params.append('mes', mes);
  if (data_inicio) params.append('data_inicio', data_inicio);
  if (data_fim) params.append('data_fim', data_fim);

  // 1ª tentativa: túnel Cloudflare (dados ao vivo do UAU)
  try {
    const response = await axios.get(
      `${CORRETORES_TUNNEL_URL}/api/integracao/corretores?${params.toString()}`,
      { timeout: 30000 }
    );
    return response.data; // inclui atualizado_em e is_cache: false
  } catch {
    console.warn('[fetchCorretoresData] Túnel offline. Tentando cache do Supabase via Railway...');
  }

  // 2ª tentativa: cache no Supabase (via Railway — sempre online)
  try {
    const cacheParams = new URLSearchParams();
    cacheParams.append('empresa', empresa);
    cacheParams.append('obra', obra);
    if (mes) cacheParams.append('mes', mes);

    const cacheResponse = await axios.get(
      `${RENDER_CLOUD_API}/api/integracao/cache/corretores?${cacheParams.toString()}`,
      { timeout: 15000 }
    );
    return cacheResponse.data; // inclui atualizado_em e is_cache: true
  } catch (cacheError) {
    console.error('[fetchCorretoresData] Cache também indisponível:', cacheError);
    throw new Error('Servidor offline e sem cache disponível para este período. Inicie o script e tente novamente.');
  }
};
