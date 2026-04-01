import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Users, 
    TrendingUp, 
    DollarSign, 
    AlertCircle, 
    ChevronDown, 
    Calendar, 
    Filter, 
    Search, 
    User, 
    Phone, 
    Mail, 
    MapPin, 
    Info,
    Loader2,
    Briefcase
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchCorretoresData, fetchConfigObras } from '../services/api';
import Header from '../components/Header';
import Footer from '../components/Footer';
import './BrokersPage.css';

const BrokersPage = () => {
    const { currentUser, isAdmin } = useAuth();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const [stats, setStats] = useState({ totalVgv: 0, totalSales: 0, totalPending: 0 });
    const [openBrokerId, setOpenBrokerId] = useState(null);
    
    // Filters
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [searchTerm, setSearchTerm] = useState('');
    
    // Obra selection
    const [obrasList, setObrasList] = useState([]);
    const [selectedObraId, setSelectedObraId] = useState(''); // "empresa-obra"


    const loadData = useCallback(async () => {
        if (obrasList.length > 0 && !selectedObraId) return; // Wait for initial selection

        setLoading(true);
        try {
            let empresa = 28;
            let obra = '70100';

            if (selectedObraId) {
                const [emp, obr] = selectedObraId.split('-');
                empresa = parseInt(emp);
                obra = obr;
            }

            // Se não for admin, filtramos apenas pelo corretor logado
            const uauId = currentUser?.permissions?.uau_corretor_id;
            const filters = {
                mes: selectedMonth,
                corretor_id: isAdmin ? null : (uauId || currentUser?.id),
                empresa: empresa,
                obra: obra
            };

            const result = await fetchCorretoresData(filters);
            const brokersList = result.dados || [];
            setData(brokersList);

            // Calculate global stats for the cards
            let vgv = 0;
            let sales = 0;
            let pending = 0;

            brokersList.forEach(broker => {
                vgv += broker.resumo.vgv_total || 0;
                sales += broker.resumo.vendas_total_obra || 0;
                
                broker.vendas_detalhadas.forEach(venda => {
                    if (venda.sinal_negocio.situacao === 'Em Atraso') {
                        pending += venda.sinal_negocio.valor_em_atraso || 0;
                    }
                });
            });

            setStats({ totalVgv: vgv, totalSales: sales, totalPending: pending });
        } catch (error) {
            console.error("Error loading brokers page:", error);
        } finally {
            setLoading(false);
        }
    }, [selectedMonth, currentUser?.id, isAdmin, currentUser?.permissions?.uau_corretor_id, selectedObraId]);

    useEffect(() => {
        const fetchObras = async () => {
            try {
                const res = await fetchConfigObras();
                if (res.obras && res.obras.length > 0) {
                    setObrasList(res.obras);
                    // Default to 70100 if available, else first one
                    const defaultObra = res.obras.find(o => o.obra === '70100') || res.obras[0];
                    setSelectedObraId(`${defaultObra.empresa}-${defaultObra.obra}`);
                }
            } catch (err) {
                console.error("Erro ao carregar obras:", err);
            }
        };
        fetchObras();
    }, []);

    useEffect(() => {
        if (selectedObraId) {
            loadData();
        }
    }, [loadData, selectedObraId]);

    const filteredBrokers = useMemo(() => {
        if (!searchTerm) return data;
        const lowerSearch = searchTerm.toLowerCase();
        return data.filter(b => 
            b.corretor.toLowerCase().includes(lowerSearch) || 
            b.diretoria_equipe.toLowerCase().includes(lowerSearch)
        );
    }, [data, searchTerm]);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    const toggleBroker = (id) => {
        setOpenBrokerId(openBrokerId === id ? null : id);
    };

    return (
        <div className="brokers-page">
            <Header title="Performance de Vendas" />

            <main className="brokers-container">
                <header className="brokers-hero animate-fade-in-up">
                    <div className="hero-content">
                        <div className="hero-title">
                            <div className="hero-icon">
                                <TrendingUp size={20} />
                            </div>
                            <div>
                                <h1>Gestão de Corretores</h1>
                                <p className="stat-secondary-label">Análise de VGV e Recebíveis</p>
                            </div>
                        </div>

                        <div className="broker-filters">
                            <div className="filter-group">
                                <Briefcase size={16} />
                                <select 
                                    className="minimal-select"
                                    value={selectedObraId}
                                    onChange={(e) => setSelectedObraId(e.target.value)}
                                >
                                    {obrasList.map(item => (
                                        <option key={`${item.empresa}-${item.obra}`} value={`${item.empresa}-${item.obra}`}>
                                            {item.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="header-divider"></div>

                            <div className="filter-group">
                                <Calendar size={16} />
                                <input 
                                    type="month" 
                                    className="minimal-date-picker"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                />
                            </div>

                            <div className="header-divider"></div>

                            <div className="filter-group search-box">
                                <Search size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar corretor..."
                                    className="minimal-search"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </header>

                <section className="brokers-stats-grid animate-fade-in-up">
                    <div className="broker-stat-card">
                        <div className="stat-icon vgv">
                            <TrendingUp size={28} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-secondary-label">VGV Total da Obra</span>
                            <span className="stat-main-value">{formatCurrency(stats.totalVgv)}</span>
                        </div>
                    </div>

                    <div className="broker-stat-card">
                        <div className="stat-icon sales">
                            <DollarSign size={28} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-secondary-label">Total de Vendas</span>
                            <span className="stat-main-value">{stats.totalSales} Lotes</span>
                        </div>
                    </div>

                    <div className="broker-stat-card">
                        <div className="stat-icon pending">
                            <AlertCircle size={28} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-secondary-label">Sinais em Atraso</span>
                            <span className="stat-main-value" style={{ color: 'var(--danger-color)' }}>
                                {formatCurrency(stats.totalPending)}
                            </span>
                        </div>
                    </div>
                </section>

                <section className="brokers-list-section animate-fade-in-up">
                    <div className="list-header">
                        <span>Corretor / Consultor</span>
                        <span>Equipe / Gerência</span>
                        <span>VGV Unidades</span>
                        <span>Vendas</span>
                        <span></span>
                    </div>

                    {loading ? (
                        <div className="loading-container">
                            <Loader2 className="loading-spinner-large" size={48} />
                            <p>Carregando dados do servidor Valle...</p>
                        </div>
                    ) : filteredBrokers.length === 0 ? (
                        <div className="empty-state">
                            <Info size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <h3>Nenhum dado encontrado</h3>
                            <p>Não há registros de vendas para os filtros aplicados.</p>
                        </div>
                    ) : (
                        filteredBrokers.map(broker => (
                            <div key={broker.codigo_corretor} className="broker-row">
                                <div 
                                    className="broker-row-header"
                                    onClick={() => toggleBroker(broker.codigo_corretor)}
                                >
                                    <div className="broker-info-cell">
                                        <div className="broker-avatar">
                                            {broker.corretor.charAt(0)}
                                        </div>
                                        <div className="broker-name">
                                            <span>{broker.corretor}</span>
                                            <small>ID: {broker.codigo_corretor}</small>
                                        </div>
                                    </div>
                                    <div className="team-cell">
                                        <div className="flex-center" style={{gap: '0.5rem'}}>
                                            <Briefcase size={14} style={{opacity: 0.5}} />
                                            {broker.diretoria_equipe}
                                        </div>
                                    </div>
                                    <div className="vgv-cell">
                                        <span className="metric-label hide-desktop">VGV Total</span>
                                        {formatCurrency(broker.resumo.vgv_total)}
                                    </div>
                                    <div className="sales-cell">
                                        <span className="metric-label hide-desktop">Vendas</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span className="sales-badge">{broker.resumo.vendas_total_obra}</span>
                                            <small className="hide-mobile">unidades</small>
                                        </div>
                                    </div>
                                    <div className={`chevron-cell ${openBrokerId === broker.codigo_corretor ? 'is-open' : ''}`}>
                                        <ChevronDown size={20} />
                                    </div>
                                </div>

                                {openBrokerId === broker.codigo_corretor && (
                                    <div className="broker-details">
                                        <div className="sale-section-title">
                                            <TrendingUp size={14} /> Detalhamento de Contratos
                                        </div>
                                        <div className="sales-table-container">
                                            <table className="sales-table">
                                                <thead>
                                                    <tr>
                                                        <th>Unidade</th>
                                                        <th>Cliente</th>
                                                        <th>VGV</th>
                                                        <th>Plano</th>
                                                        <th>Situação do Sinal</th>
                                                        <th>Status</th>
                                                        <th>Data</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {broker.vendas_detalhadas.map(venda => (
                                                        <tr key={venda.venda_id}>
                                                            <td className="col-unit">
                                                                <small>QD {venda.quadra}</small>
                                                                LT {venda.lote}
                                                            </td>
                                                            <td className="col-client">
                                                                <div className="client-name-cell">
                                                                    <b>{venda.client?.nome || venda.cliente?.nome}</b>
                                                                    <div className="info-trigger">
                                                                        <Info size={12} /> Ver detalhes
                                                                    </div>
                                                                    <div className="client-popover">
                                                                        <div><strong>CPF:</strong> {venda.client?.cpf || venda.cliente?.cpf}</div>
                                                                        <div><strong>Tel:</strong> {venda.client?.telefone || venda.cliente?.telefone || 'N/A'}</div>
                                                                        <div><strong>End:</strong> {venda.client?.endereco || venda.cliente?.endereco}</div>
                                                                        <div style={{marginTop: '5px', paddingTop: '5px', borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                                                                            <strong>Contrato:</strong> #{venda.venda_id}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="col-vgv">
                                                                {formatCurrency(venda.valor_venda)}
                                                            </td>
                                                            <td style={{fontSize: '0.8rem', color: '#64748b'}}>
                                                                {venda.condicao_pagamento}
                                                            </td>
                                                            <td className="col-signal">
                                                                <div className="signal-text">
                                                                    {venda.sinal_negocio.situacao}
                                                                </div>
                                                                <div className="signal-bar">
                                                                    <div 
                                                                        className="signal-progress" 
                                                                        style={{ 
                                                                            width: `${(venda.sinal_negocio.valor_ja_pago / (venda.sinal_negocio.valor_ja_pago + (venda.sinal_negocio.valor_a_pagar || 0))) * 100}%`,
                                                                            backgroundColor: venda.sinal_negocio.situacao.includes('Atraso') ? '#ef4444' : '#10b981'
                                                                        }}
                                                                    ></div>
                                                                </div>
                                                                <small style={{fontSize: '0.7rem', color: '#94a3b8'}}>
                                                                    {formatCurrency(venda.sinal_negocio.valor_ja_pago)} de {formatCurrency(venda.sinal_negocio.valor_ja_pago + (venda.sinal_negocio.valor_a_pagar || 0))}
                                                                </small>
                                                            </td>
                                                            <td>
                                                                <span className={`status-badge ${venda.status_venda.toLowerCase()}`} style={{padding: '4px 8px', fontSize: '0.7rem'}}>
                                                                    {venda.status_venda}
                                                                </span>
                                                                {venda.progresso_financiamento.parcelas_em_atraso > 0 && (
                                                                    <div style={{color: '#be123c', fontSize: '0.65rem', fontWeight: '800', marginTop: '4px'}}>
                                                                        {venda.progresso_financiamento.parcelas_em_atraso} parc. atraso
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td style={{fontSize: '0.85rem', color: '#64748b'}}>
                                                                {new Date(venda.data_venda).toLocaleDateString('pt-BR')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default BrokersPage;
