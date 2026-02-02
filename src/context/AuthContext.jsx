import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authLogin, authMe, getUsers, createUser, updateUser, deleteUser as apiDeleteUser } from '../services/api';

// Lista de obras disponíveis
export const OBRAS = [
    { codigo: '600', descricao: 'RESIDENCIAL JARDIM DO VALLE - DOM ELISEU', cidade: 'Dom Eliseu', uf: 'PA' },
    { codigo: '601', descricao: 'RESIDENCIAL JARDIM AMERICA - CAPANEMA', cidade: 'Capanema', uf: 'PA' },
    { codigo: '602', descricao: 'RESIDENCIAL SALLES JARDIM - CASTANHAL', cidade: 'Castanhal', uf: 'PA' },
    { codigo: '603', descricao: 'RESIDENCIAL JARDIM CASTANHAL - CASTANHAL', cidade: 'Castanhal', uf: 'PA' },
    { codigo: '604', descricao: 'RESIDENCIAL IPITINGA - TOMÉ-AÇU', cidade: 'Tomé-Açu', uf: 'PA' },
    { codigo: '605', descricao: 'RESIDENCIAL VALLE DO IPITINGA - TOMÉ-AÇU', cidade: 'Tomé-Açu', uf: 'PA' },
    { codigo: '610', descricao: 'RESIDENCIAL JARDIM DO VALLE - TAILANDIA', cidade: 'Tailândia', uf: 'PA' },
    { codigo: '616', descricao: 'RESIDENCIAL JARDIM DO VALLE - BARCARENA', cidade: 'Barcarena', uf: 'PA' },
    { codigo: '618', descricao: 'RESIDENCIAL JARDIM DO VALLE II - TAILANDIA', cidade: 'Tailândia', uf: 'PA' },
    { codigo: '620', descricao: 'RESIDENCIAL JARDIM VALLE DO URAIM - PARAGOMINAS', cidade: 'Paragominas', uf: 'PA' },
    { codigo: '621', descricao: 'RESIDENCIAL PARQUE DO VALLE - RONDON', cidade: 'Rondon do Pará', uf: 'PA' },
    { codigo: '623', descricao: 'RESIDENCIAL JARDIM CASTANHAL III - CASTANHAL', cidade: 'Castanhal', uf: 'PA' },
    { codigo: '624', descricao: 'RESIDENCIAL VALLE DO IPITINGA II - TOMÉ-AÇU', cidade: 'Tomé-Açu', uf: 'PA' },
    { codigo: '625', descricao: 'RESIDENCIAL VALLE DO IPÊS - TOMÉ AÇU', cidade: 'Tomé-Açu', uf: 'PA' },
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

    const processUser = (userData) => {
        // Flatten permissions for easy access in frontend
        const permissions = userData.permissions || {};
        const user = {
            ...userData,
            obrasPermitidas: permissions.obrasPermitidas || [],
            statusPermitidos: permissions.statusPermitidos || [],
            canViewAllClients: permissions.canViewAllClients || (userData.role === 'admin'),
            aprovado: Boolean(userData.active !== false)
        };
        return user;
    }

    const loadUsers = async () => {
        try {
            const result = await getUsers();
            if (result.users) {
                const mapped = result.users.map(u => ({
                    ...u,
                    obrasPermitidas: (u.permissions || {}).obrasPermitidas || [],
                    statusPermitidos: (u.permissions || {}).statusPermitidos || [],
                    canViewAllClients: (u.permissions || {}).canViewAllClients || (u.role === 'admin'),
                    aprovado: u.active
                }));
                setUsers(mapped);
            }
        } catch (e) {
            console.error("Failed to load users", e);
        }
    };

    const login = useCallback(async (username, password) => {
        const trimmed = (username || '').trim();
        if (!trimmed || !password) return { success: false, error: 'Usuário e senha são obrigatórios.' };

        try {
            const result = await authLogin(trimmed, password);
            if (result.token) {
                localStorage.setItem(STORAGE_KEYS.TOKEN, result.token);
                const user = processUser(result.user);
                setCurrentUser(user);
                // Load users if admin
                if (user.role === 'admin') {
                    loadUsers();
                }
                return { success: true, user };
            } else {
                return { success: false, error: 'Falha no login.' };
            }
        } catch (e) {
            const msg = e.response?.data?.message || 'Erro ao validar login.';
            return { success: false, error: msg };
        }
    }, []);

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
        } catch (e) {
            const msg = e.response?.data?.message || 'Erro ao criar usuário.';
            return { success: false, error: msg };
        }
    }, []);

    const updateUserPermissions = useCallback(async (userId, data) => {
        try {
            await updateUser(userId, data);
            await loadUsers();
            return { success: true };
        } catch (e) {
            return { success: false, error: 'Erro ao atualizar.' };
        }
    }, []);

    const deleteUser = useCallback(async (userId) => {
        try {
            await apiDeleteUser(userId);
            await loadUsers();
            return { success: true };
        } catch (e) {
            return { success: false, error: 'Erro ao excluir.' };
        }
    }, []);

    const approveUser = useCallback(async (userId) => {
        try {
            await updateUser(userId, { active: true, aprovado: true });
            await loadUsers();
            return { success: true };
        } catch (e) {
            return { success: false, error: 'Erro ao aprovar.' };
        }
    }, []);

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
            } catch (e) {
                // Token invalid
                logout();
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        init();
        return () => { cancelled = true; };
    }, []);

    return (
        <AuthContext.Provider value={{
            users,
            currentUser,
            loading,
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
