import axios from 'axios';

const CLIENT_BASE = '/api/clients';
const API_BASE = '/api/consulta';

export const fetchAvailability = async (obraCode = '624') => {
  try {
    const response = await axios.get(`${API_BASE}/${obraCode}`);
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

export const getClients = async ({ search = '', page = 1, limit = 50, type = '' } = {}) => {
  try {
    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (type) params.append('type', type);
    params.append('page', page);
    params.append('limit', limit);

    const response = await axios.get(`${CLIENT_BASE}?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching clients:', error);
    throw error;
  }
};

export const saveClient = async (clientData) => {
  try {
    console.log('Sending client data:', clientData);
    const response = await axios.post(CLIENT_BASE, clientData);
    return response.data;
  } catch (error) {
    console.error('Error saving client:', error);
    if (error.response) {
      console.error('Server Response Data:', error.response.data);
      console.error('Server Status:', error.response.status);
    }
    throw error;
  }
};

export const deleteClient = async (clientId) => {
  try {
    const response = await axios.delete(`${CLIENT_BASE}/${clientId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting client:', error);
    throw error;
  }
};

export const checkDuplicate = async (cpfCnpj, clientId = null) => {
  try {
    const params = new URLSearchParams();
    params.append('cpf_cnpj', cpfCnpj);
    if (clientId) params.append('client_id', clientId);

    const response = await axios.get(`${CLIENT_BASE}/check-duplicate?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error('Error checking duplicate:', error);
    throw error;
  }
};
