import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, UserPlus, Users, Edit2, Trash2, User, Building2, ChevronLeft } from 'lucide-react';
import { getClients, deleteClient } from '../services/api';
import './ClientSelectionModal.css';

const ClientSelectionModal = ({ onSelectClient, onNewClient, onClose, onBack }) => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState(null);
    const [clientTab, setClientTab] = useState('pf'); // 'pf' or 'pj'

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    const loadClients = useCallback(async (search = '', pageNum = 1, append = false) => {
        if (pageNum === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            const result = await getClients({ search, page: pageNum, limit: 50, type: clientTab });
            if (result.success) {
                if (append) {
                    setClients(prev => [...prev, ...result.clients]);
                } else {
                    setClients(result.clients);
                }
                setHasMore(result.clients.length === 50 && (pageNum * 50) < result.total_count);
            } else {
                setError('Erro ao carregar clientes');
            }
        } catch {
            setError('Erro ao carregar clientes');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [clientTab]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Reload on search change or tab change
    useEffect(() => {
        setPage(1);
        loadClients(debouncedSearch, 1, false);
    }, [debouncedSearch, clientTab, loadClients]);

    const handleLoadMore = (e) => {
        e.stopPropagation();
        const nextPage = page + 1;
        setPage(nextPage);
        loadClients(debouncedSearch, nextPage, true);
    };

    const handleSelectClient = (client) => {
        onSelectClient(client);
    };

    const handleEditClient = (e, client) => {
        e.stopPropagation();
        onSelectClient(client); // Opens form with client data for editing
    };

    const handleDeleteClient = async (e, clientId) => {
        e.stopPropagation();

        if (!window.confirm('Tem certeza que deseja excluir este cliente?')) {
            return;
        }

        try {
            const result = await deleteClient(clientId);
            if (result.success) {
                // Reload current list
                loadClients(debouncedSearch, 1, false);
                setPage(1);
                alert('Cliente excluído com sucesso!');
            } else {
                alert('Erro ao excluir cliente: ' + (result.error || 'Erro desconhecido'));
            }
        } catch {
            alert('Erro ao excluir cliente');
        }
    };

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

    // Server-side filtering, no local filter needed
    const filteredClients = clients;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="client-selection-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-header-left">
                        <button className="back-btn" onClick={onBack || onClose} type="button">
                            <ChevronLeft size={20} />
                            Voltar
                        </button>
                        <div className="modal-title">
                            <Users size={24} />
                            <h2>Selecionar Cliente</h2>
                        </div>
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="action-buttons">
                        <button className="btn-new-client" onClick={onNewClient}>
                            <UserPlus size={20} />
                            Cadastrar Novo Cliente
                        </button>
                    </div>

                    {/* Tabs for PF/PJ */}
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

                    <div className="search-section">
                        <div className="search-wrapper">
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder={clientTab === 'pf' ? "Buscar por nome ou CPF..." : "Buscar por razão social ou CNPJ..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Carregando clientes...</p>
                        </div>
                    ) : error ? (
                        <div className="error-state">
                            <p>{error}</p>
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="empty-state">
                            <Users size={48} />
                            <p>
                                {searchTerm
                                    ? `Nenhum ${clientTab === 'pf' ? 'cliente PF' : 'cliente PJ'} encontrado`
                                    : `Nenhum ${clientTab === 'pf' ? 'cliente PF' : 'cliente PJ'} cadastrado ainda`}
                            </p>
                            <button className="btn-empty-action" onClick={onNewClient}>
                                <UserPlus size={18} />
                                Cadastrar Novo Cliente
                            </button>
                        </div>
                    ) : (
                        <div className="clients-table-container">
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
                                    {filteredClients.map(client => (
                                        <tr
                                            key={client.id}
                                            className="client-row"
                                            onClick={() => handleSelectClient(client)}
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
                                            <td>{formatPhone(client.data.fone1_ddd_proponente, client.data.fone1_numero_proponente)}</td>
                                            <td>
                                                {client.data.cidade_proponente && client.data.uf_endereco_proponente
                                                    ? `${client.data.cidade_proponente} - ${client.data.uf_endereco_proponente}`
                                                    : '-'}
                                            </td>
                                            <td className="date-cell">
                                                {new Date(client.updated_at).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="actions-cell">
                                                <div className="action-buttons-group">
                                                    <button
                                                        className="btn-action btn-edit"
                                                        onClick={(e) => handleEditClient(e, client)}
                                                        title="Editar cliente"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        className="btn-action btn-delete"
                                                        onClick={(e) => handleDeleteClient(e, client.id)}
                                                        title="Excluir cliente"
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
                                            <div className="spinner-small"></div>
                                        ) : (
                                            'Carregar mais...'
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClientSelectionModal;
