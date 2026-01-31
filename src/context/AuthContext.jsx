import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { hashPassword } from '../utils/authHash';

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
    USERS: 'valle_users',
    SESSION: 'valle_session',
};

/** Remove senha do objeto usuário antes de expor no estado */
function sanitizeUser(user) {
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
}

export function AuthProvider({ children }) {
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const persistUsers = useCallback((newUsers) => {
        setUsers(newUsers);
        try {
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(newUsers));
        } catch (e) {
            console.warn('Auth: falha ao salvar usuários', e);
        }
    }, []);

    // Inicialização: carregar usuários e restaurar sessão
    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                const raw = localStorage.getItem(STORAGE_KEYS.USERS);
                let list = raw ? JSON.parse(raw) : null;

                if (!list || !Array.isArray(list) || list.length === 0) {
                    const passwordHash = await hashPassword('admin123');
                    list = [{
                        id: 'admin-1',
                        username: 'admin',
                        nome: 'Administrador',
                        passwordHash,
                        role: 'admin',
                        obrasPermitidas: OBRAS.map(o => o.codigo),
                        statusPermitidos: STATUS_LOTES.map(s => s.value),
                        aprovado: true,
                        createdAt: new Date().toISOString(),
                    }];
                    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(list));
                }

                if (cancelled) return;
                setUsers(list);

                const session = sessionStorage.getItem(STORAGE_KEYS.SESSION);
                if (session) {
                    try {
                        const { userId } = JSON.parse(session);
                        const user = list.find(u => u.id === userId);
                        if (user) setCurrentUser(sanitizeUser(user));
                    } catch (_) {
                        sessionStorage.removeItem(STORAGE_KEYS.SESSION);
                    }
                }
            } catch (e) {
                console.warn('Auth init error', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        init();
        return () => { cancelled = true; };
    }, []);

    const login = useCallback(async (username, password) => {
        const trimmed = (username || '').trim().toLowerCase();
        if (!trimmed || !password) return { success: false, error: 'Usuário e senha são obrigatórios.' };

        try {
            const passwordHash = await hashPassword(password);
            const user = users.find(u => (u.username || '').toLowerCase() === trimmed);
            if (!user || user.passwordHash !== passwordHash) {
                return { success: false, error: 'Usuário ou senha incorretos.' };
            }
            if (user.aprovado === false) {
                return { success: false, error: 'Aguardando aprovação do administrador.' };
            }

            const safe = sanitizeUser(user);
            setCurrentUser(safe);
            sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({ userId: user.id }));
            return { success: true, user: safe };
        } catch (e) {
            console.warn('Login error', e);
            return { success: false, error: 'Erro ao validar login. Tente novamente.' };
        }
    }, [users]);

    const logout = useCallback(() => {
        setCurrentUser(null);
        sessionStorage.removeItem(STORAGE_KEYS.SESSION);
    }, []);

    const addUser = useCallback(async (username, password, nome) => {
        const trimmedUser = (username || '').trim();
        const trimmedNome = (nome || trimmedUser || '').trim();
        if (!trimmedUser || !password) return { success: false, error: 'Usuário e senha são obrigatórios.' };
        if (users.some(u => (u.username || '').toLowerCase() === trimmedUser.toLowerCase())) {
            return { success: false, error: 'Este usuário já existe.' };
        }

        try {
            const passwordHash = await hashPassword(password);
            const newUser = {
                id: 'user-' + Date.now(),
                username: trimmedUser,
                nome: trimmedNome || trimmedUser,
                passwordHash,
                role: 'user',
                obrasPermitidas: OBRAS.map(o => o.codigo),
                statusPermitidos: STATUS_LOTES.map(s => s.value),
                aprovado: true,
                createdAt: new Date().toISOString(),
            };
            const next = [...users, newUser];
            persistUsers(next);
            return { success: true, user: sanitizeUser(newUser) };
        } catch (e) {
            console.warn('Add user error', e);
            return { success: false, error: 'Erro ao criar usuário.' };
        }
    }, [users, persistUsers]);

    const updateUserPermissions = useCallback((userId, { obrasPermitidas, statusPermitidos }) => {
        const next = users.map(u => {
            if (u.id !== userId) return u;
            return {
                ...u,
                obrasPermitidas: Array.isArray(obrasPermitidas) ? obrasPermitidas : u.obrasPermitidas,
                statusPermitidos: Array.isArray(statusPermitidos) ? statusPermitidos : u.statusPermitidos,
            };
        });
        persistUsers(next);
        if (currentUser?.id === userId) {
            setCurrentUser(sanitizeUser(next.find(u => u.id === userId)));
        }
    }, [users, currentUser, persistUsers]);

    const deleteUser = useCallback((userId) => {
        const next = users.filter(u => u.id !== userId);
        persistUsers(next);
        if (currentUser?.id === userId) {
            setCurrentUser(null);
            sessionStorage.removeItem(STORAGE_KEYS.SESSION);
        }
    }, [users, currentUser, persistUsers]);

    const approveUser = useCallback((userId) => {
        const next = users.map(u => u.id === userId ? { ...u, aprovado: true } : u);
        persistUsers(next);
    }, [users, persistUsers]);

    const value = {
        currentUser,
        users,
        loading,
        login,
        register: () => ({ success: false, message: 'Cadastro desativado. Peça acesso ao administrador.' }),
        logout,
        addUser,
        updateUserPermissions,
        deleteUser,
        approveUser,
        isAdmin: currentUser?.role === 'admin',
        isAuthenticated: !!currentUser,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
