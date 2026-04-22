import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authLogin, authMe, getUsers, createUser, updateUser, deleteUser as apiDeleteUser } from '../services/api';

// Lista de obras disponíveis
export const OBRAS = [
    { codigo: '600', empresa: 13, obra_uau: '70100', descricao: 'RESIDENCIAL JARDIM DO VALLE - DOM ELISEU', cidade: 'Dom Eliseu', uf: 'PA' },
    { codigo: '601', empresa: 12, obra_uau: '70100', descricao: 'RESIDENCIAL JARDIM AMERICA - CAPANEMA', cidade: 'Capanema', uf: 'PA' },
    { codigo: '602', empresa: 9,  obra_uau: '70100', descricao: 'RESIDENCIAL SALLES JARDIM - CASTANHAL', cidade: 'Castanhal', uf: 'PA' },
    { codigo: '603', empresa: 6,  obra_uau: '70100', descricao: 'RESIDENCIAL JARDIM CASTANHAL - CASTANHAL', cidade: 'Castanhal', uf: 'PA' },
    { codigo: '604', empresa: 6,  obra_uau: '70400', descricao: 'RESIDENCIAL IPITINGA - TOMÉ-AÇU', cidade: 'Tomé-Açu', uf: 'PA' },
    { codigo: '605', empresa: 6,  obra_uau: '70400', descricao: 'RESIDENCIAL VALLE DO IPITINGA - TOMÉ-AÇU', cidade: 'Tomé-Açu', uf: 'PA' },
    { codigo: '610', empresa: 6,  obra_uau: '70300', descricao: 'RESIDENCIAL JARDIM DO VALLE - TAILANDIA', cidade: 'Tailândia', uf: 'PA' },
    { codigo: '616', empresa: 15, obra_uau: '70100', descricao: 'RESIDENCIAL JARDIM DO VALLE - BARCARENA', cidade: 'Barcarena', uf: 'PA' },
    { codigo: '618', empresa: 22, obra_uau: '70100', descricao: 'RESIDENCIAL JARDIM DO VALLE II - TAILANDIA', cidade: 'Tailândia', uf: 'PA' },
    { codigo: '620', empresa: 983, obra_uau: '70100', descricao: 'RESIDENCIAL JARDIM VALLE DO URAIM - PARAGOMINAS', cidade: 'Paragominas', uf: 'PA' },
    { codigo: '621', empresa: 6,  obra_uau: '70500', descricao: 'RESIDENCIAL PARQUE DO VALLE - RONDON', cidade: 'Rondon do Pará', uf: 'PA' },
    { codigo: '623', empresa: 24, obra_uau: '70100', descricao: 'RESIDENCIAL JARDIM CASTANHAL III - CASTANHAL', cidade: 'Castanhal', uf: 'PA' },
    { codigo: '624', empresa: 28, obra_uau: '70100', descricao: 'RESIDENCIAL VALLE DO IPITINGA II - TOMÉ-AÇU', cidade: 'Tomé-Açu', uf: 'PA' },
    { codigo: '625', empresa: 29, obra_uau: '70100', descricao: 'RESIDENCIAL VALLE DO IPÊS - TOMÉ AÇU', cidade: 'Tomé-Açu', uf: 'PA' },
];

// Status de lotes disponíveis
export const STATUS_LOTES = [
    { value: '0 - Disponível', label: 'Disponível', color: 'success' },
    { value: '1 - Vendido', label: 'Vendido', color: 'danger' },
    { value: '2 - Reservado', label: 'Reservado', color: 'warning' },
    { value: '4 - Quitado', label: 'Quitado', color: 'info' },
    { value: '7 - Suspenso', label: 'Suspenso', color: 'secondary' },
    { value: '8 - Fora de venda', label: 'Fora de venda', color: 'secondary' },
];

const AuthContext = createContext(null);

const STORAGE_KEYS = {
    TOKEN: 'valle_token',
};

export function AuthProvider({ children }) {
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const isAuthenticated = Boolean(currentUser);
    const isAdmin = currentUser?.role === 'admin';

    const processUser = (userData) => {
        // Flatten permissions for easy access in frontend
        let permissions = userData.permissions || {};
        if (typeof permissions === 'string') {
            try {
                permissions = JSON.parse(permissions);
            } catch {
                permissions = {};
            }
        }
        const allObras = OBRAS.map(obra => obra.codigo);
        const user = {
            ...userData,
            obrasPermitidas: permissions.obrasPermitidas || (userData.role === 'admin' ? allObras : []),
            statusPermitidos: permissions.statusPermitidos || [],
            canViewAllClients: permissions.canViewAllClients || (userData.role === 'admin'),
            canViewSales: permissions.canViewSales || (userData.role === 'admin'),
            aprovado: Boolean(userData.active !== false)
        };
        return user;
    }

    const loadUsers = useCallback(async () => {
        try {
            const result = await getUsers();
            if (result.users) {
                const mapped = result.users.map(u => processUser(u));
                setUsers(mapped);
            }
        } catch (e) {
            console.error("Failed to load users", e);
        }
    }, []);

    const login = useCallback(async (username, password) => {
        const trimmed = (username || '').trim();
        if (!trimmed || !password) return { success: false, error: 'Usuário e senha são obrigatórios.' };

        try {
            console.log('[DEBUG] Calling authLogin...');
            const result = await authLogin(trimmed, password);
            console.log('[DEBUG] authLogin result:', result);
            if (result.token) {
                console.log('[DEBUG] Token received, saving...');
                localStorage.setItem(STORAGE_KEYS.TOKEN, result.token);
                const user = processUser(result.user);
                localStorage.setItem('valle_user_name', user.nome || user.username);
                console.log('[DEBUG] User processed:', user);
                setCurrentUser(user);
                // Load users if admin
                if (user.role === 'admin') {
                    loadUsers();
                }
                console.log('[DEBUG] Returning success: true');
                return { success: true, user };
            } else {
                console.log('[DEBUG] No token in result!');
                return { success: false, error: 'Falha no login.' };
            }
        } catch (e) {
            console.error('[DEBUG] Login error:', e);
            const rawMsg = e?.response?.data?.message || e?.message;
            let msg = rawMsg || 'Erro ao validar login.';
            const normalized = String(msg).toLowerCase();
            if (e?.code === 'ECONNABORTED' || normalized.includes('timeout')) {
                msg = 'Tempo de resposta excedido. Tente novamente.';
            } else if (e?.response?.status === 503) {
                msg = 'Servidor indisponível no momento. Tente novamente.';
            }
            return { success: false, error: msg };
        }
    }, [loadUsers]);

    const logout = useCallback(() => {
        setCurrentUser(null);
        setUsers([]);
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        // Force page reload just in case or simple clear is enough
    }, []);

    const addUser = useCallback(async (username, password, nome) => {
        try {
            await createUser({ username, password, nome });
            await loadUsers(); // Refresh list
            return { success: true };
        } catch {
            const msg = 'Erro ao criar usuário.';
            return { success: false, error: msg };
        }
    }, [loadUsers]);

    const updateUserPermissions = useCallback(async (userId, data) => {
        try {
            const permissions = {
                obrasPermitidas: Array.isArray(data?.obrasPermitidas) ? data.obrasPermitidas : [],
                statusPermitidos: Array.isArray(data?.statusPermitidos) ? data.statusPermitidos : [],
                canViewAllClients: !!data?.canViewAllClients,
                canViewSales: !!data?.canViewSales,
            };
            // Inclui uau_corretor_id apenas se estiver preenchido
            if (data?.uau_corretor_id !== '' && data?.uau_corretor_id !== null && data?.uau_corretor_id !== undefined) {
                permissions.uau_corretor_id = parseInt(data.uau_corretor_id);
            }
            const payload = { permissions };
            await updateUser(userId, payload);
            await loadUsers();
            return { success: true };
        } catch {
            return { success: false, error: 'Erro ao atualizar.' };
        }
    }, [loadUsers]);

    const deleteUser = useCallback(async (userId) => {
        try {
            await apiDeleteUser(userId);
            await loadUsers();
            return { success: true };
        } catch {
            return { success: false, error: 'Erro ao excluir.' };
        }
    }, [loadUsers]);

    const approveUser = useCallback(async (userId) => {
        try {
            await updateUser(userId, { active: true, aprovado: true });
            await loadUsers();
            return { success: true };
        } catch {
            return { success: false, error: 'Erro ao aprovar.' };
        }
    }, [loadUsers]);

    // Initial load
    useEffect(() => {
        let cancelled = false;
        async function init() {
            const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                const result = await authMe();
                if (!cancelled) {
                    const user = processUser(result.user);
                    setCurrentUser(user);
                    if (user.role === 'admin') {
                        loadUsers();
                    }
                }
            } catch {
                // Token invalid
                logout();
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        init();
        return () => { cancelled = true; };
    }, [logout, loadUsers]);

    return (
        <AuthContext.Provider value={{
            users,
            currentUser,
            loading,
            isAuthenticated,
            isAdmin,
            login,
            logout,
            addUser,
            deleteUser,
            updateUserPermissions,
            approveUser
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
