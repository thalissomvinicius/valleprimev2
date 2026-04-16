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
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './BrokersPage.css';

const BrokersPage = () => {
    const { currentUser, isAdmin } = useAuth();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const [stats, setStats] = useState({ totalVgv: 0, totalSales: 0, totalPending: 0 });
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isCacheData, setIsCacheData] = useState(false);
    const [showSyncBanner, setShowSyncBanner] = useState(true);
    
    const currentYear = new Date().getFullYear().toString();
    const currentMonthNum = String(new Date().getMonth() + 1).padStart(2, '0');
    
    // Filters
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonthNum);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCancelados, setShowCancelados] = useState(false);
    const [parcelFilter, setParcelFilter] = useState('todos'); // 'todos' | 'atraso'
    const [selectedAdminBroker, setSelectedAdminBroker] = useState('all');
    
    // Obra/Period select options
    const [availableYears, setAvailableYears] = useState([currentYear]);
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
                ano: selectedYear,
                mes: selectedMonth,
                corretor_id: isAdmin ? null : (uauId || null), // null = retorna todos (só admin sem uau_id configurado)
                empresa: empresa,
                obra: obra
            };

            const result = await fetchCorretoresData(filters);
            let brokersList = result.data || result.dados || [];

            // A nova API Ngrok retorna a árvore completa em tempo real.
            // Para garantir segurança, filtramos os dados pelo `corretor_id` se o usuário NÃO for admin.
            if (!isAdmin && filters.corretor_id) {
                brokersList = brokersList.filter(b => String(b.codigo_corretor) === String(filters.corretor_id));
            }

            setData(brokersList);
            setLastUpdate(result.atualizado_em || new Date().toISOString());
            setIsCacheData(false); // Sempre falso, pois os dados da Nova API são em Tempo Real
            setShowSyncBanner(true); // Show banner on new data load

            // Populate available years dynamically based on the data, without losing existing ones
            const yearsSet = new Set(availableYears);
            brokersList.forEach(b => {
                b.vendas_detalhadas?.forEach(v => {
                    if (v.data_venda && v.data_venda.length >= 4) {
                        yearsSet.add(v.data_venda.substring(0, 4));
                    }
                });
            });
            const sortedYears = Array.from(yearsSet).sort().reverse();
            if(!sortedYears.includes(currentYear)) sortedYears.unshift(currentYear);
            setAvailableYears(sortedYears);

        } catch (error) {
            console.error("Error loading brokers page:", error);
        } finally {
            setLoading(false);
        }
    }, [currentUser?.id, isAdmin, currentUser?.permissions, selectedObraId, obrasList.length, selectedYear, selectedMonth, availableYears, currentYear]);

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
    }, [loadData, selectedObraId, selectedYear, selectedMonth]);

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
                // Apply year/month filter
                if (selectedYear !== 'all') {
                    if (!v.data_venda || !v.data_venda.startsWith(selectedYear)) return;
                }
                
                if (selectedMonth !== 'all') {
                    if (!v.data_venda || v.data_venda.substring(5, 7) !== selectedMonth) return;
                }
                
                // Apply 'ativos' vs 'cancelados' filter
                const isCancelado = v.status_venda === 'Cancelada' || v.status_codigo === 1;
                if (!showCancelados && isCancelado) {
                    return;
                }

                // Apply Admin Broker filter
                if (isAdmin && selectedAdminBroker !== 'all' && broker.corretor !== selectedAdminBroker) {
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

    }, [data, searchTerm, selectedMonth, selectedYear, showCancelados, isAdmin, selectedAdminBroker]);

    // Extrai a lista única de corretores para o filtro do Admin
    const uniqueBrokers = useMemo(() => {
        const brokersSet = new Set(data.map(b => b.corretor));
        return Array.from(brokersSet).sort();
    }, [data]);

    // Processamento de Rankings de Admin (Top 5+ ranking boards)
    const adminRankings = useMemo(() => {
        if (!isAdmin) return null;
        
        const perfMap = {};
        processedData.forEach(v => {
            const cNome = v.corretorNome;
            if (!perfMap[cNome]) perfMap[cNome] = { corretor: cNome, vgv: 0, recebido: 0, qtd_vendas: 0 };
            
            // Soma VGV Válido
            if (v.status_codigo === 0 || v.status_codigo === 3 || v.status_venda === 'Normal' || v.status_venda === 'Quitada') {
                perfMap[cNome].vgv += v.valor_venda || 0;
                perfMap[cNome].qtd_vendas += 1;
            }
            // Soma Recebidos
            if (v.raw_sinais_pagos?.lista) {
                const pago = v.raw_sinais_pagos.lista.reduce((acc, p) => acc + (p.valor_pago || 0), 0);
                perfMap[cNome].recebido += pago;
            }
        });

        const brokersPerf = Object.values(perfMap);
        const top5Vgv = [...brokersPerf].sort((a, b) => b.vgv - a.vgv).slice(0, 5);
        const top5Recebido = [...brokersPerf].sort((a, b) => b.recebido - a.recebido).slice(0, 5);

        return { top5Vgv, top5Recebido };
    }, [processedData, isAdmin]);

    // Função de Geração de Relatório de Cobrança PDF
    const generateCollectionReport = () => {
        const doc = new jsPDF();
        
        const titleY = 15;
        doc.setFontSize(16);
        doc.text("Relatório de Cobrança - Clientes em Atraso", 14, titleY);
        doc.setFontSize(10);
        doc.text(`Data Base: ${new Date().toLocaleDateString('pt-BR')}`, 14, titleY + 6);
        
        const tableData = [];
        
        processedData.forEach(v => {
            if (!v.raw_sinais_abertos?.lista) return;
            
            // Applies global filter if user wants all delays OR if the report naturally implies ALL delays on the filtered data
            const delayedParcels = v.raw_sinais_abertos.lista.filter(p => p.is_atrasado === 1);
            if (delayedParcels.length > 0) {
                const totalAtrasado = delayedParcels.reduce((acc, p) => acc + (p.valor_aberto || 0), 0);
                const vencimentoMaisAntigo = delayedParcels[0]?.data_vencimento ? formatDate(delayedParcels[0].data_vencimento) : '-';
                
                tableData.push([
                    v.cliente?.nome || v.client?.nome || 'Sem Nome',
                    v.cliente?.telefone || 'Não Informado',
                    `${v.venda_id} - ${v.quadra}/${v.lote}`,
                    vencimentoMaisAntigo,
                    delayedParcels.length.toString(),
                    formatCurrency(totalAtrasado)
                ]);
            }
        });

        if (tableData.length === 0) {
            alert('Não há clientes em atraso nos filtros atuais.');
            return;
        }

        doc.autoTable({
            startY: titleY + 12,
            head: [['Cliente', 'Telefone', 'Contrato Q/L', 'Venc. Antigo', 'Qtd Parc', 'Total Atrasado']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 8 }
        });

        doc.save(`Relatorio_Cobranca_${new Date().toISOString().slice(0,10)}.pdf`);
    };

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
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                >
                                    <option value="all">Todos os Anos</option>
                                    {availableYears.map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                                
                                <select 
                                    className="minimal-select"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                >
                                    <option value="all">Todos os Meses</option>
                                    {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, i) => {
                                        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                        return <option key={m} value={m}>{monthNames[i]}</option>
                                    })}
                                </select>
                            </div>

                            {isAdmin && (
                                <>
                                    <div className="header-divider"></div>
                                    <div className="filter-group">
                                        <Briefcase size={16} />
                                        <select 
                                            className="minimal-select"
                                            value={selectedAdminBroker}
                                            onChange={(e) => setSelectedAdminBroker(e.target.value)}
                                        >
                                            <option value="all">Todos Corretores</option>
                                            {uniqueBrokers.map(b => (
                                                <option key={b} value={b}>{b}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}

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

                {/* Admin Rankings (Se aplicável) */}
                {adminRankings && (
                    <section className="admin-rankings-section animate-fade-in-up">
                        <div className="ranking-panel">
                            <h3><TrendingUp size={16}/> Top 5 VGV (Vendas Totais)</h3>
                            <div className="ranking-list">
                                {adminRankings.top5Vgv.map((b, i) => (
                                    <div key={b.corretor} className="ranking-item">
                                        <div className="rank-position">{i + 1}º</div>
                                        <div className="rank-info">
                                            <span className="rank-name">{b.corretor}</span>
                                            <span className="rank-sales">{b.qtd_vendas} vendas</span>
                                        </div>
                                        <div className="rank-value">{formatCurrency(b.vgv)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="ranking-panel">
                            <h3><DollarSign size={16}/> Top 5 Recebimentos (Sinais / Pagos)</h3>
                            <div className="ranking-list">
                                {adminRankings.top5Recebido.map((b, i) => (
                                    <div key={b.corretor} className="ranking-item">
                                        <div className="rank-position">{i + 1}º</div>
                                        <div className="rank-info">
                                            <span className="rank-name">{b.corretor}</span>
                                        </div>
                                        <div className="rank-value success">{formatCurrency(b.recebido)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {/* Toolbar Inferior */}
                <div className="action-toolbar animate-fade-in-up">
                    <div className="cancelados-toggle-bar">
                        <label className="toggle-switch">
                            <input type="checkbox" checked={showCancelados} onChange={(e) => setShowCancelados(e.target.checked)} />
                            <span className="slider"></span>
                        </label>
                        <span>Exibir Cancelados e Distratados</span>
                        <span className="meta-divider">•</span>
                        
                        <div className="parcel-filter-select">
                            <Filter size={14}/>
                            <select value={parcelFilter} onChange={e => setParcelFilter(e.target.value)} className="minimal-select">
                                <option value="todos">Status das Parcelas: Todas</option>
                                <option value="atraso">Status das Parcelas: Em Atraso</option>
                            </select>
                        </div>
                    </div>

                    <div className="toolbar-actions">
                        <span className="total-count">{processedData.length} contratos localizados</span>
                        <button className="btn-cobranca" onClick={generateCollectionReport}>
                            <AlertCircle size={16} /> Relatório de Cobrança (PDF)
                        </button>
                    </div>
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

                            // Filters parcerls
                            const abertosSafe = venda.raw_sinais_abertos?.lista || [];
                            const filteredAbertos = parcelFilter === 'atraso' ? abertosSafe.filter(p => p.is_atrasado === 1) : abertosSafe;

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
                                                        {filteredAbertos.length > 0 && (
                                                            <span className="block-total apagar">
                                                                {formatCurrency(filteredAbertos.reduce((acc, p) => acc + (p.valor_aberto || 0), 0))}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="block-content">
                                                        {filteredAbertos.length > 0 ? (
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
                                                                        {filteredAbertos.map((parc, idx) => (
                                                                            <tr key={idx} className={parc.is_atrasado === 1 ? 'row-atrasado' : ''}>
                                                                                <td className="parcela-id" data-label="Parcela">{parc.tipo} ({parc.parcela})</td>
                                                                                <td data-label="Vencimento">{formatDate(parc.data_vencimento)}</td>
                                                                                <td className="parcela-valor" data-label="Valor">{formatCurrency(parc.valor_aberto)}</td>
                                                                                <td data-label="Status">
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
                                                                <p>{parcelFilter === 'atraso' ? 'Nenhuma parcela em atraso' : 'Nenhuma parcela pendente'}</p>
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
                                                                                <td className="parcela-id" data-label="Parcela">{parc.tipo} ({parc.parcela})</td>
                                                                                <td data-label="Vencimento">{formatDate(parc.data_vencimento)}</td>
                                                                                <td className="data-pagamento" data-label="Pagamento">{formatDate(parc.data_pagamento)}</td>
                                                                                <td className="parcela-valor pago" data-label="Valor">{formatCurrency(parc.valor_pago)}</td>
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
