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
    Briefcase,
    X
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
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isCacheData, setIsCacheData] = useState(false);
    const [showSyncBanner, setShowSyncBanner] = useState(true);
    
    // Filters
    const [selectedMonth, setSelectedMonth] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showCancelados, setShowCancelados] = useState(false);
    
    // Obra/Period select options
    const [availableMonths, setAvailableMonths] = useState([]);
    const [obrasList, setObrasList] = useState([]);
    const [selectedObraId, setSelectedObraId] = useState(''); // "empresa-obra"

    // Expanded client card
    const [expandedVendaId, setExpandedVendaId] = useState(null);

    // Auto-dismiss sync banner after 8 seconds
    useEffect(() => {
        if (showSyncBanner && lastUpdate && !isCacheData) {
            const timer = setTimeout(() => setShowSyncBanner(false), 8000);
            return () => clearTimeout(timer);
        }
    }, [showSyncBanner, lastUpdate, isCacheData]);

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
            // permissions pode vir como string JSON ou objeto — parseamos de forma segura
            let perms = currentUser?.permissions;
            if (typeof perms === 'string') {
                try { perms = JSON.parse(perms); } catch { perms = {}; }
            }
            const uauId = perms?.uau_corretor_id;
            const filters = {
                mes: 'all',
                corretor_id: isAdmin ? null : (uauId || null), // null = retorna todos (só admin sem uau_id configurado)
                empresa: empresa,
                obra: obra
            };

            const result = await fetchCorretoresData(filters);
            const brokersList = result.dados || [];
            setData(brokersList);
            setLastUpdate(result.atualizado_em || null);
            setIsCacheData(result.is_cache || false);
            setShowSyncBanner(true); // Show banner on new data load

            // Populate available months dynamically based on the data
            const monthsSet = new Set();
            brokersList.forEach(b => {
                b.vendas_detalhadas?.forEach(v => {
                    if (v.data_venda && v.data_venda.length >= 7) {
                        monthsSet.add(v.data_venda.substring(0, 7)); // 'YYYY-MM'
                    }
                });
            });
            const sortedMonths = Array.from(monthsSet).sort().reverse();
            setAvailableMonths(sortedMonths);

        } catch (error) {
            console.error("Error loading brokers page:", error);
        } finally {
            setLoading(false);
        }
    }, [currentUser?.id, isAdmin, currentUser?.permissions, selectedObraId, obrasList.length]);

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

    // Flatten all vendas across all brokers
    const processedData = useMemo(() => {
        let globalVgv = 0;
        let globalSales = 0;
        let globalPending = 0;
        
        let flatVendas = [];

        data.forEach(broker => {
            const vendas = broker.vendas_detalhadas || [];
            
            // As Pending/Atraso é uma carteira global, não filtramos ela por mês na visualização
            vendas.forEach(venda => {
                if (venda.sinal_negocio?.situacao === 'Em Atraso') {
                    globalPending += venda.sinal_negocio.valor_em_atraso || 0;
                }
            });

            vendas.forEach(v => {
                // Apply month filter
                if (selectedMonth !== 'all' && v.data_venda && !v.data_venda.startsWith(selectedMonth)) {
                    return;
                }
                
                // Apply 'ativos' vs 'cancelados' filter
                const isCancelado = v.status_venda === 'Cancelada' || v.status_codigo === 1;
                if (!showCancelados && isCancelado) {
                    return;
                }

                // Apply search term filter
                if (searchTerm) {
                    const lowerSearch = searchTerm.toLowerCase();
                    const matchClient = (v.cliente?.nome || v.client?.nome || '').toLowerCase().includes(lowerSearch);
                    const matchBroker = broker.corretor.toLowerCase().includes(lowerSearch);
                    const matchLote = `${v.quadra} ${v.lote}`.toLowerCase().includes(lowerSearch);
                    
                    if (!matchClient && !matchBroker && !matchLote) return;
                }

                // Calculate valid VGV
                if (v.status_codigo === 0 || v.status_codigo === 3 || v.status_venda === 'Normal' || v.status_venda === 'Quitada') {
                    globalVgv += v.valor_venda || 0;
                    globalSales += 1;
                }

                // Inject broker data into the sale for display purposes
                flatVendas.push({
                    ...v,
                    corretorNome: broker.corretor,
                    gerenteNome: broker.diretoria_equipe
                });
            });
        });

        // Set the stats for the UI
        setStats({ totalVgv: globalVgv, totalSales: globalSales, totalPending: globalPending });
        return flatVendas;

    }, [data, searchTerm, selectedMonth, showCancelados]);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr + "T12:00:00").toLocaleDateString('pt-BR');
        } catch { return dateStr; }
    };

    const toggleExpand = (id) => {
        setExpandedVendaId(expandedVendaId === id ? null : id);
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
                                <select 
                                    className="minimal-select"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                >
                                    <option value="all">Todo o Período</option>
                                    {availableMonths.map(m => {
                                        const [yyyy, mm] = m.split('-');
                                        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                        return <option key={m} value={m}>{monthNames[parseInt(mm)-1]} de {yyyy}</option>
                                    })}
                                </select>
                            </div>

                            <div className="header-divider"></div>

                            <div className="filter-group search-box">
                                <Search size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar cliente ou corretor..."
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

                {/* Toggle cancelados */}
                <div className="cancelados-toggle-bar animate-fade-in-up">
                    <label className="toggle-switch">
                        <input type="checkbox" checked={showCancelados} onChange={(e) => setShowCancelados(e.target.checked)} />
                        <span className="slider"></span>
                    </label>
                    <span>Exibir Cancelados e Distratados</span>
                    <span className="total-count">{processedData.length} contratos</span>
                </div>

                {/* Client Cards */}
                <section className="client-cards-section animate-fade-in-up">
                    {loading ? (
                        <div className="loading-container">
                            <Loader2 className="loading-spinner-large" size={48} />
                            <p>Carregando dados do servidor Valle...</p>
                        </div>
                    ) : processedData.length === 0 ? (
                        <div className="empty-state">
                            <Info size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <h3>Nenhum dado encontrado</h3>
                            <p>Não há registros para os filtros aplicados.</p>
                        </div>
                    ) : (
                        processedData.map(venda => {
                            const clientNome = venda.client?.nome || venda.cliente?.nome || 'Sem Nome';
                            const clientTelefone = venda.client?.telefone || venda.cliente?.telefone || '';
                            const clientCpf = venda.client?.cpf || venda.cliente?.cpf || '';
                            const clientEmail = venda.client?.email || venda.cliente?.email || '';
                            const isExpanded = expandedVendaId === venda.venda_id;
                            const isCancelado = venda.status_venda === 'Cancelada' || venda.status_codigo === 1;
                            const hasAtraso = venda.sinal_negocio?.situacao?.includes('Atraso');

                            return (
                                <div key={venda.venda_id} className={`client-card ${isCancelado ? 'cancelado' : ''} ${isExpanded ? 'expanded' : ''}`}>
                                    {/* Card Header - clickable to expand */}
                                    <div className="client-card-header" onClick={() => toggleExpand(venda.venda_id)}>
                                        <div className="client-card-left">
                                            <div className="client-avatar" style={{background: hasAtraso ? '#fef2f2' : '#f0fdf4', color: hasAtraso ? '#dc2626' : '#16a34a'}}>
                                                {clientNome.charAt(0)}
                                            </div>
                                            <div className="client-main-info">
                                                <h3 className="client-name">{clientNome}</h3>
                                                <div className="client-meta">
                                                    <span className="meta-unit">QD {venda.quadra} / LT {venda.lote}</span>
                                                    <span className="meta-divider">•</span>
                                                    <span className="meta-date">{formatDate(venda.data_venda)}</span>
                                                    <span className="meta-divider">•</span>
                                                    <span className="meta-broker">{venda.corretorNome}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="client-card-right">
                                            <div className="client-vgv">{formatCurrency(venda.valor_venda)}</div>
                                            <span className={`status-pill ${isCancelado ? 'cancelado' : hasAtraso ? 'atraso' : 'normal'}`}>
                                                {venda.status_venda}
                                            </span>
                                            <ChevronDown size={18} className={`expand-chevron ${isExpanded ? 'rotated' : ''}`} />
                                        </div>
                                    </div>

                                    {/* Expanded Detail Blocks */}
                                    {isExpanded && (
                                        <div className="client-card-body">
                                            <div className="three-blocks-grid">

                                                {/* Block 1: Dados do Cliente */}
                                                <div className="detail-block block-dados">
                                                    <div className="block-header">
                                                        <User size={16} />
                                                        <h4>Dados do Cliente</h4>
                                                    </div>
                                                    <div className="block-content">
                                                        <div className="data-row">
                                                            <span className="data-label">Nome</span>
                                                            <span className="data-value">{clientNome}</span>
                                                        </div>
                                                        <div className="data-row">
                                                            <span className="data-label">CPF</span>
                                                            <span className="data-value">{clientCpf || 'Não informado'}</span>
                                                        </div>
                                                        <div className="data-row">
                                                            <span className="data-label">Telefone</span>
                                                            <span className="data-value">
                                                                {clientTelefone.trim() ? (
                                                                    <a href={`https://wa.me/55${clientTelefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="whatsapp-link">
                                                                        <Phone size={12} /> {clientTelefone}
                                                                    </a>
                                                                ) : 'Não informado'}
                                                            </span>
                                                        </div>
                                                        <div className="data-row">
                                                            <span className="data-label">Email</span>
                                                            <span className="data-value">{clientEmail || 'Não informado'}</span>
                                                        </div>
                                                        <div className="data-row">
                                                            <span className="data-label">Contrato</span>
                                                            <span className="data-value">#{venda.venda_id}</span>
                                                        </div>
                                                        <div className="data-row">
                                                            <span className="data-label">Condição</span>
                                                            <span className="data-value">{venda.condicao_pagamento}</span>
                                                        </div>
                                                        <div className="data-row">
                                                            <span className="data-label">Corretor</span>
                                                            <span className="data-value">{venda.corretorNome}</span>
                                                        </div>
                                                        <div className="data-row">
                                                            <span className="data-label">Equipe</span>
                                                            <span className="data-value">{venda.gerenteNome}</span>
                                                        </div>
                                                        {venda.cessao && (
                                                            <div className="cessao-note">
                                                                <AlertCircle size={14} />
                                                                <span>Cessão/Transferência — Venda #{venda.cessao.vendaId}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Block 2: Parcelas em Aberto (A Pagar) */}
                                                <div className="detail-block block-apagar">
                                                    <div className="block-header apagar">
                                                        <AlertCircle size={16} />
                                                        <h4>A Pagar (Abertos)</h4>
                                                        {venda.raw_sinais_abertos?.lista && venda.raw_sinais_abertos.lista.length > 0 && (
                                                            <span className="block-total apagar">
                                                                {formatCurrency(venda.raw_sinais_abertos.lista.reduce((acc, p) => acc + (p.valor_aberto || 0), 0))}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="block-content">
                                                        {venda.raw_sinais_abertos?.lista && venda.raw_sinais_abertos.lista.length > 0 ? (
                                                            <div className="parcelas-table-wrapper">
                                                                <table className="parcelas-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Parcela</th>
                                                                            <th>Vencimento</th>
                                                                            <th>Valor</th>
                                                                            <th>Status</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {venda.raw_sinais_abertos.lista.map((parc, idx) => (
                                                                            <tr key={idx} className={parc.is_atrasado === 1 ? 'row-atrasado' : ''}>
                                                                                <td className="parcela-id">{parc.tipo} ({parc.parcela})</td>
                                                                                <td>{formatDate(parc.data_vencimento)}</td>
                                                                                <td className="parcela-valor">{formatCurrency(parc.valor_aberto)}</td>
                                                                                <td>
                                                                                    {parc.is_atrasado === 1 
                                                                                        ? <span className="badge-atrasado">Atrasado</span> 
                                                                                        : <span className="badge-avencer">A Vencer</span>
                                                                                    }
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <div className="no-data-msg">
                                                                <DollarSign size={20} style={{opacity: 0.2}} />
                                                                <p>Nenhuma parcela pendente</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Block 3: Parcelas Pagas */}
                                                <div className="detail-block block-pago">
                                                    <div className="block-header pago">
                                                        <DollarSign size={16} />
                                                        <h4>Pagos (Recebidos)</h4>
                                                        {venda.raw_sinais_pagos?.lista && venda.raw_sinais_pagos.lista.length > 0 && (
                                                            <span className="block-total pago">
                                                                {formatCurrency(venda.raw_sinais_pagos.lista.reduce((acc, p) => acc + (p.valor_pago || 0), 0))}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="block-content">
                                                        {venda.raw_sinais_pagos?.lista && venda.raw_sinais_pagos.lista.length > 0 ? (
                                                            <div className="parcelas-table-wrapper">
                                                                <table className="parcelas-table pago">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Parcela</th>
                                                                            <th>Vencimento</th>
                                                                            <th>Pagamento</th>
                                                                            <th>Valor</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {venda.raw_sinais_pagos.lista.map((parc, idx) => (
                                                                            <tr key={idx}>
                                                                                <td className="parcela-id">{parc.tipo} ({parc.parcela})</td>
                                                                                <td>{formatDate(parc.data_vencimento)}</td>
                                                                                <td className="data-pagamento">{formatDate(parc.data_pagamento)}</td>
                                                                                <td className="parcela-valor pago">{formatCurrency(parc.valor_pago)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <div className="no-data-msg">
                                                                <DollarSign size={20} style={{opacity: 0.2}} />
                                                                <p>Nenhuma parcela paga</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </section>
            </main>

            {/* Sync Banner - auto-dismiss + close button */}
            {lastUpdate && showSyncBanner && (
                <div className={`sync-banner ${isCacheData ? 'warning' : 'success'}`}>
                    <div className="sync-banner-content">
                        <span className="sync-icon">{isCacheData ? '⚠️' : '✅'}</span>
                        <div className="sync-text">
                            <strong>{isCacheData ? 'Sincronização Offline' : 'Dados Atualizados'}</strong>
                            <p>{isCacheData 
                                ? `Exibindo cache. Última atualização: ${new Date(lastUpdate).toLocaleString('pt-BR')}`
                                : `Servidor UAU sincronizado em ${new Date(lastUpdate).toLocaleString('pt-BR')}`
                            }</p>
                        </div>
                        <button className="sync-close-btn" onClick={() => setShowSyncBanner(false)}>
                            <X size={16} />
                        </button>
                    </div>
                    {!isCacheData && <div className="sync-progress-bar"></div>}
                </div>
            )}

            <Footer />
        </div>
    );
};

export default BrokersPage;
