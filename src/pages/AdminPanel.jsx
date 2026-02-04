import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, OBRAS, STATUS_LOTES } from '../context/AuthContext';
import {
    Users, Settings, LogOut, Check, Edit2, Trash2, Shield,
    Building2, Eye, ChevronDown, ChevronUp, Save, XCircle, UserPlus, Home
} from 'lucide-react';
import './AdminPanel.css';

function AdminPanel() {
    const { users, currentUser, logout, addUser, updateUserPermissions, deleteUser, approveUser } = useAuth();
    const [editingUser, setEditingUser] = useState(null);
    const [editData, setEditData] = useState({});
    const [expandedUser, setExpandedUser] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newNome, setNewNome] = useState('');
    const [addError, setAddError] = useState('');
    const [addSubmitting, setAddSubmitting] = useState(false);

    // Filtrar usuários (não mostrar admin na lista)
    const regularUsers = users.filter(u => u.role !== 'admin');

    const startEdit = (user) => {
        setEditingUser(user.id);
        setEditData({
            obrasPermitidas: [...user.obrasPermitidas],
            statusPermitidos: [...user.statusPermitidos],
            canViewAllClients: !!user.canViewAllClients,
        });
        setExpandedUser(user.id);
    };

    const cancelEdit = () => {
        setEditingUser(null);
        setEditData({});
    };

    const saveEdit = async () => {
        try {
            // Enviar os dados dentro da chave 'permissions' como o backend espera
            const result = await updateUserPermissions(editingUser, { permissions: editData });
            if (result.success) {
                setEditingUser(null);
                setEditData({});
            } else {
                alert(result.error || 'Erro ao salvar alterações.');
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('Ocorreu um erro inesperado ao salvar.');
        }
    };

    const toggleObra = (codigo) => {
        setEditData(prev => {
            const obras = prev.obrasPermitidas.includes(codigo)
                ? prev.obrasPermitidas.filter(c => c !== codigo)
                : [...prev.obrasPermitidas, codigo];
            return { ...prev, obrasPermitidas: obras };
        });
    };

    const toggleStatus = (status) => {
        setEditData(prev => {
            const statusList = prev.statusPermitidos.includes(status)
                ? prev.statusPermitidos.filter(s => s !== status)
                : [...prev.statusPermitidos, status];
            return { ...prev, statusPermitidos: statusList };
        });
    };

    const selectAllObras = () => {
        setEditData(prev => ({
            ...prev,
            obrasPermitidas: OBRAS.map(o => o.codigo),
        }));
    };

    const clearAllObras = () => {
        setEditData(prev => ({
            ...prev,
            obrasPermitidas: [],
        }));
    };

    const handleDelete = (userId) => {
        deleteUser(userId);
        setDeleteConfirm(null);
    };

    const handleApprove = (userId) => {
        approveUser(userId);
    };

    const toggleExpand = (userId) => {
        if (editingUser === userId) return;
        setExpandedUser(expandedUser === userId ? null : userId);
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        setAddError('');
        setAddSubmitting(true);
        try {
            const result = await addUser(newUsername, newPassword, newNome);
            if (result.success) {
                setNewUsername('');
                setNewPassword('');
                setNewNome('');
                setShowAddForm(false);
            } else {
                setAddError(result.error || 'Erro ao cadastrar.');
            }
        } catch {
            setAddError('Erro ao cadastrar usuário.');
        } finally {
            setAddSubmitting(false);
        }
    };

    return (
        <div className="admin-panel">
            <header className="admin-header">
                <div className="admin-header-content">
                    <div className="admin-title">
                        <Shield size={32} />
                        <div>
                            <h1>Painel Administrativo</h1>
                            <p>Gerenciamento de Usuários e Permissões</p>
                        </div>
                    </div>
                    <div className="admin-actions">
                        <Link to="/" className="btn-logout btn-admin-home" title="Voltar ao sistema">
                            <Home size={18} />
                            Início
                        </Link>
                        <span className="admin-user">
                            <Settings size={18} />
                            {currentUser?.nome}
                        </span>
                        <button className="btn-logout" onClick={logout}>
                            <LogOut size={18} />
                            Sair
                        </button>
                    </div>
                </div>
            </header>

            <main className="admin-content">
                <div className="stats-cards">
                    <div className="stat-card">
                        <div className="stat-icon users">
                            <Users size={24} />
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{regularUsers.length}</span>
                            <span className="stat-label">Usuários Cadastrados</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon pending">
                            <Eye size={24} />
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{regularUsers.filter(u => !u.aprovado).length}</span>
                            <span className="stat-label">Aguardando Aprovação</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon obras">
                            <Building2 size={24} />
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{OBRAS.length}</span>
                            <span className="stat-label">Obras Disponíveis</span>
                        </div>
                    </div>
                </div>

                <div className="users-section">
                    <div className="section-header section-header-with-action">
                        <h2>
                            <Users size={22} />
                            Lista de Usuários
                        </h2>
                        <button
                            type="button"
                            className="btn-add-user"
                            onClick={() => { setShowAddForm(!showAddForm); setAddError(''); }}
                        >
                            <UserPlus size={20} />
                            {showAddForm ? 'Cancelar' : 'Adicionar usuário'}
                        </button>
                    </div>

                    {showAddForm && (
                        <form className="add-user-form" onSubmit={handleAddUser}>
                            <div className="add-user-fields">
                                <div className="form-group">
                                    <label>Usuário (login)</label>
                                    <input
                                        type="text"
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                        placeholder="Ex: joao.silva"
                                        required
                                        disabled={addSubmitting}
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Senha</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Senha de acesso"
                                        required
                                        minLength={4}
                                        disabled={addSubmitting}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Nome (opcional)</label>
                                    <input
                                        type="text"
                                        value={newNome}
                                        onChange={(e) => setNewNome(e.target.value)}
                                        placeholder="Ex: João Silva"
                                        disabled={addSubmitting}
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="add-user-submit">
                                    <button type="submit" className="btn-save" disabled={addSubmitting}>
                                        {addSubmitting ? 'Salvando...' : 'Cadastrar'}
                                    </button>
                                </div>
                            </div>
                            {addError && (
                                <div className="message error-message" style={{ marginTop: '0.75rem' }}>
                                    {addError}
                                </div>
                            )}
                        </form>
                    )}

                    {regularUsers.length === 0 ? (
                        <div className="empty-state">
                            <Users size={48} />
                            <p>Nenhum usuário cadastrado ainda.</p>
                        </div>
                    ) : (
                        <div className="users-list">
                            {regularUsers.map(user => (
                                <div key={user.id} className={`user-card ${!user.aprovado ? 'pending' : ''}`}>
                                    <div className="user-main" onClick={() => toggleExpand(user.id)}>
                                        <div className="user-info">
                                            <div className="user-avatar">
                                                {user.nome.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="user-details">
                                                <h3>{user.nome}</h3>
                                                <p>Login: {user.username}</p>
                                                <div className="user-badges">
                                                    {!user.aprovado && (
                                                        <span className="badge pending">Pendente</span>
                                                    )}
                                                    <span className="badge obras">
                                                        {user.obrasPermitidas.length} obra(s)
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="user-actions">
                                            {!user.aprovado && (
                                                <button
                                                    className="btn-action approve"
                                                    onClick={(e) => { e.stopPropagation(); handleApprove(user.id); }}
                                                    title="Aprovar usuário"
                                                >
                                                    <Check size={18} />
                                                </button>
                                            )}
                                            <button
                                                className="btn-action edit"
                                                onClick={(e) => { e.stopPropagation(); startEdit(user); }}
                                                title="Editar permissões"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                className="btn-action delete"
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(user.id); }}
                                                title="Excluir usuário"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                            <button className="btn-expand">
                                                {expandedUser === user.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </button>
                                        </div>
                                    </div>

                                    {(expandedUser === user.id || editingUser === user.id) && (
                                        <div className="user-expanded">
                                            <div className="permissions-section">
                                                <div className="permission-group">
                                                    <div className="permission-header">
                                                        <h4>
                                                            <Building2 size={18} />
                                                            Obras Permitidas
                                                        </h4>
                                                        {editingUser === user.id && (
                                                            <div className="permission-bulk">
                                                                <button onClick={selectAllObras}>Selecionar Todas</button>
                                                                <button onClick={clearAllObras}>Limpar</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="permission-list obras">
                                                        {OBRAS.map(obra => {
                                                            const isAllowed = editingUser === user.id
                                                                ? editData.obrasPermitidas.includes(obra.codigo)
                                                                : user.obrasPermitidas.includes(obra.codigo);

                                                            return (
                                                                <label
                                                                    key={obra.codigo}
                                                                    className={`permission-item ${isAllowed ? 'active' : ''} ${editingUser !== user.id ? 'readonly' : ''}`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isAllowed}
                                                                        onChange={() => editingUser === user.id && toggleObra(obra.codigo)}
                                                                        disabled={editingUser !== user.id}
                                                                    />
                                                                    <span className="codigo">{obra.codigo}</span>
                                                                    <span className="descricao">{obra.descricao}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="permission-group">
                                                    <h4>
                                                        <Eye size={18} />
                                                        Status Visíveis
                                                    </h4>
                                                    <div className="permission-list status">
                                                        {STATUS_LOTES.map(status => {
                                                            const isAllowed = editingUser === user.id
                                                                ? editData.statusPermitidos.includes(status.value)
                                                                : user.statusPermitidos.includes(status.value);

                                                            return (
                                                                <label
                                                                    key={status.value}
                                                                    className={`permission-item status-item ${status.color} ${isAllowed ? 'active' : ''} ${editingUser !== user.id ? 'readonly' : ''}`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isAllowed}
                                                                        onChange={() => editingUser === user.id && toggleStatus(status.value)}
                                                                        disabled={editingUser !== user.id}
                                                                    />
                                                                    <span>{status.label}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="permission-group">
                                                    <h4>
                                                        <Users size={18} />
                                                        Acesso a Clientes
                                                    </h4>
                                                    <div className="permission-list">
                                                        <label
                                                            className={`permission-item ${(editingUser === user.id ? editData.canViewAllClients : user.canViewAllClients) ? 'active' : ''
                                                                } ${editingUser !== user.id ? 'readonly' : ''}`}
                                                            style={{ width: '100%' }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={editingUser === user.id ? !!editData.canViewAllClients : !!user.canViewAllClients}
                                                                onChange={() => {
                                                                    if (editingUser === user.id) {
                                                                        setEditData(prev => ({
                                                                            ...prev,
                                                                            canViewAllClients: !prev.canViewAllClients
                                                                        }));
                                                                    }
                                                                }}
                                                                disabled={editingUser !== user.id}
                                                            />
                                                            <span>Visualizar TODOS os clientes (ignora restrição de dono)</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>

                                            {editingUser === user.id && (
                                                <div className="edit-actions">
                                                    <button className="btn-cancel" onClick={cancelEdit}>
                                                        <XCircle size={18} />
                                                        Cancelar
                                                    </button>
                                                    <button className="btn-save" onClick={saveEdit}>
                                                        <Save size={18} />
                                                        Salvar Alterações
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {deleteConfirm === user.id && (
                                        <div className="delete-confirm">
                                            <p>Confirmar exclusão de <strong>{user.nome}</strong>?</p>
                                            <div className="confirm-actions">
                                                <button onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                                                <button className="danger" onClick={() => handleDelete(user.id)}>Excluir</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default AdminPanel;
