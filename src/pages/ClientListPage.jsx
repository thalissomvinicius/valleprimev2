import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, Search, Edit2, Trash2, UserPlus,
    ArrowLeft, Loader2, AlertCircle, FileText,
    Calendar, Mail, Phone, MapPin, Building2, User
} from 'lucide-react';
import { getClients, deleteClient, saveClient } from '../services/api';
import { useAuth } from '../context/authContextValue';
import ClientFormModal from '../components/ClientFormModal';
import Loader from '../components/Loader';
import Header from '../components/Header';
import './ClientListPage.css';

function ClientListPage() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [clientTab, setClientTab] = useState('pf');

    const loadClients = useCallback(async (search = '', pageNum = 1, append = false) => {
        if (pageNum === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            // Permission check: if user is admin OR has explicit permission, see all.
            // Otherwise, filter by their own ID.
            const userCanSeeAll = currentUser?.role === 'admin' || currentUser?.canViewAllClients;
            const filterBy = userCanSeeAll ? '' : (currentUser?.id || '');

            const result = await getClients({
                search,
                page: pageNum,
                limit: 50,
                type: clientTab,
                created_by: filterBy
            });

            if (result.success) {
                if (append) {
                    setClients(prev => [...prev, ...result.clients]);
                } else {
                    setClients(result.clients);
                }
                setHasMore(result.clients.length === 50 && (pageNum * 50) < result.total_count);
            } else {
                setError(result.error);
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'Erro ao carregar clientes.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [clientTab, currentUser]);

    // Debounce search term
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Reload when debounced search changes
    useEffect(() => {
        if (currentUser) {
            setPage(1);
            loadClients(debouncedSearch, 1, false);
        }
    }, [debouncedSearch, clientTab, currentUser, loadClients]);

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        loadClients(debouncedSearch, nextPage, true);
    };

    const handleDelete = async (id) => {
        try {
            const result = await deleteClient(id);
            if (result.success) {
                setClients(prev => prev.filter(c => c.id !== id));
                setDeleteConfirm(null);
            }
        } catch {
            alert('Erro ao excluir cliente.');
        }
    };

    const handleEdit = (client) => {
        setEditingClient(client);
        setShowForm(true);
    };

    const handleNewClient = () => {
        setEditingClient(null);
        setShowForm(true);
    };

    const handleFormSuccess = async (submissionData) => {
        try {
            // Prepare submission data with ownership info and client_id for updates
            const dataToSave = {
                ...submissionData,
                created_by: currentUser?.id,
                client_id: editingClient?.id || null
            };

            console.log('[ClientListPage] Saving client data:', {
                isEdit: !!editingClient,
                clientId: dataToSave.client_id,
                nome: dataToSave.nome_proponente,
                tipo_pessoa: dataToSave.tipo_pessoa
            });

            // Save client data
            const result = await saveClient(dataToSave);
            if (result.success) {
                setShowForm(false);
                setEditingClient(null);
                // Reload current state
                loadClients(debouncedSearch, 1, false);
                setPage(1);
            } else {
                alert('Erro ao salvar cliente: ' + (result.error || 'Erro desconhecido'));
            }
        } catch (err) {
            console.error('Error saving client:', err);
            // Show detailed server error
            const serverError = err.response?.data?.error || err.response?.data?.message;
            const serverTrace = err.response?.data?.trace;
            if (serverTrace) {
                console.error('Server Traceback:', serverTrace);
            }
            alert('Erro ao salvar cliente: ' + (serverError || err.message || 'Erro desconhecido'));
        }
    };

    const handleModalDelete = async (clientId) => {
        try {
            await deleteClient(clientId);
            setShowForm(false);
            setEditingClient(null);
            loadClients(debouncedSearch, 1, false);
            setPage(1);
        } catch {
            alert('Erro ao excluir cliente.');
        }
    }

    const formatCpfCnpj = (value) => {
        if (!value) return '-';
        const digits = value.replace(/\D/g, '');
        if (digits.length === 11) {
            return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
        } else if (digits.length === 14) {
            return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
        }
        return value;
    };

    const formatPhone = (ddd, number) => {
        if (!number) return '-';
        return ddd ? `(${ddd}) ${number}` : number;
    };

    return (
        <div className="client-list-page">
            <Header title="Gerenciamento de Clientes">
                <div className="header-actions-desktop">
                    <button className="btn-new-client" onClick={handleNewClient}>
                        <UserPlus size={18} />
                        <span>Novo Cliente</span>
                    </button>
                    <button className="btn-back" onClick={() => navigate('/')}>
                        <ArrowLeft size={18} />
                        <span>Voltar ao Mapa</span>
                    </button>
                </div>
            </Header>

            <main className="container client-list-container">
                {/* Mobile Action Buttons (Visible only on mobile) */}
                <div className="mobile-actions-row">
                    <button className="btn-new-client full-width" onClick={handleNewClient}>
                        <UserPlus size={18} />
                        <span>Novo Cliente</span>
                    </button>
                    <button className="btn-back full-width" onClick={() => navigate('/')}>
                        <ArrowLeft size={18} />
                        <span>Voltar ao Mapa</span>
                    </button>
                </div>

                <div className="clients-filters-card animate-fade-in">
                    <div className="filters-row">
                        <div className="client-type-tabs">
                            <button
                                className={`client-tab-btn ${clientTab === 'pf' ? 'active' : ''}`}
                                onClick={() => setClientTab('pf')}
                            >
                                <User size={16} />
                                Pessoa Física
                            </button>
                            <button
                                className={`client-tab-btn ${clientTab === 'pj' ? 'active' : ''}`}
                                onClick={() => setClientTab('pj')}
                            >
                                <Building2 size={16} />
                                Pessoa Jurídica
                            </button>
                        </div>

                        <div className="search-bar-wrapper">
                            <Search className="search-icon" size={20} />
                            <input
                                type="text"
                                placeholder={clientTab === 'pf' ? "Pesquisar por nome ou CPF..." : "Pesquisar por razão social ou CNPJ..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <Loader label="Carregando contatos..." />
                    </div>
                ) : error ? (
                    <div className="error-state">
                        <AlertCircle size={40} />
                        <p>{error}</p>
                        <button onClick={() => loadClients(debouncedSearch, 1)}>Tentar Novamente</button>
                    </div>
                ) : clients.length === 0 ? (
                    <div className="empty-state animate-fade-in">
                        <Users size={60} />
                        <h3>Nenhum cliente encontrado</h3>
                        <p>{searchTerm ? 'Tente outros termos de pesquisa' : 'Os clientes serão salvos automaticamente ao gerar propostas.'}</p>
                    </div>
                ) : (
                    <div className="clients-table-container animate-fade-in-up">
                        <table className="clients-table">
                            <thead>
                                <tr>
                                    <th>{clientTab === 'pf' ? 'Nome' : 'Razão Social'}</th>
                                    <th>{clientTab === 'pf' ? 'CPF' : 'CNPJ'}</th>
                                    <th>Telefone</th>
                                    <th>Cidade</th>
                                    <th>Última Atualização</th>
                                    <th className="actions-column">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clients.map(client => (
                                    <tr
                                        key={client.id}
                                        className="client-row"
                                        onClick={() => handleEdit(client)}
                                    >
                                        <td className="client-name">
                                            <div className="name-cell">
                                                <div className="client-avatar-small" style={{ background: clientTab === 'pj' ? 'var(--accent-color)' : 'var(--primary-color)' }}>
                                                    {clientTab === 'pj' ? <Building2 size={14} /> : <User size={14} />}
                                                </div>
                                                <span>{client.nome}</span>
                                            </div>
                                        </td>
                                        <td className="cpf-cell">{formatCpfCnpj(client.cpf_cnpj)}</td>
                                        <td>{formatPhone(client.data?.fone1_ddd_proponente, client.data?.fone1_numero_proponente)}</td>
                                        <td>
                                            {client.data?.cidade_proponente && client.data?.uf_endereco_proponente
                                                ? `${client.data.cidade_proponente} - ${client.data.uf_endereco_proponente}`
                                                : '-'}
                                        </td>
                                        <td className="date-cell">
                                            {client.updated_at ? new Date(client.updated_at).toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                        <td className="actions-cell">
                                            <div className="action-buttons-group">
                                                <button
                                                    className="btn-action btn-edit"
                                                    title="Editar"
                                                    onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    className="btn-action btn-delete"
                                                    title="Excluir"
                                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(client.id); }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {hasMore && (
                            <div className="load-more-container">
                                <button
                                    className="btn-load-more"
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? (
                                        <>
                                            <Loader2 className="animate-spin" size={18} />
                                            <span>Carregando...</span>
                                        </>
                                    ) : (
                                        <span>Carregar mais contatos</span>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="confirm-modal animate-pop-in" onClick={e => e.stopPropagation()}>
                        <h3>Excluir Cliente?</h3>
                        <p>Esta ação não pode ser desfeita.</p>
                        <div className="modal-actions">
                            <button onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                            <button className="danger" onClick={() => handleDelete(deleteConfirm)}>Excluir</button>
                        </div>
                    </div>
                </div>
            )}

            {showForm && (
                <ClientFormModal
                    onClose={() => {
                        setShowForm(false);
                        setEditingClient(null);
                    }}
                    onConfirm={handleFormSuccess}
                    onDelete={handleModalDelete}
                    initialData={editingClient?.data}
                    clientId={editingClient?.id}
                />
            )}
        </div>
    );
}

export default ClientListPage;
