import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, RefreshCw, Edit2, AlertCircle, Loader2, LayoutDashboard, Home, Users, Shield, LogOut, Trash2 } from 'lucide-react';
import Header from '../components/Header';
import ClientFormModal from '../components/ClientFormModal';
import { getProposals, printProposal, updateProposal, deleteProposal } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import './ProposalHistoryPage.css';

const ProposalHistoryPage = () => {
    const { logout, isAdmin } = useAuth();
    const { showToast } = useToast();
    const [proposals, setProposals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editingProposal, setEditingProposal] = useState(null);
    const [showClientModal, setShowClientModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const loadProposals = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getProposals({ page: 1, limit: 200 });
            setProposals(result.proposals || []);
        } catch (err) {
            const rawMsg = err?.message || '';
            const normalized = String(rawMsg).toLowerCase();
            if (err?.code === 'ECONNABORTED' || normalized.includes('timeout')) {
                setError('Tempo de resposta excedido. Tente novamente.');
            } else if (normalized.includes('network error')) {
                setError('Erro de rede. Verifique sua conexão e tente novamente.');
            } else {
                setError(err?.message || 'Erro ao carregar propostas.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProposals();
    }, []);

    const handlePrint = async (proposal) => {
        try {
            const blob = await printProposal(proposal.id);
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch {
            showToast('Erro ao reimprimir proposta.', 'error');
        }
    };

    const handleEditClient = (proposal) => {
        setEditingProposal(proposal);
        setShowClientModal(true);
    };

    const handleUpdateClient = async (clientData) => {
        if (!editingProposal) return;
        const currentPayload = editingProposal.payload || {};
        const updatedPayload = { ...currentPayload, ...clientData };
        await updateProposal(editingProposal.id, updatedPayload);
        setProposals(prev => prev.map(item => item.id === editingProposal.id ? {
            ...item,
            payload: updatedPayload
        } : item));
        setShowClientModal(false);
        setEditingProposal(null);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteProposal(deleteTarget.id);
            setProposals(prev => prev.filter(item => item.id !== deleteTarget.id));
            setDeleteTarget(null);
            showToast('Proposta excluída.', 'success');
        } catch {
            showToast('Erro ao excluir proposta.', 'error');
        }
    };

    const rows = useMemo(() => proposals.map((proposal) => {
        const payload = proposal.payload || {};
        const lot = payload.lot || {};
        const obra = proposal.obra_nome || payload.obraName || '—';
        const quadra = proposal.quadra || lot.QD || '—';
        const lote = proposal.lote || lot.LT || '—';
        const cliente = payload.nome_proponente || payload.nome || '—';
        const data = payload.proposta_data || '—';
        return { proposal, obra, quadra, lote, cliente, data };
    }), [proposals]);

    return (
        <div className="proposal-history-page">
            <Header title="Histórico de Propostas">
                <Link to="/dashboard" className="btn-clients-header" title="Dashboard">
                    <LayoutDashboard size={18} />
                    <span className="hide-mobile">Dashboard</span>
                </Link>
                <Link to="/disponibilidade" className="btn-clients-header" title="Disponibilidades">
                    <Home size={18} />
                    <span className="hide-mobile">Disponibilidade</span>
                </Link>
                <Link to="/clientes" className="btn-clients-header" title="Clientes">
                    <Users size={18} />
                    <span className="hide-mobile">Clientes</span>
                </Link>
                {isAdmin && (
                    <Link to="/admin" className="btn-clients-header" title="Admin">
                        <Shield size={18} />
                        <span className="hide-mobile">Admin</span>
                    </Link>
                )}
                <button className="btn-logout" onClick={logout} title="Sair">
                    <LogOut size={18} />
                    <span className="hide-mobile">Sair</span>
                </button>
            </Header>

            <div className="proposal-history-container">
                <div className="proposal-history-header">
                    <div className="header-info">
                        <h1>Propostas Geradas</h1>
                        <p>Reimprima ou atualize dados do cliente</p>
                    </div>
                    <button className="refresh-btn" onClick={loadProposals}>
                        <RefreshCw size={16} />
                        Atualizar
                    </button>
                </div>

                {loading && (
                    <div className="proposal-loading">
                        <Loader2 className="spin" size={22} />
                        <span>Carregando propostas...</span>
                    </div>
                )}

                {error && !loading && (
                    <div className="proposal-error">
                        <AlertCircle size={20} />
                        <span>{error}</span>
                    </div>
                )}

                {!loading && !error && rows.length === 0 && (
                    <div className="proposal-empty">
                        <FileText size={22} />
                        <span>Nenhuma proposta encontrada.</span>
                    </div>
                )}

                {!loading && !error && rows.length > 0 && (
                    <div className="proposal-table">
                        <div className="proposal-table-head">
                            <span>Cliente</span>
                            <span>Obra</span>
                            <span>Quadra</span>
                            <span>Lote</span>
                            <span>Data</span>
                            <span>Ações</span>
                        </div>
                        {deleteTarget && (
                            <div className="proposal-delete-confirm">
                                <div>
                                    <strong>Excluir proposta?</strong>
                                    <span>Essa ação não pode ser desfeita.</span>
                                </div>
                                <div className="proposal-delete-actions">
                                    <button className="action-btn" onClick={() => setDeleteTarget(null)}>
                                        Cancelar
                                    </button>
                                    <button className="action-btn danger" onClick={handleDelete}>
                                        <Trash2 size={16} />
                                        Excluir
                                    </button>
                                </div>
                            </div>
                        )}
                        {rows.map(({ proposal, obra, quadra, lote, cliente, data }) => (
                            <div key={proposal.id} className="proposal-table-row">
                                <span className="proposal-client" data-label="Cliente">{cliente}</span>
                                <span className="proposal-obra" data-label="Obra">{obra}</span>
                                <span data-label="Quadra">{quadra}</span>
                                <span data-label="Lote">{lote}</span>
                                <span data-label="Data">{data}</span>
                                <div className="proposal-actions">
                                    <button className="action-btn primary" onClick={() => handlePrint(proposal)}>
                                        <FileText size={16} />
                                        Reimprimir
                                    </button>
                                    <button className="action-btn" onClick={() => handleEditClient(proposal)}>
                                        <Edit2 size={16} />
                                        Editar
                                    </button>
                                    <button className="action-btn danger" onClick={() => setDeleteTarget(proposal)}>
                                        <Trash2 size={16} />
                                        Excluir
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showClientModal && editingProposal && (
                <ClientFormModal
                    onClose={() => {
                        setShowClientModal(false);
                        setEditingProposal(null);
                    }}
                    onConfirm={handleUpdateClient}
                    initialData={editingProposal.payload}
                    lot={editingProposal.payload?.lot}
                    obraName={editingProposal.payload?.obraName}
                />
            )}
        </div>
    );
};

export default ProposalHistoryPage;
