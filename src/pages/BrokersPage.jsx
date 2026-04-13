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
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isCacheData, setIsCacheData] = useState(false);
    
    // Filters
    const [selectedMonth, setSelectedMonth] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showCancelados, setShowCancelados] = useState(false);
    
    // Obra/Period select options
    const [availableMonths, setAvailableMonths] = useState([]);
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

    const processedData = useMemo(() => {
        let globalVgv = 0;
        let globalSales = 0;
        let globalPending = 0;
        
        let flatVendas = [];

        data.forEach(broker => {
            const vendas = broker.vendas_detalhadas || [];
            
            // As Pending/Atraso é uma carteira global, não filtramos ela por mês na visualizção
            // Somamos apenas para exibir no painel "Geral", usando o array original completo
            vendas.forEach(venda => {
                if (venda.sinal_negocio?.situacao === 'Em Atraso') {
                    globalPending += venda.sinal_negocio.valor_em_atraso || 0;
                }
            });

            vendas.forEach(v => {
                // Apply month filter
                if (selectedMonth !== 'all' && v.data_venda && !v.data_venda.startsWith(selectedMonth)) {
                    return; // Skip this sale because it's not in the selected month
                }
                
                // Apply 'ativos' vs 'cancelados' filter
                const isCancelado = v.status_venda === 'Cancelada' || v.status_codigo === 1;
                if (!showCancelados && isCancelado) {
                    return; // Hide cancelled if toggle is false
                }

                // Apply search term filter (Search across client, broker, or lote)
                if (searchTerm) {
                    const lowerSearch = searchTerm.toLowerCase();
                    const matchClient = (v.cliente?.nome || v.client?.nome || '').toLowerCase().includes(lowerSearch);
                    const matchBroker = broker.corretor.toLowerCase().includes(lowerSearch);
                    const matchLote = `${v.quadra} ${v.lote}`.toLowerCase().includes(lowerSearch);
                    
                    if (!matchClient && !matchBroker && !matchLote) return; // Skip if no match
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

                <section className="brokers-list-section animate-fade-in-up" style={{padding: '0'}}>
                    <div className="filter-cancelados-bar" style={{padding: '1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fafbfc', borderTopLeftRadius: '12px', borderTopRightRadius: '12px'}}>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={showCancelados} onChange={(e) => setShowCancelados(e.target.checked)} />
                            <span className="slider"></span>
                        </label>
                        <span style={{fontSize: '0.85rem', fontWeight: '600', color: '#475569'}}>Exibir Cancelados e Distratados</span>
                    </div>

                    {loading ? (
                        <div className="loading-container" style={{padding: '3rem'}}>
                            <Loader2 className="loading-spinner-large" size={48} />
                            <p>Carregando dados do servidor Valle...</p>
                        </div>
                    ) : processedData.length === 0 ? (
                        <div className="empty-state" style={{padding: '3rem'}}>
                            <Info size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <h3>Nenhum dado encontrado</h3>
                            <p>Não há registros para os filtros aplicados.</p>
                        </div>
                    ) : (
                        <div className="sales-table-container">
                            <table className="sales-table" style={{width: '100%'}}>
                                <thead>
                                    <tr>
                                        <th>Unidade</th>
                                        <th>Cliente</th>
                                        <th>VGV</th>
                                        <th>Plano</th>
                                        <th>Situação do Sinal</th>
                                        <th>Status</th>
                                        <th>Data</th>
                                        <th>Corretor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {processedData.map(venda => (
                                        <React.Fragment key={venda.venda_id}>
                                            <tr>
                                                <td className="col-unit">
                                                    <small>QD {venda.quadra}</small><br/>
                                                    <strong>LT {venda.lote}</strong>
                                                </td>
                                                <td className="col-client">
                                                    <div className="client-data-card" style={{padding: 0, border: 'none', background: 'transparent'}}>
                                                        <div className="client-header">
                                                            <User size={14} className="icon-user" />
                                                            <span className="client-nome" style={{fontSize: '0.8rem', fontWeight: 600}} title={venda.client?.nome || venda.cliente?.nome}>
                                                                {venda.client?.nome || venda.cliente?.nome}
                                                            </span>
                                                        </div>
                                                        <div className="client-actions-row" style={{marginTop: '4px'}}>
                                                            { (venda.client?.telefone || venda.cliente?.telefone) && (venda.client?.telefone || venda.cliente?.telefone).trim() !== '' ? (
                                                                <a href={`https://wa.me/55${(venda.client?.telefone || venda.cliente?.telefone || '').replace(/\D/g, '')}`} 
                                                                   target="_blank" 
                                                                   rel="noreferrer" 
                                                                   className="contact-pill wpp-active">
                                                                    <Phone size={10} />
                                                                    {(venda.client?.telefone || venda.cliente?.telefone)}
                                                                </a>
                                                            ) : (
                                                                <span className="contact-pill wpp-inactive">
                                                                    <Phone size={10} /> Sem Tel
                                                                </span>
                                                            )}
                                                            <div className="info-trigger-pill" style={{cursor: 'default'}}>
                                                                <Info size={11} /> #{venda.venda_id}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="col-vgv">
                                                    {formatCurrency(venda.valor_venda)}
                                                </td>
                                                <td style={{fontSize: '0.8rem', color: '#64748b'}}>
                                                    <div>{venda.condicao_pagamento}</div>
                                                    {venda.status_venda === 'Cessão' && venda.cessao && (
                                                        <div className="status-badge cessao" style={{marginTop: '4px', fontSize: '0.7rem', display: 'inline-block'}}>
                                                            Cessão: {venda.cessao.vendaId}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="col-signal">
                                                    <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                                        <div className="signal-text" style={{fontSize: '0.75rem', fontWeight: 'bold', color: venda.sinal_negocio?.situacao.includes('Atraso') ? '#ef4444' : '#10b981'}}>
                                                            {venda.sinal_negocio?.situacao}
                                                        </div>
                                                        <button 
                                                            className="btn-details-finance" 
                                                            onClick={() => toggleBroker(venda.venda_id)}
                                                            style={{
                                                                padding: '4px 8px', fontSize: '0.7rem', borderRadius: '4px', 
                                                                border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', textAlign: 'center'
                                                            }}
                                                        >
                                                            Detalhes Financeiros {openBrokerId === venda.venda_id ? '▲' : '▼'}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`status-badge ${venda.status_venda.toLowerCase().replace('ã','a')}`} style={{padding: '4px 8px', fontSize: '0.7rem'}}>
                                                        {venda.status_venda}
                                                    </span>
                                                    {venda.progresso_financiamento?.parcelas_em_atraso > 0 && (
                                                        <div style={{color: '#be123c', fontSize: '0.65rem', fontWeight: '800', marginTop: '4px'}}>
                                                            {venda.progresso_financiamento.parcelas_em_atraso} parc. atraso
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{fontSize: '0.85rem', color: '#64748b'}}>
                                                    {new Date(venda.data_venda + "T12:00:00").toLocaleDateString('pt-BR')}
                                                </td>
                                                <td>
                                                    <div style={{fontSize: '0.75rem', fontWeight: 'bold'}}>{venda.corretorNome}</div>
                                                    <div style={{fontSize: '0.65rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px'}} title={venda.gerenteNome}>{venda.gerenteNome}</div>
                                                </td>
                                            </tr>
                                            {openBrokerId === venda.venda_id && (
                                                <tr className="finance-details-row" style={{background: '#f8fafc'}}>
                                                    <td colSpan="8" style={{padding: '1.5rem', borderBottom: '2px solid #e2e8f0'}}>
                                                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem'}}>
                                                            
                                                            {/* Bloco A Pagar */}
                                                            <div className="finance-block-apagar" style={{background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #fca5a5', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'}}>
                                                                <h4 style={{margin: '0 0 1rem 0', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                                                    <AlertCircle size={16} /> A Pagar (Abertos)
                                                                </h4>
                                                                {venda.raw_sinais_abertos?.lista && venda.raw_sinais_abertos.lista.length > 0 ? (
                                                                    <table style={{width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse'}}>
                                                                        <thead>
                                                                            <tr style={{borderBottom: '1px solid #e2e8f0', textAlign: 'left'}}>
                                                                                <th style={{padding: '4px'}}>Tipo</th>
                                                                                <th style={{padding: '4px'}}>Status</th>
                                                                                <th style={{padding: '4px'}}>Vencimento</th>
                                                                                <th style={{padding: '4px', textAlign: 'right'}}>Valor</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {venda.raw_sinais_abertos.lista.map((parc, idx) => (
                                                                                <tr key={idx} style={{borderBottom: '1px solid #f1f5f9'}}>
                                                                                    <td style={{padding: '6px 4px'}}>{parc.tipo} ({parc.parcela})</td>
                                                                                    <td style={{padding: '6px 4px'}}>
                                                                                        {parc.is_atrasado === 1 ? <span style={{color: '#dc2626', fontWeight: 'bold'}}>Em Atraso</span> : <span style={{color: '#64748b'}}>A Vencer</span>}
                                                                                    </td>
                                                                                    <td style={{padding: '6px 4px'}}>{new Date(parc.data_vencimento + "T12:00:00").toLocaleDateString('pt-BR')}</td>
                                                                                    <td style={{padding: '6px 4px', textAlign: 'right', fontWeight: 'bold'}}>{formatCurrency(parc.valor_aberto)}</td>
                                                                                </tr>
                                                                            ))}
                                                                            <tr style={{background: '#fef2f2', fontWeight: 'bold'}}>
                                                                                <td colSpan="3" style={{padding: '8px 4px'}}>Total em Aberto:</td>
                                                                                <td style={{padding: '8px 4px', textAlign: 'right', color: '#dc2626'}}>{formatCurrency(venda.sinal_negocio?.valor_a_pagar)}</td>
                                                                            </tr>
                                                                        </tbody>
                                                                    </table>
                                                                ) : (
                                                                    <p style={{fontSize: '0.8rem', color: '#64748b'}}>Nenhuma parcela pendente.</p>
                                                                )}
                                                            </div>
                                                            
                                                            {/* Bloco Pago */}
                                                            <div className="finance-block-pago" style={{background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #86efac', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'}}>
                                                                <h4 style={{margin: '0 0 1rem 0', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                                                    <DollarSign size={16} /> Pagos (Recebidos)
                                                                </h4>
                                                                {venda.raw_sinais_pagos?.lista && venda.raw_sinais_pagos.lista.length > 0 ? (
                                                                    <div style={{maxHeight: '300px', overflowY: 'auto'}}>
                                                                        <table style={{width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse'}}>
                                                                            <thead style={{position: 'sticky', top: 0, background: 'white', zIndex: 1}}>
                                                                                <tr style={{borderBottom: '1px solid #e2e8f0', textAlign: 'left'}}>
                                                                                    <th style={{padding: '4px'}}>Tipo</th>
                                                                                    <th style={{padding: '4px'}}>Vencimento</th>
                                                                                    <th style={{padding: '4px'}}>Pagamento</th>
                                                                                    <th style={{padding: '4px', textAlign: 'right'}}>Valor</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {venda.raw_sinais_pagos.lista.map((parc, idx) => (
                                                                                    <tr key={idx} style={{borderBottom: '1px solid #f1f5f9'}}>
                                                                                        <td style={{padding: '6px 4px'}}>{parc.tipo} ({parc.parcela})</td>
                                                                                        <td style={{padding: '6px 4px'}}>{parc.data_vencimento ? new Date(parc.data_vencimento + "T12:00:00").toLocaleDateString('pt-BR') : '-'}</td>
                                                                                        <td style={{padding: '6px 4px', color: '#16a34a'}}>{parc.data_pagamento ? new Date(parc.data_pagamento + "T12:00:00").toLocaleDateString('pt-BR') : '-'}</td>
                                                                                        <td style={{padding: '6px 4px', textAlign: 'right', fontWeight: 'bold'}}>{formatCurrency(parc.valor_pago)}</td>
                                                                                    </tr>
                                                                                ))}
                                                                                <tr style={{background: '#f0fdf4', fontWeight: 'bold'}}>
                                                                                    <td colSpan="3" style={{padding: '8px 4px'}}>Total Recebido:</td>
                                                                                    <td style={{padding: '8px 4px', textAlign: 'right', color: '#16a34a'}}>{formatCurrency(venda.sinal_negocio?.valor_ja_pago)}</td>
                                                                                </tr>
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                ) : (
                                                                    <p style={{fontSize: '0.8rem', color: '#64748b'}}>Nenhuma parcela paga.</p>
                                                                )}
                                                            </div>
                                                            
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>

            {lastUpdate && (
                <div className={`cache-footer ${isCacheData ? 'is-cache' : 'is-live'}`}>
                    <div className="cache-footer-content">
                        {isCacheData ? (
                            <>
                                <span className="cache-icon warning">⚠️</span>
                                <div>
                                    <strong>Servidor de Sincronização Desconectado</strong>
                                    <p>Exibindo dados em cache offline. Última atualização: {new Date(lastUpdate).toLocaleString('pt-BR')}</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <span className="cache-icon success">✅</span>
                                <div>
                                    <strong>Sincronização em Tempo Real Ativa</strong>
                                    <p>Dados consultados diretamente do servidor UAU integrados em {new Date(lastUpdate).toLocaleString('pt-BR')}</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
};

export default BrokersPage;
