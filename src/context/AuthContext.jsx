import React, { useState, useEffect, useCallback } from 'react';
import { authLogin, authMe, getUsers, createUser, updateUser, deleteUser as apiDeleteUser, changeMyPassword } from '../services/api';
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
                    aprovado: u.active,
                    clientsCount: Number(u.clients_count || 0),
                }));
                setUsers(mapped);
            }
        } catch (e) {
            console.error("Failed to load users", e);
        }
    }, []);

    const translateLoginError = useCallback((rawMessage, status) => {
        const msg = String(rawMessage || '');
        const normalized = msg.toLowerCase();
        if (!msg) return 'Erro ao validar login.';
        if (status === 401 || normalized.includes('status code 401') || normalized.includes('unauthorized') || normalized.includes('invalid credentials') || normalized.includes('invalid username') || normalized.includes('invalid password')) {
            return 'Usuário ou senha inválidos.';
        }
        if (status === 403 || normalized.includes('status code 403') || normalized.includes('forbidden') || normalized.includes('not approved') || normalized.includes('not active') || normalized.includes('inactive') || normalized.includes('pending')) {
            return 'Seu acesso ainda não foi aprovado. Aguarde a liberação do administrador.';
        }
        if (status === 429 || normalized.includes('too many requests')) {
            return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
        }
        if (status === 500 || normalized.includes('status code 500') || normalized.includes('internal server error')) {
            return 'Erro interno no servidor. Tente novamente.';
        }
        if (normalized.includes('network error') || normalized.includes('failed to fetch') || normalized.includes('fetch failed')) {
            return 'Erro de conexão. Verifique sua internet e tente novamente.';
        }
        if (normalized.includes('user not found')) {
            return 'Usuário não encontrado.';
        }
        return msg;
    }, []);

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
            const rawMsg = e?.response?.data?.message || e?.message;
            let msg = rawMsg || 'Erro ao validar login.';
            const normalized = String(msg).toLowerCase();
            if (e?.code === 'ECONNABORTED' || normalized.includes('timeout')) {
                msg = 'Tempo de resposta excedido. Tente novamente.';
            } else if (e?.response?.status === 503) {
                msg = 'Servidor indisponível no momento. Tente novamente.';
            } else {
                msg = translateLoginError(msg, e?.response?.status);
            }
            return { success: false, error: msg };
        }
    }, [processUser, loadUsers, translateLoginError]);

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

    const changePassword = useCallback(async (currentPassword, newPassword) => {
        try {
            const result = await changeMyPassword(currentPassword, newPassword);
            if (result?.success) {
                return { success: true };
            }
            return { success: false, error: result?.message || 'Erro ao alterar senha.' };
        } catch (e) {
            const msg = e?.response?.data?.message || e?.message || 'Erro ao alterar senha.';
            return { success: false, error: msg };
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
            const tokenAtStart = token;

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
                const currentToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
                if (!cancelled && currentToken === tokenAtStart) {
                    logout();
                }
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
            changePassword,
            addUser,
            deleteUser,
            updateUserPermissions,
            approveUser
        }}>
            {children}
        </AuthContext.Provider>
    );
}
