import React, { useState, useEffect } from 'react';
import { X, Send, Calculator, FileText, ClipboardCopy, CheckCircle, Loader2, AlertCircle, Plus, Trash2, Calendar, MapPin } from 'lucide-react';
import { OBRAS } from '../context/authConstants';
import './BudgetModal.css';
import ClientFormModal from './ClientFormModal';
import ClientSelectionModal from './ClientSelectionModal';
import BudgetWizard from './BudgetWizard';
import { saveClient } from '../services/api';

import logo from '../assets/Valle-logo-azul.png';

const ENV_API = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const isPagesDev = typeof window !== 'undefined' && /\.pages\.dev$/i.test(window.location?.hostname || '');
const API_BASE_URL = ENV_API || (isPagesDev ? 'https://valleprimev2.onrender.com' : '');

const BudgetModal = ({ lot, onClose, obraName }) => {
    const lotValue = parseFloat(lot.Valor_Terreno.replace(/\./g, '').replace(',', '.')) || 0;

    const downPaymentPercent = 5;
    const [balanceInstallments, setBalanceInstallments] = useState(200);
    const [copied, setCopied] = useState(false);

    const [discountActive, setDiscountActive] = useState(false);
    const [discountPercent, setDiscountPercent] = useState(20);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genStatus, setGenStatus] = useState(null);
    const [showClientForm, setShowClientForm] = useState(false);
    const [showClientSelection, setShowClientSelection] = useState(false);
    const [selectedClientData, setSelectedClientData] = useState(null);
    const [showSuccessView, setShowSuccessView] = useState(false);

    // NEW: Entrada (Fixed amount paid upfront, separate from sinal)
    const [entradaEnabled, setEntradaEnabled] = useState(false);
    const [entradaValue, setEntradaValue] = useState(0);
    const [entradaQtdParcelas, setEntradaQtdParcelas] = useState(1);
    const [entradaFirstDate, setEntradaFirstDate] = useState(new Date().toISOString().split('T')[0]);

    // NEW: Dates for first installments
    const [sinalLineDates, setSinalLineDates] = useState([new Date().toISOString().split('T')[0]]);
    const [saldoFirstDate, setSaldoFirstDate] = useState(new Date().toISOString().split('T')[0]);

    // NEW: Proposal date (user selectable)
    const [propostaDate, setPropostaDate] = useState(new Date().toISOString().split('T')[0]);

    // NEW: Flexible Sinal Splitting (array of {qtd, value})
    const [sinalLines, setSinalLines] = useState([
        { qtd: 1, value: 0 } // Will be calculated
    ]);
    const [sinalInputValues, setSinalInputValues] = useState(['']);

    // Signal discount (now in R$ fixed value)
    const [sinalDiscountEnabled, setSinalDiscountEnabled] = useState(false);
    const [sinalDiscountValue, setSinalDiscountValue] = useState(0);
    const [skipSinalEnabled, setSkipSinalEnabled] = useState(false);
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

    // Calculations
    const downPaymentTotal = lotValue * (downPaymentPercent / 100);
    const sinalDiscountedTotal = sinalDiscountEnabled
        ? Math.max(0, downPaymentTotal - (parseFloat(sinalDiscountValue) || 0))
        : downPaymentTotal;
    const entradaAmount = entradaEnabled ? parseFloat(entradaValue) || 0 : 0;

    // Calculate discounted value
    const getDiscountedValues = () => {
        const balance = lotValue - downPaymentTotal - entradaAmount;
        const steps = discountPercent / 10;
        let discountedBalance = balance;
        for (let i = 0; i < steps; i++) {
            discountedBalance = discountedBalance * 0.90;
        }
        const openBalance = discountedBalance;
        const totalWithDiscount = openBalance + downPaymentTotal + entradaAmount;
        return { openBalance, totalWithDiscount };
    };

    const { openBalance, totalWithDiscount } = getDiscountedValues();

    const remainingBalance = lotValue - downPaymentTotal - entradaAmount;
    const safeInstallments = parseInt(balanceInstallments) || 0;
    const effectiveRemainingBalance = discountActive ? openBalance : remainingBalance;
    const effectiveBalanceInstallmentValue = safeInstallments > 0 ? effectiveRemainingBalance / safeInstallments : 0;

    // Auto-calculate first sinal line value when total changes
    useEffect(() => {
        if (skipSinalEnabled) return;
        setSinalLines(prev => {
            if (prev.length !== 1) return prev;
            const qtd = prev[0]?.qtd ?? 1;
            const formatted = sinalDiscountedTotal
                ? parseFloat(sinalDiscountedTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '';
            setSinalInputValues([formatted]);
            return [{ qtd, value: sinalDiscountedTotal }];
        });
    }, [sinalDiscountedTotal, skipSinalEnabled]);

    // Calculate total of custom sinal lines
    const totalSinalFromLines = sinalLines.reduce((acc, line) => acc + (parseFloat(line.value) || 0), 0);
    const sinalDifference = sinalDiscountedTotal - totalSinalFromLines;

    const formatCurrency = (val) => {
        if (!val || !Number.isFinite(val)) return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const formatCurrencyInput = (val) => {
        if (!val) return '';
        return parseFloat(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const parseCurrencyInput = (str) => {
        if (!str || typeof str !== 'string') return 0;
        const cleaned = str.replace(/\./g, '').replace(',', '.');
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    };

    const getPlanType = (n) => {
        if (n === 1) return 'À Vista';
        if (n <= 36) return 'Parcelas Fixas';
        if (n <= 72) return 'Parcelas Corrigidas';
        return 'Parcelas Reajustáveis';
    };

    // Sinal Lines Management
    const addSinalLine = () => {
        setSinalLines([...sinalLines, { qtd: 1, value: 0 }]);
        setSinalInputValues([...sinalInputValues, '']);
        setSinalLineDates([...sinalLineDates, new Date().toISOString().split('T')[0]]);
    };

    const removeSinalLine = (index) => {
        if (sinalLines.length > 1) {
            const newLines = sinalLines.filter((_, i) => i !== index);
            const newInputValues = sinalInputValues.filter((_, i) => i !== index);
            const newDates = sinalLineDates.filter((_, i) => i !== index);

            // If returning to single-line mode, reset value to auto-calculate
            if (newLines.length === 1) {
                newLines[0].value = sinalDiscountedTotal;
                newInputValues[0] = formatCurrencyInput(sinalDiscountedTotal);
            }

            setSinalLines(newLines);
            setSinalInputValues(newInputValues);
            setSinalLineDates(newDates);
        }
    };

    const updateSinalLine = (index, field, value) => {
        const updated = [...sinalLines];
        if (field === 'qtd') {
            if (value === "") {
                updated[index][field] = "";
            } else {
                const parsed = parseInt(value);
                updated[index][field] = isNaN(parsed) ? 1 : parsed;
            }
        } else if (field === 'value') {
            // Handle both string (from old code) and number (from onBlur)
            if (typeof value === 'number') {
                updated[index][field] = isNaN(value) ? 0 : value;
            } else {
                updated[index][field] = parseCurrencyInput(value);
            }
        }
        setSinalLines(updated);
    };

    const getMessage = () => {
        const currentObra = OBRAS.find(o => o.descricao === obraName || o.codigo === lot.Obra);
        const locationInfo = currentObra ? `${currentObra.cidade} - ${currentObra.uf}` : '';
        const subdivision = obraName || lot.Descricao_Empreendimento || 'VALLE';
        const checkMeasure = (val) => val && val.toString() !== '0,00' && val.toString() !== '0.00' && val.toString() !== '- / -';
        const measures = [
            checkMeasure(lot.M_Frente) && `Frente: ${lot.M_Frente}m`,
            checkMeasure(lot.M_Fundo) && `Fundo: ${lot.M_Fundo}m`,
            checkMeasure(lot.M_Lado_Direito) && `L.Dir: ${lot.M_Lado_Direito}m`,
            checkMeasure(lot.M_Lado_Esquerdo) && `L.Esq: ${lot.M_Lado_Esquerdo}m`,
            checkMeasure(lot.Chanfro) && `Chanfro: ${lot.Chanfro}m`
        ].filter(Boolean).join(' | ');

        let priceSection = `💰 *Valor do Lote: ${formatCurrency(lotValue)}*`;
        if (discountActive) {
            priceSection = `💰 *Valor do Lote:* ~${formatCurrency(lotValue)}~\n🔥 *Oferta Especial (${discountPercent}% OFF):* ${formatCurrency(totalWithDiscount)}`;
        }

        let entradaSection = '';
        if (entradaEnabled && entradaAmount > 0) {
            entradaSection = `\n💵 *Entrada:* ${formatCurrency(entradaAmount)} (À Vista)`;
        }

        const sinalSection = sinalLines.map((line) => {
            const lVal = parseFloat(line.value) || 0;
            const lQtd = parseInt(line.qtd) || 1;
            const lineValue = lVal / lQtd;
            return `   ${lQtd}x de ${formatCurrency(lineValue)}`;
        }).join('\n');

        return `
🏡 *${subdivision.toUpperCase()}*
📍 ${locationInfo}
📍 Quadra ${lot.QD} | Lote ${lot.LT}
📐 Área: ${lot.M2} m²
${measures ? `📏 ${measures}` : ''}

${priceSection}
${entradaSection}

💳 *Sinal (${downPaymentPercent}%):* ${formatCurrency(downPaymentTotal)}
${sinalSection}

📊 *Saldo a Parcelar:* ${formatCurrency(effectiveRemainingBalance)}
   ${balanceInstallments}x de ${formatCurrency(effectiveBalanceInstallmentValue)} (${getPlanType(balanceInstallments)})
        `.trim();
    };

    const handleWhatsAppShare = () => {
        const message = encodeURIComponent(getMessage());
        window.open(`https://wa.me/?text=${message}`, '_blank');
    };

    const handleCopyMessage = async () => {
        try {
            await navigator.clipboard.writeText(getMessage());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = getMessage();
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        }
    };

    const handleOpenClientForm = () => {
        // Validation: Balance installments cannot be zero or empty
        if (!balanceInstallments || balanceInstallments <= 0) {
            alert('⚠️ ATENÇÃO!\n\nO número de parcelas do SALDO não pode ser zero ou vazio.\n\nPor favor, informe quantas parcelas deseja para o saldo a parcelar.');
            return;
        }

        // Validation: Sinal cannot be zero unless "Sem Sinal" is enabled
        if (!skipSinalEnabled) {
            // Check if sinal has at least one line with valid data
            const hasSinalData = sinalLines.some(line =>
                line.qtd > 0 && line.valor > 0
            );

            if (!hasSinalData && downPaymentTotal <= 0) {
                alert('⚠️ ATENÇÃO!\n\nO SINAL não pode estar vazio.\n\nVocê tem duas opções:\n1. Configure pelo menos uma linha de sinal\n2. Marque a opção "Sem Sinal" nas Opções Avançadas');
                return;
            }
        }

        setShowClientSelection(true);
    };

    const handleSelectClient = (clientData) => {
        setSelectedClientData(clientData);
        setShowClientSelection(false);
        setShowClientForm(true);
    };

    const handleNewClient = () => {
        setSelectedClientData(null);
        setShowClientSelection(false);
        setShowClientForm(true);
    };

    const handleGeneratePDF = async (clientData) => {
        if (isGenerating) return;

        setIsGenerating(true);
        setGenStatus(null);
        setShowClientForm(false);

        // Save client data first to ensure persistence
        try {
            // Include client_id if editing an existing client
            const dataToSave = {
                ...clientData,
                client_id: selectedClientData?.id || null
            };
            console.log('[BudgetModal] Saving client:', { 
                isEdit: !!selectedClientData?.id, 
                clientId: dataToSave.client_id 
            });
            
            const saveResult = await saveClient(dataToSave);
            if (!saveResult.success) {
                alert('Aviso: Não foi possível salvar as alterações no cadastro do cliente, mas a proposta será gerada com os dados atuais.');
                console.error('Error saving client:', saveResult.error);
            }
        } catch (err) {
            console.error('Error saving client:', err);
            // Continue generation even if save fails - better to proceed so user gets their PDF.
        }

        // Build sinal data for backend
        const sinalData = {};

        // Helper to format currency for backend (Brazilian format: 1.234,56)
        const formatCurrencyForBackend = (value) => {
            if (!value || !Number.isFinite(value)) return '0,00';
            return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        sinalLines.forEach((line, idx) => {
            const prefix = idx === 0 ? 'sinal_l1' : idx === 1 ? 'sinal_l2' : 'sinal_bloco2';

            // Parse date manually to avoid timezone issues
            const [year, month, day] = sinalLineDates[idx].split('-');

            const lineQtd = parseInt(line.qtd) || 1;
            const lineVal = parseFloat(line.value) || 0;
            const parcelaValue = lineVal / lineQtd;

            sinalData[`${prefix}_qtd_parcelas`] = lineQtd.toString().padStart(2, '0');
            sinalData[`${prefix}_valor_parcela`] = formatCurrencyForBackend(parcelaValue);
            sinalData[`${prefix}_dia`] = day;
            sinalData[`${prefix}_mes`] = month;
            sinalData[`${prefix}_ano`] = year;
            sinalData[`${prefix}_periodicidade`] = line.qtd > 1 ? 'MENSAL' : 'ÚNICA';
        });

        console.log('[DEBUG] Sinal Lines:', sinalLines);
        console.log('[DEBUG] Sinal Data:', sinalData);

        // Saldo first date - parse manually to avoid timezone issues
        const [saldoYear, saldoMonth, saldoDay] = saldoFirstDate.split('-');

        try {
            const proposalUrl = API_BASE_URL ? `${API_BASE_URL}/api/generate_proposal` : '/api/generate_proposal';
            const response = await fetch(proposalUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lot,
                    obraName,
                    lotValue,
                    downPaymentTotal: sinalDiscountedTotal, // Use discounted total
                    sinalDiscountEnabled,
                    sinalDiscountValue, // R$ amount
                    sinalOriginalTotal: downPaymentTotal,
                    remainingBalance: discountActive ? openBalance : remainingBalance,
                    balanceInstallments,

                    // Logradouro do lote
                    logradouro: lot.Logradouro || '',

                    // Entrada
                    entradaEnabled,
                    entradaValue: entradaAmount,
                    entrada_qtd_parcelas: entradaQtdParcelas.toString().padStart(2, '0'),
                    entrada_valor_parcela: formatCurrencyForBackend(entradaAmount / entradaQtdParcelas),
                    entrada_dia: entradaFirstDate.split('-')[2],
                    entrada_mes: entradaFirstDate.split('-')[1],
                    entrada_ano: entradaFirstDate.split('-')[0],
                    entrada_periodicidade: entradaQtdParcelas > 1 ? 'MENSAL' : 'ÚNICA',

                    // Sinal custom data - only if NOT skipped
                    ...(skipSinalEnabled ? {} : sinalData),

                    // Flag to indicate if sinal should be skipped
                    skipSinal: skipSinalEnabled,

                    // Saldo date
                    saldo_dia: saldoDay,
                    saldo_mes: saldoMonth,
                    saldo_ano: saldoYear,

                    // Proposal date (user selected)
                    proposta_data: propostaDate,

                    // Client data
                    ...clientData
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                window.open(url, '_blank');
                setGenStatus('success');
                setShowSuccessView(true);
            } else {
                let msg = `Erro ${response.status}`;
                const text = await response.text();
                console.error('[generate_proposal] Server response:', text);
                try {
                    const errData = JSON.parse(text);
                    if (errData.error) msg = errData.error;
                } catch {
                    if (text && text.length < 200) msg = text;
                }
                setGenStatus('error');
                alert('Erro ao gerar proposta: ' + msg);
            }
        } catch (error) {
            console.error(error);
            setGenStatus('error');
            alert('Erro ao conectar: ' + (error.message || 'tente novamente.'));
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content animate-pop-in" onClick={e => e.stopPropagation()}>
                <header className="modal-header">
                    <div className="modal-title-wrapper">
                        <div className="header-logo-container">
                            <img src={logo} alt="Valle Logo" className="header-logo" />
                        </div>
                        <div className="header-text">
                            <h2>Orçamento do Lote</h2>
                            <p className="obra-name">{obraName || 'Valle'}</p>
                            <p className="lot-info">Quadra {lot.QD} • Lote {lot.LT} • {lot.M2} m²</p>
                        </div>
                    </div>
                    <button className="close-btn" onClick={onClose} title="Fechar">
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </header>

                {/* Proposal Date - Minimalist */}
                <div className="proposal-date-bar">
                    <Calendar size={16} />
                    <span>Data da Proposta:</span>
                    <input
                        type="date"
                        value={propostaDate}
                        onChange={(e) => setPropostaDate(e.target.value)}
                    />
                </div>

                <div className="modal-body">
                    {showSuccessView ? (
                        <div className="success-view animate-fade-in">
                            <div className="success-icon-wrapper">
                                <CheckCircle size={64} color="#48bb78" />
                            </div>
                            <h3>Proposta Gerada com Sucesso!</h3>
                            <p>O arquivo foi aberto em uma nova aba do navegador.</p>

                            <div className="prompt-actions" style={{ marginTop: '2rem' }}>
                                <button
                                    className="btn-finish-success"
                                    onClick={onClose}
                                >
                                    Concluir e Sair
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <section className="modal-section main-value">
                                <div className="value-header-row">
                                    <label>Valor Total do Lote</label>
                                    <div className="discount-toggle">
                                        <span className="discount-label">Desconto Especial?</span>
                                        <label className="switch">
                                            <input type="checkbox" checked={discountActive} onChange={() => setDiscountActive(!discountActive)} />
                                            <span className="slider round"></span>
                                        </label>
                                    </div>
                                </div>

                                {discountActive ? (
                                    <div className="price-container">
                                        <div className="old-price">{formatCurrency(lotValue)}</div>
                                        <div className="new-price">{formatCurrency(totalWithDiscount)}</div>
                                        <div className="discount-savings">- {formatCurrency(lotValue - totalWithDiscount)}</div>
                                        <div className="discount-selector">
                                            {[10, 20, 30].map(pct => (
                                                <button
                                                    key={pct}
                                                    className={`discount-btn ${discountPercent === pct ? 'active' : ''}`}
                                                    onClick={() => setDiscountPercent(pct)}
                                                >
                                                    {pct}% OFF
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="value-display">{formatCurrency(lotValue)}</div>
                                )}

                                {/* Logradouro + Measurements */}
                                <div className="lot-info-section">
                                    {lot.Logradouro && (
                                        <div className="logradouro">{lot.Logradouro}</div>
                                    )}
                                    <div className="measurements-inline">
                                        {[
                                            { label: 'Frente', val: lot.M_Frente },
                                            { label: 'Fundo', val: lot.M_Fundo },
                                            { label: 'L.Dir', val: lot.M_Lado_Direito },
                                            { label: 'L.Esq', val: lot.M_Lado_Esquerdo },
                                            { label: 'Chanfro', val: lot.Chanfro }
                                        ].filter(m => m.val && m.val !== '0,00' && m.val !== '0.00' && m.val !== '- / -').map((m, idx) => (
                                            <span key={idx} className="measure-inline">
                                                <small>{m.label}</small> {m.val}m
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            {/* ENTRADA Section */}
                            <section className="modal-section entrada-section">
                                <div className="section-header-row">
                                    <label>Entrada</label>
                                    <label className="switch small">
                                        <input type="checkbox" checked={entradaEnabled} onChange={() => setEntradaEnabled(!entradaEnabled)} />
                                        <span className="slider round"></span>
                                    </label>
                                </div>
                                {entradaEnabled && (
                                    <>
                                        <div className="entrada-input-row">
                                            <span>R$</span>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                className="wizard-input-styled"
                                                value={entradaValue === 0 ? "" : entradaValue}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === "") setEntradaValue(0);
                                                    else setEntradaValue(parseFloat(val) || 0);
                                                }}
                                                onFocus={(e) => e.target.select()}
                                                placeholder="0,00"
                                            />
                                        </div>
                                        <div className="entrada-installment-row">
                                            <div className="input-field">
                                                <span>Parcelas</span>
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    min="1"
                                                    max="12"
                                                    value={entradaQtdParcelas || ""}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === "") setEntradaQtdParcelas("");
                                                        else {
                                                            const parsed = parseInt(val);
                                                            if (!isNaN(parsed)) setEntradaQtdParcelas(Math.min(12, Math.max(1, parsed)));
                                                        }
                                                    }}
                                                    onFocus={(e) => e.target.select()}
                                                />
                                            </div>
                                            <div className="installment-preview">
                                                = {formatCurrency((parseFloat(entradaValue) || 0) / (parseInt(entradaQtdParcelas) || 1))} /mês
                                                <small>
                                                    {(parseInt(entradaQtdParcelas) || 1) === 1 ? 'À Vista' : `${parseInt(entradaQtdParcelas) || 1}x ${getPlanType(parseInt(entradaQtdParcelas) || 1)}`}
                                                </small>
                                            </div>
                                        </div>
                                        <div className="date-picker-row">
                                            <label><Calendar size={14} /> 1ª Parcela:</label>
                                            <input
                                                type="date"
                                                value={entradaFirstDate}
                                                onChange={(e) => setEntradaFirstDate(e.target.value)}
                                            />
                                        </div>
                                    </>
                                )}
                            </section>

                            <div className="calc-grid">
                                {/* SINAL Section */}
                                <section className="modal-section sinal-section">
                                    <div className="section-header-row">
                                        <label>Sinal ({downPaymentPercent}%)</label>
                                        <div className="value-highlight">{formatCurrency(downPaymentTotal)}</div>
                                    </div>

                                    {/* Advanced Options (Collapsible) */}
                                    <button
                                        className="advanced-options-toggle"
                                        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                    >
                                        {showAdvancedOptions ? '▲' : '▼'} Opções Avançadas
                                    </button>

                                    {showAdvancedOptions && (
                                        <div className="advanced-options-panel">
                                            <div className="approvals-warning">
                                                ⚠️ Requerem aprovação de superiores
                                            </div>
                                            <div className="approval-options">
                                                <div className="approval-option">
                                                    <label className="switch small">
                                                        <input type="checkbox" checked={skipSinalEnabled} onChange={() => setSkipSinalEnabled(!skipSinalEnabled)} />
                                                        <span className="slider round"></span>
                                                    </label>
                                                    <span className="option-label">Sem Sinal</span>
                                                </div>
                                                <div className="approval-option">
                                                    <label className="switch small">
                                                        <input type="checkbox" checked={sinalDiscountEnabled} onChange={() => setSinalDiscountEnabled(!sinalDiscountEnabled)} disabled={skipSinalEnabled} />
                                                        <span className="slider round"></span>
                                                    </label>
                                                    <span className="option-label">Desconto</span>
                                                    {sinalDiscountEnabled && !skipSinalEnabled && (
                                                        <div className="discount-input-inline">
                                                            <span>R$</span>
                                                            <input
                                                                type="number"
                                                                inputMode="decimal"
                                                                value={sinalDiscountValue === 0 ? "" : sinalDiscountValue}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (val === "") setSinalDiscountValue(0);
                                                                    else setSinalDiscountValue(parseFloat(val) || 0);
                                                                }}
                                                                onFocus={(e) => e.target.select()}
                                                                placeholder="0,00"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {sinalDiscountEnabled && !skipSinalEnabled && sinalDiscountValue > 0 && (
                                                <div className="discount-result">
                                                    Sinal com desconto: <strong>{formatCurrency(sinalDiscountedTotal)}</strong>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="sinal-lines">
                                        {sinalLines.length === 1 ? (
                                            /* Single Line Layout - Auto Calculate */
                                            <div className="sinal-single-row">
                                                <div className="sinal-field">
                                                    <span>Nº de Parcelas</span>
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        min="1"
                                                        max="12"
                                                        value={sinalLines[0].qtd || ""}
                                                        onChange={(e) => updateSinalLine(0, 'qtd', e.target.value)}
                                                        onFocus={(e) => e.target.select()}
                                                    />
                                                </div>
                                                <div className="sinal-auto-result">
                                                    <span>{(parseInt(sinalLines[0].qtd) || 1)}x de</span>
                                                    <strong>{formatCurrency((parseFloat(sinalDiscountedTotal) || 0) / (parseInt(sinalLines[0].qtd) || 1))}</strong>
                                                </div>
                                                <div className="sinal-field date">
                                                    <span>1ª Parcela</span>
                                                    <input
                                                        type="date"
                                                        value={sinalLineDates[0]}
                                                        onChange={(e) => {
                                                            const updated = [...sinalLineDates];
                                                            updated[0] = e.target.value;
                                                            setSinalLineDates(updated);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            /* Multiple Lines Layout - Manual Values */
                                            sinalLines.map((line, idx) => (
                                                <div key={idx} className="sinal-line-row">
                                                    <div className="sinal-field">
                                                        <span>Qtd</span>
                                                        <input
                                                            type="number"
                                                            inputMode="numeric"
                                                            min="1"
                                                            max="12"
                                                            value={line.qtd || ""}
                                                            onChange={(e) => updateSinalLine(idx, 'qtd', e.target.value)}
                                                            onFocus={(e) => e.target.select()}
                                                        />
                                                    </div>
                                                    <div className="sinal-field value">
                                                        <span>Valor Total</span>
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            value={line.value === 0 ? "" : line.value}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                // We update the state directly for better UX than the old onBlur/inputValue sync
                                                                updateSinalLine(idx, 'value', val === "" ? 0 : parseFloat(val) || 0);
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            placeholder="0,00"
                                                        />
                                                    </div>
                                                    <div className="sinal-per-installment">
                                                        = {formatCurrency((parseFloat(line.value) || 0) / (parseInt(line.qtd) || 1))} /mês
                                                    </div>
                                                    <div className="sinal-field date">
                                                        <span>1ª Parcela</span>
                                                        <input
                                                            type="date"
                                                            value={sinalLineDates[idx]}
                                                            onChange={(e) => {
                                                                const updated = [...sinalLineDates];
                                                                updated[idx] = e.target.value;
                                                                setSinalLineDates(updated);
                                                            }}
                                                        />
                                                    </div>
                                                    {sinalLines.length > 1 && (
                                                        <button className="remove-line-btn" onClick={() => removeSinalLine(idx)}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                        <button className="add-line-btn" onClick={addSinalLine}>
                                            <Plus size={16} /> Adicionar Linha de Sinal
                                        </button>
                                        {Math.abs(sinalDifference) > 0.01 ? (
                                            <div className={`sinal-difference ${sinalDifference > 0 ? 'positive' : 'negative'}`}>
                                                {sinalDifference > 0 ? `Faltam ${formatCurrency(sinalDifference)}` : `Excedente de ${formatCurrency(Math.abs(sinalDifference))}`}
                                            </div>
                                        ) : sinalLines.length > 1 ? (
                                            <div className="sinal-difference exact">
                                                ✅ Valor do sinal fechado corretamente!
                                            </div>
                                        ) : null}
                                    </div>
                                </section>

                                {/* SALDO Section */}
                                <section className="modal-section saldo-section">
                                    <div className="section-header-row">
                                        <label>Saldo a Parcelar</label>
                                        <div className="value-highlight secondary">{formatCurrency(effectiveRemainingBalance)}</div>
                                    </div>

                                    <div className="input-group-row">
                                        <div className="input-field">
                                            <span>Parcelas <small className="text-muted">(1-200)</small></span>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min="1"
                                                max="200"
                                                value={balanceInstallments || ""}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === "") setBalanceInstallments("");
                                                    else {
                                                        const parsed = parseInt(val);
                                                        if (!isNaN(parsed)) setBalanceInstallments(Math.min(200, Math.max(1, parsed)));
                                                    }
                                                }}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </div>
                                        <div className="installment-result">
                                            <p>
                                                {balanceInstallments}x de <strong>{formatCurrency(effectiveBalanceInstallmentValue)}</strong>
                                                <br />
                                                <small className="plan-badge">{getPlanType(balanceInstallments)}</small>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="date-picker-row">
                                        <label><Calendar size={14} /> 1ª Parcela do Saldo:</label>
                                        <input
                                            type="date"
                                            value={saldoFirstDate}
                                            onChange={(e) => setSaldoFirstDate(e.target.value)}
                                        />
                                    </div>


                                </section>
                            </div>
                        </>
                    )}
                </div>

                {!showSuccessView && (
                    <footer className="modal-footer">
                        <button className="btn-cancel" onClick={onClose}>Voltar</button>
                        <div className="footer-actions">
                            <button
                                className={`btn-pdf ${isGenerating ? 'loading' : ''} ${genStatus || ''}`}
                                onClick={handleOpenClientForm}
                                disabled={isGenerating}
                            >
                                {isGenerating ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : genStatus === 'success' ? (
                                    <CheckCircle size={18} />
                                ) : genStatus === 'error' ? (
                                    <AlertCircle size={18} />
                                ) : (
                                    <FileText size={18} />
                                )}
                                {isGenerating ? 'Gerando...' : genStatus === 'success' ? 'Gerado!' : 'Proposta'}
                            </button>
                            <button className={`btn-copy ${copied ? 'copied' : ''}`} onClick={handleCopyMessage}>
                                {copied ? <CheckCircle size={18} /> : <ClipboardCopy size={18} />}
                                {copied ? 'Copiado!' : 'Copiar'}
                            </button>
                            <button className="btn-whatsapp" onClick={handleWhatsAppShare}>
                                <Send size={18} />
                                WhatsApp
                            </button>
                        </div>
                    </footer>
                )}
            </div>

            {showClientSelection && (
                <ClientSelectionModal
                    onSelectClient={handleSelectClient}
                    onNewClient={handleNewClient}
                    onClose={() => setShowClientSelection(false)}
                />
            )}

            {showClientForm && (
                <ClientFormModal
                    lot={lot}
                    obraName={obraName}
                    onClose={() => setShowClientForm(false)}
                    onBack={() => {
                        setShowClientForm(false);
                        setShowClientSelection(true);
                    }}
                    onConfirm={handleGeneratePDF}
                    initialData={selectedClientData?.data || selectedClientData}
                    clientId={selectedClientData?.id}
                />
            )}
        </div>
    );
};

export default BudgetModal;
