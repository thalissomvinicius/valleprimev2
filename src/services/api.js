import axios from 'axios';

// STRATEGY:
// STRATEGY:
// - In Cloudflare Pages (*.pages.dev): use relative /api/* URLs
//   → Cloudflare Pages Function at functions/api/[[path]].js proxies to Render
//   → NO CORS issues because it's same-origin
// - In local dev: proxy via vite.config.js (already configured)
// - We actively ignore VITE_API_BASE if we are on Pages, because the user
//   might have an old Vercel URL stuck in their Cloudflare env vars!

let ENV_API = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const isDev = import.meta.env.DEV;
const isPagesDev = typeof window !== 'undefined' && /\.pages\.dev$/i.test(window.location?.hostname || '');

// Force relative URL on Pages, even if ENV_API is stuck with an old Vercel URL
const API_BASE_URL = isPagesDev ? '' : (ENV_API || (isDev ? 'http://localhost:5000' : ''));

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

export const fetchAvailability = async (obraCode = '624', empresaId = 28) => {
  try {
    // A nova API usa /api/disponibilidades/{empresa}/{produto}
    // onde {produto} é o código numérico (ex: 624, 625)
    const endpoint = `${LOCAL_UAU_API}/api/disponibilidades/${empresaId}/${obraCode}`;
    
    console.log(`[API] Buscando disponibilidades em tempo real: ${endpoint}`);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tempo de resposta excedido do Banco UAU. Verifique se o computador local está ligado.')), 45000);
    });

    const response = await Promise.race([
      axios.get(endpoint, {
        params: { 
          t: Date.now(),
          user: localStorage.getItem('valle_user_name') || 'Desconhecido'
        },
        timeout: 40000
      }),
      timeoutPromise
    ]);

    const res = response?.data;
    if (!res || !res.sucesso) {
      throw new Error(res?.error || 'Consulta indisponível no Banco UAU.');
    }

    const list = Array.isArray(res.data) ? res.data : [];
    
    // O backend da Ponte UAU (main.py) agora já envia os campos exatos e formatados (QD, LT, M2, Chanfro, M_Frente, etc)
    const normalized = [...list];
    
    if (res.atualizado_em) {
      normalized.lastUpdate = new Date(res.atualizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    return normalized;
  } catch (error) {
    console.error('[fetchAvailability] Network Error:', error);
    const status = error?.response?.status;
    if (status === 503 || status === 500) {
      throw new Error('Banco UAU indisponível. Verifique o servidor local.');
    }
    if (error?.code === 'ECONNABORTED' || error?.message?.toLowerCase?.().includes('timeout')) {
      throw new Error('Tempo de resposta excedido do Banco UAU.');
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



// API Render (proxy rápido, resolve CORS e acessa o Supabase)
const RENDER_CLOUD_API = 'https://valleprimev2.onrender.com';

// Mapeamento oficial: empresa-obra → nome completo "Loteamento (Cidade)"
// Garante exibição correta independente do que a API retornar
const OBRAS_DISPLAY_MAP = {
  '13-70100': 'Jardim do Valle (Dom Eliseu)',
  '12-70100': 'Jardim América (Capanema)',
  '12-70101': 'Jardim América II (Capanema)',
  '9-70100':  'Salles Jardim I (Castanhal)',
  '9-70101':  'Salles Jardim II (Castanhal)',
  '9-70102':  'Salles Jardim III (Castanhal)',
  '9-70103':  'Salles Jardim IV (Castanhal)',
  '6-70100':  'Jardim Castanhal I (Castanhal)',
  '6-70101':  'Jardim Castanhal II (Castanhal)',
  '24-70100': 'Jardim Castanhal III (Castanhal)',
  '6-70400':  'Valle do Ipitinga (Tomé-Açu)',
  '28-70100': 'Valle do Ipitinga II (Tomé-Açu)',
  '6-70300':  'Jardim do Valle I (Tailândia)',
  '22-70100': 'Jardim do Valle II (Tailândia)',
  '15-70100': 'Jardim do Valle (Barcarena)',
  '983-70100':'Valle do Uraim (Paragominas)',
  '6-70500':  'Parque do Valle (Rondon do Pará)',
  '29-70100': 'Valle dos Ipês (Tomé-Açu)',
};

// Lista estática de obras como fallback
const OBRAS_FALLBACK = [
  { empresa: 13, obra: '70100', nome: 'Jardim do Valle (Dom Eliseu)' },
  { empresa: 12, obra: '70100', nome: 'Jardim América (Capanema)' },
  { empresa: 12, obra: '70101', nome: 'Jardim América II (Capanema)' },
  { empresa: 9, obra: '70100', nome: 'Salles Jardim I (Castanhal)' },
  { empresa: 9, obra: '70101', nome: 'Salles Jardim II (Castanhal)' },
  { empresa: 9, obra: '70102', nome: 'Salles Jardim III (Castanhal)' },
  { empresa: 9, obra: '70103', nome: 'Salles Jardim IV (Castanhal)' },
  { empresa: 6, obra: '70100', nome: 'Jardim Castanhal I (Castanhal)' },
  { empresa: 6, obra: '70101', nome: 'Jardim Castanhal II (Castanhal)' },
  { empresa: 24, obra: '70100', nome: 'Jardim Castanhal III (Castanhal)' },
  { empresa: 6, obra: '70400', nome: 'Valle do Ipitinga (Tomé-Açu)' },
  { empresa: 28, obra: '70100', nome: 'Valle do Ipitinga II (Tomé-Açu)' },
  { empresa: 6, obra: '70300', nome: 'Jardim do Valle I (Tailândia)' },
  { empresa: 22, obra: '70100', nome: 'Jardim do Valle II (Tailândia)' },
  { empresa: 15, obra: '70100', nome: 'Jardim do Valle (Barcarena)' },
  { empresa: 983, obra: '70100', nome: 'Valle do Uraim (Paragominas)' },
  { empresa: 6, obra: '70500', nome: 'Parque do Valle (Rondon do Pará)' },
  { empresa: 29, obra: '70100', nome: 'Valle dos Ipês (Tomé-Açu)' },
];

// Enriquece a lista de obras com nomes corretos do mapa
const enrichObrasWithDisplayNames = (obras) => {
  return obras.map(item => {
    const key = `${item.empresa}-${item.obra}`;
    return {
      ...item,
      nome: OBRAS_DISPLAY_MAP[key] || item.nome // usa o mapa, fallback pro original
    };
  });
};

export const fetchConfigObras = async () => {
  try {
    const response = await axios.get(`${RENDER_CLOUD_API}/api/integracao/config/obras`, {
      timeout: 10000
    });
    const data = response.data;
    // Enriquece os nomes vindos da API com nosso mapa oficial
    if (data.obras) {
      data.obras = enrichObrasWithDisplayNames(data.obras);
    }
    return data;
  } catch {
    console.warn('[fetchConfigObras] Render offline, usando lista estática de obras.');
    return { total: OBRAS_FALLBACK.length, obras: OBRAS_FALLBACK, is_cache: true };
  }
};

// URL da API Ponte UAU via Cloudflare Tunnel nomeado (domínio fixo)
const LOCAL_UAU_API = 'https://api.valleprimeapi.online';

export const fetchCorretoresData = async (filters = {}) => {
  const { empresa = 28, obra = '70100', data_inicio = '', data_fim = '' } = filters;
  let endpoint = `${LOCAL_UAU_API}/api/vendas/${empresa}/${obra}`;
  
  const params = new URLSearchParams();
  if (data_inicio) params.append('data_inicio', data_inicio);
  if (data_fim) params.append('data_fim', data_fim);
  params.append('user', localStorage.getItem('valle_user_name') || 'Desconhecido');
  
  if (params.toString()) endpoint += `?${params.toString()}`;

  try {
    const response = await axios.get(endpoint, {
      timeout: 90000 // Aumentado para 90 segundos para dar tempo do banco UAU processar
    });
    return response.data;
  } catch (error) {
    console.error('[fetchCorretoresData] Erro na requisição para Cloudflare UAU API:', error);
    throw new Error('Falha ao obter os dados em tempo real da Ponte UAU API. Verifique se o Cloudflare Tunnel está online.');
  }
};

