import React, { useState, useEffect, useCallback } from 'react';
import { authLogin, authMe, getUsers, createUser, updateUser, deleteUser as apiDeleteUser } from '../services/api';
import { AuthContext } from './authContextValue';
import { OBRAS } from './authConstants';

const STORAGE_KEYS = {
    TOKEN: 'valle_token',
};

export function AuthProvider({ children }) {
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const isAuthenticated = Boolean(currentUser);
    const isAdmin = currentUser?.role === 'admin';

    const processUser = useCallback((userData) => {
        // Flatten permissions for easy access in frontend
        const permissions = userData.permissions || {};
        const allObras = OBRAS.map(obra => obra.codigo);
        const user = {
            ...userData,
            obrasPermitidas: permissions.obrasPermitidas || (userData.role === 'admin' ? allObras : []),
            statusPermitidos: permissions.statusPermitidos || [],
            canViewAllClients: permissions.canViewAllClients || (userData.role === 'admin'),
            aprovado: Boolean(userData.active !== false)
        };
        return user;
    }, []);

    const loadUsers = useCallback(async () => {
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
    }, [processUser, loadUsers]);

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
            const payload = {
                permissions: {
                    obrasPermitidas: Array.isArray(data?.obrasPermitidas) ? data.obrasPermitidas : [],
                    statusPermitidos: Array.isArray(data?.statusPermitidos) ? data.statusPermitidos : [],
                    canViewAllClients: !!data?.canViewAllClients,
                }
            };
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
    }, [processUser, loadUsers, logout]);

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
