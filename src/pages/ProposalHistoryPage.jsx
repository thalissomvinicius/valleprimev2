import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, RefreshCw, Edit2, AlertCircle, Loader2, Trash2, Search } from 'lucide-react';
import Header from '../components/Header';
import ClientFormModal from '../components/ClientFormModal';
import { getProposals, printProposal, updateProposal, deleteProposal } from '../services/api';
// import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import './ProposalHistoryPage.css';

const ProposalHistoryPage = () => {
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

            // Extract filename data
            const payload = proposal.payload || {};
            const lot = payload.lot || {};
            const qdStr = String(proposal.quadra || lot.QD || '').padStart(3, '0');
            const ltStr = String(proposal.lote || lot.LT || '').padStart(3, '0');
            const obra = (proposal.obra_nome || payload.obraName || 'EMPREENDIMENTO').substring(0, 15).toUpperCase();
            const cliente = (payload.nome_proponente || payload.nome || 'CLIENTE').toUpperCase().substring(0, 30);

            // Forçar download para evitar bloqueio de pop-up
            const link = document.createElement('a');
            link.href = url;
            link.download = `${obra} - QD${qdStr} - LT${ltStr} - ${cliente}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showToast('✅ Proposta reimpressa com sucesso! Download iniciado.', 'success');
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

    const [searchTerms, setSearchTerms] = useState({ quadra: '', lote: '', cliente: '' });

    const filteredProposals = useMemo(() => {
        return proposals.filter(proposal => {
            const payload = proposal.payload || {};
            const lot = payload.lot || {};
            const quadra = (proposal.quadra || lot.QD || '').toLowerCase();
            const lote = (proposal.lote || lot.LT || '').toLowerCase();
            const cliente = (payload.nome_proponente || payload.nome || '').toLowerCase();

            if (searchTerms.quadra && !quadra.includes(searchTerms.quadra.toLowerCase())) return false;
            if (searchTerms.lote && !lote.includes(searchTerms.lote.toLowerCase())) return false;
            if (searchTerms.cliente && !cliente.includes(searchTerms.cliente.toLowerCase())) return false;

            return true;
        });
    }, [proposals, searchTerms]);

    const rows = useMemo(() => filteredProposals.map((proposal) => {
        const payload = proposal.payload || {};
        const lot = payload.lot || {};
        const obra = proposal.obra_nome || payload.obraName || '—';
        const quadra = proposal.quadra || lot.QD || '—';
        const lote = proposal.lote || lot.LT || '—';
        const cliente = payload.nome_proponente || payload.nome || '—';
        const data = payload.proposta_data || '—';
        return { proposal, obra, quadra, lote, cliente, data };
    }), [filteredProposals]);

    return (
        <div className="proposal-history-page">
            <Header title="Histórico de Propostas" />

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

                <div className="proposal-filters">
                    <div className="search-input-wrapper">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Buscar quadra..."
                            value={searchTerms.quadra}
                            onChange={(e) => setSearchTerms(prev => ({ ...prev, quadra: e.target.value }))}
                        />
                    </div>
                    <div className="search-input-wrapper">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Buscar lote..."
                            value={searchTerms.lote}
                            onChange={(e) => setSearchTerms(prev => ({ ...prev, lote: e.target.value }))}
                        />
                    </div>
                    <div className="search-input-wrapper client-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            value={searchTerms.cliente}
                            onChange={(e) => setSearchTerms(prev => ({ ...prev, cliente: e.target.value }))}
                        />
                    </div>
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
                    <div className="table-responsive-wrapper">
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
