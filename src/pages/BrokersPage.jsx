import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
    X,
    FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchCorretoresData, fetchConfigObras } from '../services/api';
import Header from '../components/Header';
import Footer from '../components/Footer';
import valleLogo from '../assets/Valle-logo-azul.png';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './BrokersPage.css';

const BrokersPage = () => {
    const { currentUser, isAdmin } = useAuth();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const [stats, setStats] = useState({ totalVgv: 0, totalSales: 0, totalPending: 0 });
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isCacheData, setIsCacheData] = useState(false);
    const [showSyncBanner, setShowSyncBanner] = useState(true);
    
    // Helper: primeiro e último dia do mês atual
    const today = new Date();
    const firstDayOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const lastDayStr = `${lastDayOfMonth.getFullYear()}-${String(lastDayOfMonth.getMonth() + 1).padStart(2, '0')}-${String(lastDayOfMonth.getDate()).padStart(2, '0')}`;
    
    // Filters
    const [dataInicio, setDataInicio] = useState(firstDayOfMonth);
    const [dataFim, setDataFim] = useState(lastDayStr);
    const [inputInicio, setInputInicio] = useState(firstDayOfMonth);
    const [inputFim, setInputFim] = useState(lastDayStr);
    const [searchTrigger, setSearchTrigger] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const [showCancelados, setShowCancelados] = useState(false);
    const [parcelFilter, setParcelFilter] = useState('todos'); // 'todos' | 'atraso'
    const [showFiltrosMob, setShowFiltrosMob] = useState(true);
    const [selectedAdminBroker, setSelectedAdminBroker] = useState('all');
    const [obrasList, setObrasList] = useState([]);
    const [selectedObraId, setSelectedObraId] = useState(''); // "empresa-obra"

    // Expanded client card
    const [expandedVendaId, setExpandedVendaId] = useState(null);

    // Progress bar state
    const [loadProgress, setLoadProgress] = useState(0);
    const progressIntervalRef = useRef(null);

    // Simulated progress bar logic
    const startProgress = useCallback(() => {
        setLoadProgress(0);
        let progress = 0;
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = setInterval(() => {
            progress += Math.random() * (progress < 50 ? 8 : progress < 80 ? 3 : 0.5);
            if (progress >= 92) progress = 92; // Never complete alone - waits for real data
            setLoadProgress(Math.min(Math.round(progress), 92));
        }, 300);
    }, []);

    const completeProgress = useCallback(() => {
        clearInterval(progressIntervalRef.current);
        setLoadProgress(100);
        setTimeout(() => setLoadProgress(0), 600); // Reset after fade-out
    }, []);

    useEffect(() => {
        return () => clearInterval(progressIntervalRef.current); // Cleanup on unmount
    }, []);

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
        startProgress();
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
                data_inicio: dataInicio,
                data_fim: dataFim,
                corretor_id: isAdmin ? null : (uauId || null),
                empresa: empresa,
                obra: obra
            };

            const result = await fetchCorretoresData(filters);
            let brokersList = result.data || result.dados || [];

            // Para garantir segurança, filtramos os dados pelo `corretor_id` se o usuário NÃO for admin.
            if (!isAdmin && filters.corretor_id) {
                brokersList = brokersList.filter(b => String(b.codigo_corretor) === String(filters.corretor_id));
            }

            setData(brokersList);
            setLastUpdate(result.atualizado_em || new Date().toISOString());
            setIsCacheData(false);
            setShowSyncBanner(true);

        } catch (error) {
            console.error("Error loading brokers page:", error);
        } finally {
            completeProgress();
            setLoading(false);
        }
    }, [currentUser?.id, isAdmin, currentUser?.permissions, selectedObraId, obrasList.length, dataInicio, dataFim]);

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
    }, [loadData, selectedObraId, searchTrigger]);

    // Flatten all vendas across all brokers
    const processedData = useMemo(() => {
        let globalVgv = 0;
        let globalSales = 0;
        let globalPending = 0;
        let globalSinaisPagos = 0;
        let globalSinaisAbertos = 0;
        
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
                
                // Apply 'ativos' vs 'cancelados' filter
                const isCancelado = v.status_venda === 'Cancelada' || v.status_codigo === 1;
                if (!showCancelados && isCancelado) {
                    return;
                }

                // Apply 'parcelFilter' (todos vs atraso)
                if (parcelFilter === 'atraso') {
                    if (v.sinal_negocio?.situacao !== 'Em Atraso') {
                        return;
                    }
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

                // Calculate new Comprehensive Financial metrics
                if (!isCancelado) {
                    const sumPagos = v.raw_sinais_pagos?.lista?.reduce((acc, p) => acc + (p.valor_pago || 0), 0) || 0;
                    const sumAbertos = v.raw_sinais_abertos?.lista?.reduce((acc, p) => acc + (p.valor_aberto || 0), 0) || 0;
                    globalSinaisPagos += sumPagos;
                    globalSinaisAbertos += sumAbertos;
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
        setStats({ 
            totalVgv: globalVgv, 
            totalSales: globalSales, 
            totalPending: globalPending,
            sinaisPagos: globalSinaisPagos,
            sinaisAbertos: globalSinaisAbertos
        });
        return flatVendas;

    }, [data, searchTerm, showCancelados, parcelFilter, isAdmin, selectedAdminBroker]);

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
        const top5Vgv = [...brokersPerf].sort((a, b) => {
            if (b.qtd_vendas !== a.qtd_vendas) return b.qtd_vendas - a.qtd_vendas; // Quantidade de vendas primeiro
            return b.vgv - a.vgv; // VGV em caso de empate
        }).slice(0, 5);
        const top5Recebido = [...brokersPerf].sort((a, b) => b.recebido - a.recebido).slice(0, 5);

        return { top5Vgv, top5Recebido };
    }, [processedData, isAdmin]);

    // Componente comum de Header/Footer para os PDFs
    const drawPdfHeaderFooter = (doc, data, title) => {
        // Header
        doc.setFillColor(15, 23, 42); // Cor Valle (Azul Marinho)
        doc.rect(0, 0, doc.internal.pageSize.width, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("SISTEMA VALLE | PERFORMANCE DE VENDAS", data.settings.margin.left, 10);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(title, data.settings.margin.left, 16);
        doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, doc.internal.pageSize.width - data.settings.margin.right, 16, { align: 'right' });

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text("Desenvolvido por Vinicius Dev", data.settings.margin.left, doc.internal.pageSize.height - 10);
        doc.text("Página " + doc.internal.getNumberOfPages(), doc.internal.pageSize.width - data.settings.margin.right, doc.internal.pageSize.height - 10, { align: 'right' });
    };

    // -------- Utilitários PDF Compartilhados --------
    const primaryBlue = [15, 23, 42];  
    const softGreen = [34, 197, 94]; 

    const drawPdfHeaderFooterEnhanced = (doc, data, docTitle, subtitle) => {
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, doc.internal.pageSize.width, 30, 'F');
        doc.setFillColor(...softGreen);
        doc.rect(0, 30, doc.internal.pageSize.width, 2, 'F');
        
        doc.setTextColor(...primaryBlue);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("SISTEMA VALLE | " + docTitle, data.settings.margin.left, 14);
        
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(subtitle, data.settings.margin.left, 22);
        
        doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, doc.internal.pageSize.width - data.settings.margin.right, 28, { align: 'right' });

        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text("SISTEMA VALLE PRIME - Desenvolvido por Vinicius Dev", data.settings.margin.left, doc.internal.pageSize.height - 10);
        doc.text("Página " + doc.internal.getNumberOfPages(), doc.internal.pageSize.width - data.settings.margin.right, doc.internal.pageSize.height - 10, { align: 'right' });
    };

    const runPdfWithLogo = (callback) => {
        const img = new Image();
        img.src = valleLogo;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            callback(canvas.toDataURL("image/png"));
        };
        img.onerror = () => callback(null);
    };

    const drawLogoEnhancement = (doc, data, base64Logo) => {
         if (base64Logo) {
             try {
                const logoWidth = 35;
                const logoHeight = 15;
                const marginRight = data.settings.margin.right || 14;
                doc.addImage(base64Logo, 'PNG', doc.internal.pageSize.width - marginRight - logoWidth, 6, logoWidth, logoHeight);
             } catch(e) {}
         }
    };
    // --------------------------------------------------

    // Função de Geração de Relatório de Cobrança PDF (Inadimplência)
    const generateCollectionReport = () => {
        const tableData = [];
        let globalTotalAtrasado = 0;
        let globalTotalContratos = 0;
        
        processedData.forEach(v => {
            if (!v.raw_sinais_abertos?.lista) return;
            
            const delayedParcels = v.raw_sinais_abertos.lista.filter(p => p.is_atrasado === 1);
            if (delayedParcels.length > 0) {
                const totalAtrasado = delayedParcels.reduce((acc, p) => acc + (p.valor_aberto || 0), 0);
                const vencimentoMaisAntigo = delayedParcels[0]?.data_vencimento ? formatDate(delayedParcels[0].data_vencimento) : '-';
                
                globalTotalAtrasado += totalAtrasado;
                globalTotalContratos++;

                tableData.push([
                    v.cliente?.nome || v.client?.nome || 'Sem Nome',
                    v.cliente?.telefone || 'Não Informado',
                    `${v.venda_id} - Q${v.quadra}/L${v.lote}`,
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

        tableData.push([
            'TOTAIS',
            '-',
            '-',
            '-',
            '-',
            formatCurrency(globalTotalAtrasado)
        ]);

        runPdfWithLogo((base64Logo) => {
            const doc = new jsPDF('landscape'); // Mesmo layout em paisagem para manter padronização

            autoTable(doc, {
                startY: 40,
                head: [['Cliente', 'Telefone', 'Contrato Q/L', 'Venc. Mais Antigo', 'Qtd. Parc. Atrasadas', 'Total Atrasado']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' }, // Vermelho para alerta
                columnStyles: {
                    0: { cellWidth: 70 },
                    1: { cellWidth: 40 },
                    2: { cellWidth: 40 },
                    4: { halign: 'center' },
                    5: { halign: 'right', textColor: [185, 28, 28], fontStyle: 'bold' } // Vermelho bold
                },
                willDrawCell: function(data) {
                    if (data.row.index === tableData.length - 1) {
                        doc.setFillColor(241, 245, 249); 
                        doc.setFont("helvetica", "bold");
                        data.cell.styles.fontStyle = 'bold';
                        if (data.column.index === 5) {
                           doc.setTextColor(185, 28, 28);
                        } else {
                           doc.setTextColor(0,0,0);
                        }
                    }
                },
                styles: { fontSize: 9, cellPadding: 4, valign: 'middle' },
                alternateRowStyles: { fillColor: [254, 242, 242] }, // Vermelho ultra claro
                didDrawPage: (data) => {
                    drawPdfHeaderFooterEnhanced(doc, data, "RELATÓRIO DE INADIMPLÊNCIA", `Total de ${globalTotalContratos} contratos com atraso nos filtros atuais`);
                    drawLogoEnhancement(doc, data, base64Logo);
                }
            });

            doc.save(`Valle_Inadimplentes_${new Date().toISOString().slice(0,10)}.pdf`);
        });
    };

    // Função de Geração de Relatório de Vendas PDF (Extrato / Recebíveis)
    const generateSalesReport = () => {
        const tableData = [];
        let globalVgvTotal = 0;
        let globalSinalTotal = 0;
        let globalSinalPago = 0;
        let globalSinalAberto = 0;
        
        processedData.forEach(v => {
            const sumPago = v.raw_sinais_pagos?.lista?.reduce((acc, p) => acc + (p.valor_pago || 0), 0) || 0;
            const sumAberto = v.raw_sinais_abertos?.lista?.reduce((acc, p) => acc + (p.valor_aberto || 0), 0) || 0;
            const sumSinal = sumPago + sumAberto;

            const qtdPago = v.raw_sinais_pagos?.lista?.length || 0;
            const qtdAberto = v.raw_sinais_abertos?.lista?.length || 0;
            const qtdSinal = qtdPago + qtdAberto;

            globalVgvTotal += v.valor_venda || 0;
            globalSinalTotal += sumSinal;
            globalSinalPago += sumPago;
            globalSinalAberto += sumAberto;

            tableData.push([
                v.cliente?.nome || v.client?.nome || 'Sem Nome',
                v.corretorNome || 'Sem Corretor',
                `Q${v.quadra}/L${v.lote}`,
                formatDate(v.data_venda),
                v.status_venda || 'Desconhecido',
                formatCurrency(v.valor_venda || 0),
                qtdSinal.toString(),
                qtdPago.toString(), // Nova coluna Qtd Pagos
                formatCurrency(sumSinal),
                formatCurrency(sumPago),
                formatCurrency(sumAberto)
            ]);
        });

        if (tableData.length === 0) {
            alert('Não há vendas no filtro atual.');
            return;
        }

        // Adiciona linha de totais na base da tabela
        tableData.push([
            'TOTAIS',
            '-',
            '-',
            '-',
            '-',
            formatCurrency(globalVgvTotal),
            '-',
            '-',
            formatCurrency(globalSinalTotal),
            formatCurrency(globalSinalPago),
            formatCurrency(globalSinalAberto)
        ]);

        runPdfWithLogo((base64Logo) => {
            const doc = new jsPDF('landscape'); // Paisagem

            autoTable(doc, {
                startY: 40,
                head: [['Cliente', 'Corretor', 'Q/Lote', 'Data', 'Status', 'Valor Lote', 'Qtd Parc.', 'Qtd Pagos', 'Sinal Total', 'Sinal Pago', 'Sinal Aberto']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
                columnStyles: {
                    0: { cellWidth: 42 }, 
                    1: { cellWidth: 38 }, 
                    5: { halign: 'right' }, 
                    6: { halign: 'center' },
                    7: { halign: 'center', textColor: [21, 128, 61], fontStyle: 'bold' }, // verde
                    8: { halign: 'right' },
                    9: { halign: 'right', textColor: [21, 128, 61], fontStyle: 'bold' }, // Verde bold
                    10: { halign: 'right', textColor: [185, 28, 28], fontStyle: 'bold' }, // Vermelho bold
                },
                willDrawCell: function(data) {
                    if (data.row.index === tableData.length - 1) {
                        doc.setFillColor(241, 245, 249); // Cinza leve no total
                        doc.setFont("helvetica", "bold");
                        data.cell.styles.fontStyle = 'bold';
                        
                        // Manter preto nas infos que não importam pra cor no footer
                        if (data.column.index >= 5) {
                           doc.setTextColor(0,0,0);
                        }
                    }
                },
                styles: { fontSize: 7, cellPadding: 3, valign: 'middle' },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                didDrawPage: (data) => {
                    drawPdfHeaderFooterEnhanced(doc, data, "EXTRATO DETALHADO", `Recebíveis de Entradas (Sinais) por Contrato | ${processedData.length} contratos referenciados.`);
                    drawLogoEnhancement(doc, data, base64Logo);
                }
            });

            doc.save(`Valle_Extrato_${new Date().toISOString().slice(0,10)}.pdf`);
        });
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

                        <button 
                            className="mobile-filters-toggle" 
                            onClick={() => setShowFiltrosMob(!showFiltrosMob)}
                        >
                            <Search size={16} /> 
                            <span>{showFiltrosMob ? 'Ocultar Filtros' : 'Filtros da Busca'}</span>
                        </button>

                        <div className={`broker-filters ${showFiltrosMob ? 'open' : ''}`}>
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

                            <div className="filter-group date-range-group">
                                <Calendar size={16} />
                                <span className="date-label">De:</span>
                                <input 
                                    type="date" 
                                    className="minimal-date"
                                    value={inputInicio}
                                    onChange={(e) => setInputInicio(e.target.value)}
                                />
                                <span className="date-label">Até:</span>
                                <input 
                                    type="date" 
                                    className="minimal-date"
                                    value={inputFim}
                                    onChange={(e) => setInputFim(e.target.value)}
                                />
                                <button 
                                    className="btn-search-date" 
                                    onClick={() => { 
                                        setDataInicio(inputInicio); 
                                        setDataFim(inputFim); 
                                        setSearchTrigger(prev => prev + 1);
                                    }}
                                >
                                    Buscar
                                </button>
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
                                    placeholder={isAdmin ? "Buscar cliente ou corretor..." : "Buscar cliente..."}
                                    className="minimal-search"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </header>

                <section className="brokers-financial-dashboard animate-fade-in-up">
                    <div className="finance-card neutral">
                        <div className="f-icon"><DollarSign size={20} /></div>
                        <div className="f-content">
                            <label>Total de Vendas</label>
                            {isAdmin ? 
                                <span>{formatCurrency(stats.totalVgv)}</span> :
                                <span>{stats.totalSales} Lotes</span>
                            }
                        </div>
                    </div>
                    
                    <div className="finance-card primary">
                        <div className="f-icon"><TrendingUp size={20} /></div>
                        <div className="f-content">
                            <label>Sinais Totais</label>
                            <span>{formatCurrency((stats.sinaisPagos || 0) + (stats.sinaisAbertos || 0))}</span>
                        </div>
                    </div>

                    <div className="finance-card success">
                        <div className="f-icon"><Briefcase size={20} /></div>
                        <div className="f-content">
                            <label>Sinais Pagos</label>
                            <span>{formatCurrency(stats.sinaisPagos || 0)}</span>
                        </div>
                    </div>

                    <div className="finance-card danger">
                        <div className="f-icon"><AlertCircle size={20} /></div>
                        <div className="f-content">
                            <label>Sinais Abertos</label>
                            <span>{formatCurrency(stats.sinaisAbertos || 0)}</span>
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
                        <span className="total-count">{processedData.length} Contratos Visíveis</span>
                        <div className="pdf-actions-group">
                            <button className="btn-action-pdf secondary" onClick={generateSalesReport}>
                                <FileText size={16} /> Extrato Vendas
                            </button>
                            <button className="btn-action-pdf danger" onClick={generateCollectionReport}>
                                <AlertCircle size={16} /> Cobrança
                            </button>
                        </div>
                    </div>
                </div>

                {/* Client Cards */}
                <section className="client-cards-section animate-fade-in-up">
                    {loading ? (
                        <div className="loading-container">
                            <div className="progress-bar-wrapper">
                                <div className="progress-bar-track">
                                    <div 
                                        className="progress-bar-fill" 
                                        style={{ width: `${loadProgress}%` }}
                                    />
                                </div>
                                <div className="progress-info">
                                    <Loader2 className="loading-spinner-small" size={18} />
                                    <span className="progress-text">
                                        {loadProgress < 30 ? 'Conectando ao servidor UAU...' 
                                         : loadProgress < 60 ? 'Consultando banco de dados...' 
                                         : loadProgress < 90 ? 'Processando vendas e parcelas...'
                                         : loadProgress < 100 ? 'Finalizando cálculos...'
                                         : 'Concluído!'}
                                    </span>
                                    <span className="progress-percent">{loadProgress}%</span>
                                </div>
                            </div>
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
                                                            <span className="data-value">
                                                                {(() => {
                                                                    const totalAbertas = venda.raw_sinais_abertos?.lista?.length || 0;
                                                                    const totalPagas = venda.raw_sinais_pagos?.lista?.length || 0;
                                                                    const totalParcelas = totalAbertas + totalPagas;
                                                                    if (totalParcelas <= 1) return 'Sinal à Vista';
                                                                    return `Sinal Parcelado em ${totalParcelas}x`;
                                                                })()}
                                                            </span>
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
                                                            <div className="parcel-list">
                                                                {filteredAbertos.map((parc, idx) => (
                                                                    <div key={idx} className={`parcel-item ${parc.is_atrasado === 1 ? 'atrasado' : ''}`}>
                                                                        <div className="parcel-info">
                                                                            <span className="parcel-title">{parc.tipo} ({parc.parcela})</span>
                                                                            <span className="parcel-date">Venc: {formatDate(parc.data_vencimento)}</span>
                                                                        </div>
                                                                        <div className="parcel-meta">
                                                                            <span className="parcel-value">{formatCurrency(parc.valor_aberto)}</span>
                                                                            <span className={`parcel-badge ${parc.is_atrasado === 1 ? 'danger' : 'warning'}`}>
                                                                                {parc.is_atrasado === 1 ? 'Atrasado' : 'A Vencer'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ))}
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
                                                            <div className="parcel-list">
                                                                {venda.raw_sinais_pagos.lista.map((parc, idx) => (
                                                                    <div key={idx} className="parcel-item pago">
                                                                        <div className="parcel-info">
                                                                            <span className="parcel-title">{parc.tipo} ({parc.parcela})</span>
                                                                            <span className="parcel-date">Pago em: {formatDate(parc.data_pagamento)}</span>
                                                                        </div>
                                                                        <div className="parcel-meta">
                                                                            <span className="parcel-value success">{formatCurrency(parc.valor_pago)}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
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
