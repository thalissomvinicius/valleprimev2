import React, { createContext, useContext, useState, useEffect } from 'react';

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

// Admin padrão
const DEFAULT_ADMIN = {
    id: 'admin-1',
    nome: 'Administrador',
    email: 'admin@valle.com',
    senha: 'admin123',
    role: 'admin',
    obrasPermitidas: OBRAS.map(o => o.codigo),
    statusPermitidos: STATUS_LOTES.map(s => s.value),
    createdAt: new Date().toISOString(),
};

const STORAGE_KEYS = {
    USERS: 'valle_users',
    CURRENT_USER: 'valle_current_user',
};

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(DEFAULT_ADMIN);
    const [users, setUsers] = useState([DEFAULT_ADMIN]);
    const [loading, setLoading] = useState(false);

    // No logic needed for login/register as we are bypassing it
    // But keeping functions to avoid breaking other components
    const login = () => ({ success: true, user: DEFAULT_ADMIN });
    const register = () => ({ success: true, message: 'Cadastro desativado' });
    const logout = () => { };
    const updateUserPermissions = () => ({ success: true });
    const deleteUser = () => ({ success: true });
    const approveUser = () => ({ success: true });

    const value = {
        currentUser,
        users,
        loading,
        login,
        register,
        logout,
        updateUserPermissions,
        deleteUser,
        approveUser,
        isAdmin: true,
        isAuthenticated: true,
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
