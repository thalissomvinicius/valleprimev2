import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Send, ClipboardCopy, Calendar, Plus, Trash2, CheckCircle, MapPin, Maximize, Layers, Info } from 'lucide-react';
import { OBRAS } from '../context/authConstants';
import './BudgetWizard.css';
import ClientFormModal from './ClientFormModal';
import ClientSelectionModal from './ClientSelectionModal';
import { saveClient } from '../services/api';
import { useToast } from '../context/toastContextValue';
import logo from '../assets/Valle-logo-azul.png';

const ENV_API = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const isPagesDev = typeof window !== 'undefined' && /\.pages\.dev$/i.test(window.location?.hostname || '');
const API_BASE_URL = ENV_API || (isPagesDev ? 'https://valleprimev2.onrender.com' : '');

const BudgetWizard = ({ lot, onClose, obraName }) => {
    const { showToast } = useToast();
    const lotValue = parseFloat(lot.Valor_Terreno.replace(/\./g, '').replace(',', '.')) || 0;

    // Wizard state
    const [currentStep, setCurrentStep] = useState(1);
    const [maxStep, setMaxStep] = useState(1); // Track highest step reached

    // Form data (shared across steps)
    const [formData, setFormData] = useState({
        // Step 1: Lot Info
        discountActive: false,
        discountPercent: 20,

        // Step 2: Entrada
        entradaEnabled: false,
        entradaValue: 0,
        entradaQtdParcelas: 1,
        entradaFirstDate: new Date().toISOString().split('T')[0],

        // Step 3: Sinal
        downPaymentPercent: 5,
        sinalLines: [{ qtd: 1, value: 0 }],
        sinalLineDates: [new Date().toISOString().split('T')[0]],
        sinalDiscountEnabled: false,
        sinalDiscountValue: 0,
        skipSinalEnabled: false,

        // Step 4: Saldo
        balanceInstallments: 200,
        saldoFirstDate: new Date().toISOString().split('T')[0],

        // Step 5: Proposal
        propostaDate: new Date().toISOString().split('T')[0],
    });

    // UI state
    const [showClientForm, setShowClientForm] = useState(false);
    const [showClientSelection, setShowClientSelection] = useState(false);
    const [selectedClientData, setSelectedClientData] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    // Calculations
    const downPaymentTotal = lotValue * (formData.downPaymentPercent / 100);
    const sinalDiscountedTotal = formData.sinalDiscountEnabled
        ? Math.max(0, downPaymentTotal - (parseFloat(formData.sinalDiscountValue) || 0))
        : downPaymentTotal;
    const entradaAmount = formData.entradaEnabled ? parseFloat(formData.entradaValue) || 0 : 0;

    const getDiscountedValues = () => {
        const balance = lotValue - downPaymentTotal - entradaAmount;
        const steps = formData.discountPercent / 10;
        let discountedBalance = balance;
        for (let i = 0; i < steps; i++) {
            discountedBalance = discountedBalance * 0.90;
        }
        return {
            openBalance: discountedBalance,
            totalWithDiscount: discountedBalance + downPaymentTotal + entradaAmount
        };
    };

    const { openBalance, totalWithDiscount } = getDiscountedValues();
    const remainingBalance = lotValue - downPaymentTotal - entradaAmount;
    const effectiveRemainingBalance = formData.discountActive ? openBalance : remainingBalance;
    const effectiveBalanceInstallmentValue = formData.balanceInstallments > 0
        ? effectiveRemainingBalance / formData.balanceInstallments
        : 0;

    // Auto-calculate first sinal line value
    useEffect(() => {
        if (formData.skipSinalEnabled) return;
        setFormData(prev => {
            if (prev.sinalLines.length !== 1) return prev;
            return {
                ...prev,
                sinalLines: [{ qtd: prev.sinalLines[0].qtd, value: sinalDiscountedTotal }]
            };
        });
    }, [sinalDiscountedTotal, formData.skipSinalEnabled]);

    // Helper functions
    const formatCurrency = (val) => {
        if (!val || !Number.isFinite(val)) return 'R$ 0,00';
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const getPlanType = (n) => {
        if (n === 1) return 'À Vista';
        if (n <= 36) return 'Parcelas Fixas';
        if (n <= 72) return 'Parcelas Corrigidas';
        return 'Parcelas Reajustáveis';
    };

    // Navigation
    // Navigation
    const canProceed = () => {
        switch (currentStep) {
            case 1: // Lot info + Entrada
                return true;
            case 2: // Sinal
                return formData.skipSinalEnabled || formData.sinalLines.length > 0;
            case 3: // Saldo
                return formData.balanceInstallments > 0;
            case 4: // Summary
                return true;
            default:
                return false;
        }
    };

    const handleNext = () => {
        if (canProceed()) {
            const nextStep = currentStep + 1;
            setCurrentStep(nextStep);
            setMaxStep(Math.max(maxStep, nextStep));
        }
    };

    const handleBack = () => {
        const prevStep = currentStep - 1;
        setCurrentStep(prevStep);
    };

    const updateFormData = (updates) => {
        setFormData(prev => ({ ...prev, ...updates }));
    };

    // Sinal management
    const addSinalLine = () => {
        const updatedLines = [...formData.sinalLines];
        // If we only have 1 line, zero it out so the user can distribute manually
        if (updatedLines.length === 1) {
            updatedLines[0].value = 0;
        }
        updateFormData({
            sinalLines: [...updatedLines, { qtd: 1, value: 0 }],
            sinalLineDates: [...formData.sinalLineDates, new Date().toISOString().split('T')[0]]
        });
    };

    const removeSinalLine = (index) => {
        const newLines = formData.sinalLines.filter((_, i) => i !== index);
        const newDates = formData.sinalLineDates.filter((_, i) => i !== index);

        // If removing the last line, reset to single line mode with correct value
        if (newLines.length === 0) {
            updateFormData({
                sinalLines: [{ qtd: 1, value: sinalDiscountedTotal }],
                sinalLineDates: [new Date().toISOString().split('T')[0]]
            });
        } else {
            if (newLines.length === 1) {
                newLines[0].value = sinalDiscountedTotal;
            }
            updateFormData({
                sinalLines: newLines,
                sinalLineDates: newDates
            });
        }
    };

    const updateSinalLine = (index, field, value) => {
        const updated = [...formData.sinalLines];
        // Allow empty string to permit clearing the input on mobile
        if (value === "") {
            updated[index][field] = "";
        } else if (field === 'qtd') {
            updated[index][field] = value; // Keep as string or raw value for now
        } else if (field === 'value') {
            updated[index][field] = value;
        }
        updateFormData({ sinalLines: updated });
    };

    // Generate message
    const getMessage = () => {
        const subdivision = obraName || lot.Descricao_Empreendimento || 'VALLE';
        const currentObra = OBRAS.find(o => o.descricao === subdivision || o.codigo === lot.Obra);
        const cityState = currentObra ? `${currentObra.cidade} - ${currentObra.uf}` : '';
        const isLocationRedundant = cityState && subdivision.toLowerCase().includes(currentObra.cidade.toLowerCase());
        const locationInfo = isLocationRedundant ? '' : cityState;

        const checkMeasure = (val) => val && val.toString() !== '0,00' && val.toString() !== '0.00' && val.toString() !== '- / -';
        const measures = [
            checkMeasure(lot.M_Frente) && `Frente: ${lot.M_Frente}m`,
            checkMeasure(lot.M_Fundo) && `Fundo: ${lot.M_Fundo}m`,
            checkMeasure(lot.M_Lado_Direito) && `L.Dir: ${lot.M_Lado_Direito}m`,
            checkMeasure(lot.M_Lado_Esquerdo) && `L.Esq: ${lot.M_Lado_Esquerdo}m`,
            checkMeasure(lot.Chanfro) && `Chanfro: ${lot.Chanfro}m`
        ].filter(Boolean).join(' | ');

        let priceSection = `💰 *Valor do Lote: ${formatCurrency(lotValue)}*`;
        if (formData.discountActive) {
            priceSection = `💰 *Valor do Lote:* ~${formatCurrency(lotValue)}~\\n🔥 *Oferta Especial (${formData.discountPercent}% OFF):* ${formatCurrency(totalWithDiscount)}`;
        }

        let entradaSection = '';
        if (formData.entradaEnabled && entradaAmount > 0) {
            entradaSection = `\\n💵 *Entrada:* ${formatCurrency(entradaAmount)} (À Vista)`;
        }

        const sinalLines = formData.sinalLines || [];
        const sinalSection = sinalLines.map((line) => {
            const lineQtd = parseInt(line.qtd) || 1;
            const lineValue = (parseFloat(line.value) || 0) / lineQtd;
            return `   ${lineQtd}x de ${formatCurrency(lineValue)}`;
        }).join('\\n');

        return `
🏡 *${subdivision.toUpperCase()}*
📍 ${locationInfo}
📍 Quadra ${lot.QD} | Lote ${lot.LT}
📐 Área: ${lot.M2} m²
${measures ? `📏 ${measures}` : ''}

${priceSection}
${entradaSection}

💳 *Sinal (${formData.downPaymentPercent}%):* ${formatCurrency(downPaymentTotal)}
${sinalSection}

📊 *Saldo a Parcelar:* ${formatCurrency(effectiveRemainingBalance)}
   ${formData.balanceInstallments}x de ${formatCurrency(effectiveBalanceInstallmentValue)} (${getPlanType(formData.balanceInstallments)})
        `.trim();
    };

    const handleCopyMessage = async () => {
        const text = getMessage();
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } else {
                throw new Error('Clipboard API unavailable');
            }
        } catch {
            // Fallback for mobile/non-secure contexts
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed'; // Avoid scrolling to bottom
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                }
            } catch (copyErr) {
                console.error('Fallback copy failed:', copyErr);
            }
            document.body.removeChild(textArea);
        }
    };

    const handleWhatsAppShare = () => {
        const message = encodeURIComponent(getMessage());
        window.open(`https://wa.me/?text=${message}`, '_blank');
    };

    const handleOpenClientForm = () => {
        setShowClientSelection(true);
    };

    const handleSelectClient = (client) => {
        // Keep the full client object with id and data
        setSelectedClientData(client);
        setShowClientSelection(false);
        setShowClientForm(true);
    };

    const handleNewClient = () => {
        setSelectedClientData(null);
        setShowClientSelection(false);
        setShowClientForm(true);
    };

    const handleGeneratePDF = async (clientData) => {
        // Implementation similar to BudgetModal
        setIsGenerating(true);
        setShowClientForm(false);

        try {
            // Include client_id if editing an existing client
            const dataToSave = {
                ...clientData,
                client_id: selectedClientData?.id || null
            };
            console.log('[BudgetWizard] Saving client:', { 
                isEdit: !!selectedClientData?.id, 
                clientId: dataToSave.client_id 
            });
            
            await saveClient(dataToSave);
        } catch (err) {
            console.error('Error saving client:', err);
        }

        // Build sinal data for backend
        const sinalData = {};

        // Helper to format currency for backend (Brazilian format: 1.234,56)
        const formatCurrencyForBackend = (value) => {
            const num = parseFloat(value);
            if (!num || !Number.isFinite(num)) return '0,00';
            return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        formData.sinalLines.forEach((line, idx) => {
            const prefix = idx === 0 ? 'sinal_l1' : idx === 1 ? 'sinal_l2' : 'sinal_bloco2';

            // Limit to 3 blocks as defined in posicoes_campos.json (l1, l2, bloco2)
            if (idx > 2) return;

            // Parse date manually to avoid timezone issues
            const dateStr = formData.sinalLineDates[idx] || new Date().toISOString().split('T')[0];
            const [year, month, day] = dateStr.split('-');

            const lineVal = parseFloat(line.value) || 0;
            const lineQtd = parseInt(line.qtd) || 1;
            const parcelaValue = lineVal / lineQtd;

            sinalData[`${prefix}_qtd_parcelas`] = lineQtd.toString().padStart(2, '0');
            sinalData[`${prefix}_valor_parcela`] = formatCurrencyForBackend(parcelaValue);
            sinalData[`${prefix}_dia`] = day;
            sinalData[`${prefix}_mes`] = month;
            sinalData[`${prefix}_ano`] = year;
            sinalData[`${prefix}_periodicidade`] = lineQtd > 1 ? 'MENSAL' : 'ÚNICA';
        });

        // Build request payload with all fields needed by backend
        const saldoDate = new Date(formData.saldoFirstDate);
        const payload = {
            lot,
            obraName,
            lotValue,
            logradouro: lot.Logradouro || '',
            downPaymentTotal: sinalDiscountedTotal,
            // Maps all sinal lines
            ...sinalData,
            // Entrada
            entradaEnabled: formData.entradaEnabled,
            entradaValue: entradaAmount,
            entrada_qtd_parcelas: formData.entradaQtdParcelas.toString().padStart(2, '0'),
            entrada_valor_parcela: formatCurrencyForBackend((parseFloat(entradaAmount) || 0) / (parseInt(formData.entradaQtdParcelas) || 1)),
            entrada_dia: formData.entradaFirstDate.split('-')[2],
            entrada_mes: formData.entradaFirstDate.split('-')[1],
            entrada_ano: formData.entradaFirstDate.split('-')[0],
            entrada_periodicidade: formData.entradaQtdParcelas > 1 ? 'MENSAL' : 'ÚNICA',
            // Saldo (Balance)
            remainingBalance: effectiveRemainingBalance,
            balanceInstallments: formData.balanceInstallments,
            // Dates
            proposta_data: formData.propostaDate,
            saldo_dia: formData.saldoFirstDate.split('-')[2],
            saldo_mes: (saldoDate.getMonth() + 1).toString().padStart(2, '0'),
            saldo_ano: saldoDate.getFullYear().toString(),
            // Skip sinal flag 
            skipSinal: formData.skipSinalEnabled,
            // Client data
            ...clientData
        };

        try {
            const proposalUrl = API_BASE_URL ? `${API_BASE_URL}/api/generate_proposal` : '/api/generate_proposal';
            const response = await fetch(proposalUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                window.open(url, '_blank');
                // Show success toast instead of closing
                showToast('✅ Proposta gerada com sucesso! Abrindo em nova aba...', 'success');
                // Don't close wizard - user can close manually or generate another
            } else {
                showToast('Erro ao gerar proposta. Tente novamente.', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('Erro ao conectar com o servidor.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    // Render step content
    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return <Step1LotInfo
                    lotValue={lotValue}
                    lot={lot}
                    formData={formData}
                    updateFormData={updateFormData}
                    formatCurrency={formatCurrency}
                    totalWithDiscount={totalWithDiscount}
                    getPlanType={getPlanType}
                    obraName={obraName}
                />;
            case 2:
                return <Step3Sinal
                    formData={formData}
                    updateFormData={updateFormData}
                    formatCurrency={formatCurrency}
                    downPaymentTotal={downPaymentTotal}
                    sinalDiscountedTotal={sinalDiscountedTotal}
                    addSinalLine={addSinalLine}
                    removeSinalLine={removeSinalLine}
                    updateSinalLine={updateSinalLine}
                />;
            case 3:
                return <Step4Saldo
                    formData={formData}
                    updateFormData={updateFormData}
                    formatCurrency={formatCurrency}
                    effectiveRemainingBalance={effectiveRemainingBalance}
                    effectiveBalanceInstallmentValue={effectiveBalanceInstallmentValue}
                    getPlanType={getPlanType}
                />;
            case 4:
                return <Step5Summary
                    lot={lot}
                    obraName={obraName}
                    formData={formData}
                    updateFormData={updateFormData}
                    formatCurrency={formatCurrency}
                    lotValue={lotValue}
                    totalWithDiscount={totalWithDiscount}
                    downPaymentTotal={downPaymentTotal}
                    entradaAmount={entradaAmount}
                    effectiveRemainingBalance={effectiveRemainingBalance}
                    effectiveBalanceInstallmentValue={effectiveBalanceInstallmentValue}
                    handleCopyMessage={handleCopyMessage}
                    handleWhatsAppShare={handleWhatsAppShare}
                    copied={copied}
                />;
            default:
                return null;
        }
    };

    // Calculate actual step number
    const getActualStepNumber = () => currentStep;
    const getActualTotalSteps = () => 4;

    return (
        <>
            <div className={`wizard-overlay ${showClientSelection || showClientForm ? 'wizard-hidden' : ''}`}>
                <div className="wizard-container">
                    {/* Header */}
                    <div className="wizard-header">
                        <div className="wizard-header-content">
                            <img src={logo} alt="Valle Logo" className="wizard-logo" />
                            <div className="wizard-title-section">
                                <h2>Orçamento do Lote</h2>
                                <p>Quadra {lot.QD} • Lote {lot.LT}</p>
                            </div>
                        </div>
                        <button className="wizard-close-btn" onClick={onClose}>
                            <X size={24} />
                        </button>
                    </div>

                    {/* Progress */}
                    <div className="wizard-progress-section">
                        <div className="wizard-progress-text">
                            Etapa {getActualStepNumber()} de {getActualTotalSteps()}
                        </div>
                        <div className="wizard-progress-bar">
                            <div
                                className="wizard-progress-fill"
                                style={{ width: `${(getActualStepNumber() / getActualTotalSteps()) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Body */}
                    <div className="wizard-body">
                        {renderStepContent()}
                    </div>

                    {/* Footer */}
                    <div className="wizard-footer">
                        {currentStep > 1 && (
                            <button className="wizard-btn wizard-btn-secondary" onClick={handleBack}>
                                <ChevronLeft size={20} />
                                Voltar
                            </button>
                        )}
                        {currentStep < getActualTotalSteps() ? (
                            <button
                                className="wizard-btn wizard-btn-primary"
                                onClick={handleNext}
                                disabled={!canProceed()}
                            >
                                Próximo
                                <ChevronRight size={20} />
                            </button>
                        ) : (
                            <button
                                className="wizard-btn wizard-btn-success"
                                onClick={handleOpenClientForm}
                                disabled={isGenerating}
                            >
                                <Check size={20} />
                                Gerar Proposta
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {showClientSelection && (
                <ClientSelectionModal
                    onClose={() => setShowClientSelection(false)}
                    onSelectClient={handleSelectClient}
                    onNewClient={handleNewClient}
                />
            )}
            {showClientForm && (
                <ClientFormModal
                    onClose={() => setShowClientForm(false)}
                    onConfirm={handleGeneratePDF}
                    initialData={selectedClientData?.data || selectedClientData}
                    clientId={selectedClientData?.id}
                    lot={lot}
                    obraName={obraName}
                />
            )}
        </>
    );
};

// Step Components (simplified versions)
const Step1LotInfo = ({ lotValue, lot, formData, updateFormData, formatCurrency, totalWithDiscount, getPlanType, obraName }) => {
    const subdivisionName = obraName || lot.Descricao_Empreendimento || 'VALLE';
    const currentObra = OBRAS.find(o => o.descricao === subdivisionName || o.codigo === lot.Obra);
    const cityState = currentObra ? `${currentObra.cidade} - ${currentObra.uf}` : '';

    // Check if the subdivision name already contains the city name to avoid redundancy
    const isLocationRedundant = cityState && subdivisionName.toLowerCase().includes(currentObra.cidade.toLowerCase());
    const locationInfo = isLocationRedundant ? '' : cityState;

    return (
        <div className="wizard-step">
            <h3 className="step-title">Informações do Lote</h3>

            <div className="value-card">
                <label>Valor Total do Lote</label>
                <div className="value-display-large">
                    {formData.discountActive ? formatCurrency(totalWithDiscount) : formatCurrency(lotValue)}
                </div>
                {formData.discountActive && (
                    <div className="old-price-small">{formatCurrency(lotValue)}</div>
                )}
            </div>

            <div className="form-group">
                <div className="toggle-row" onClick={() => updateFormData({ discountActive: !formData.discountActive })}>
                    <span>Desconto Especial?</span>
                    <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={formData.discountActive}
                            onChange={(e) => updateFormData({ discountActive: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
            </div>

            {formData.discountActive && (
                <div className="discount-options">
                    {[10, 20, 30].map(pct => (
                        <button
                            key={pct}
                            className={`discount-option-btn ${formData.discountPercent === pct ? 'active' : ''}`}
                            onClick={() => updateFormData({ discountPercent: pct })}
                        >
                            {pct}% OFF
                        </button>
                    ))}
                </div>
            )}

            <div className="lot-details-card">
                <div className="lot-card-header">
                    <div className="lot-card-obra">{subdivisionName}</div>
                    {locationInfo && <div className="lot-card-location">{locationInfo}</div>}
                </div>
                <div className="lot-badge-row">
                    <div className="lot-badge">
                        <Layers size={14} />
                        <span>QD: <strong>{lot.QD}</strong></span>
                    </div>
                    <div className="lot-badge">
                        <MapPin size={14} />
                        <span>LT: <strong>{lot.LT}</strong></span>
                    </div>
                    <div className="lot-badge area">
                        <Maximize size={14} />
                        <span><strong>{lot.M2}m²</strong></span>
                    </div>
                </div>

                <div className="measurements-container">
                    <div className="measurements-header">
                        <Info size={14} />
                        <span>Medidas do Lote</span>
                    </div>
                    <div className="measurements-grid-premium">
                        {lot.M_Frente && lot.M_Frente !== '0,00' && (
                            <div className="measure-card">
                                <span className="m-label">Frente</span>
                                <span className="m-value">{lot.M_Frente}m</span>
                            </div>
                        )}
                        {lot.M_Fundo && lot.M_Fundo !== '0,00' && (
                            <div className="measure-card">
                                <span className="m-label">Fundo</span>
                                <span className="m-value">{lot.M_Fundo}m</span>
                            </div>
                        )}
                        {lot.M_Lado_Direito && lot.M_Lado_Direito !== '0,00' && (
                            <div className="measure-card">
                                <span className="m-label">L. Direito</span>
                                <span className="m-value">{lot.M_Lado_Direito}m</span>
                            </div>
                        )}
                        {lot.M_Lado_Esquerdo && lot.M_Lado_Esquerdo !== '0,00' && (
                            <div className="measure-card">
                                <span className="m-label">L. Esquerdo</span>
                                <span className="m-value">{lot.M_Lado_Esquerdo}m</span>
                            </div>
                        )}
                        {lot.Chanfro && lot.Chanfro !== '0,00' && (
                            <div className="measure-card chanfro">
                                <span className="m-label">Chanfro</span>
                                <span className="m-value">{lot.Chanfro}m</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="form-group">
                <div className="toggle-row" onClick={() => updateFormData({ entradaEnabled: !formData.entradaEnabled })}>
                    <span>Incluir Entrada?</span>
                    <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={formData.entradaEnabled}
                            onChange={(e) => updateFormData({ entradaEnabled: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
            </div>

            {formData.entradaEnabled && (
                <div className="wizard-step" style={{ padding: 0, marginTop: '1rem', animation: 'fadeIn 0.3s' }}>
                    <div className="form-group">
                        <label>Valor da Entrada (R$)</label>
                        <input
                            type="number"
                            inputMode="decimal"
                            className="wizard-input"
                            value={formData.entradaValue === 0 ? "" : formData.entradaValue}
                            onChange={(e) => updateFormData({ entradaValue: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0 })}
                            onFocus={(e) => e.target.select()}
                            placeholder="0,00"
                        />
                    </div>

                    <div className="form-group">
                        <label>Número de Parcelas</label>
                        <input
                            type="number"
                            inputMode="numeric"
                            className="wizard-input"
                            min="1"
                            max="12"
                            value={formData.entradaQtdParcelas || ""}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === "") {
                                    updateFormData({ entradaQtdParcelas: "" });
                                } else {
                                    const parsed = parseInt(val);
                                    if (!isNaN(parsed)) updateFormData({ entradaQtdParcelas: Math.min(12, Math.max(1, parsed)) });
                                }
                            }}
                            onFocus={(e) => e.target.select()}
                        />
                    </div>

                    <div className="result-card">
                        <div className="result-label">Valor por Parcela</div>
                        <div className="result-value">
                            {formatCurrency((parseFloat(formData.entradaValue) || 0) / (parseInt(formData.entradaQtdParcelas) || 1))}
                        </div>
                        <div className="result-subtitle">
                            {formData.entradaQtdParcelas}x {getPlanType(formData.entradaQtdParcelas)}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Data da 1ª Parcela</label>
                        <input
                            type="date"
                            className="wizard-input"
                            value={formData.entradaFirstDate}
                            onChange={(e) => updateFormData({ entradaFirstDate: e.target.value })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const Step3Sinal = ({ formData, updateFormData, formatCurrency, downPaymentTotal, sinalDiscountedTotal, addSinalLine, removeSinalLine, updateSinalLine }) => {
    const totalSinalFromLines = formData.sinalLines.reduce((acc, line) => acc + (parseFloat(line.value) || 0), 0);
    const sinalDifference = sinalDiscountedTotal - totalSinalFromLines;

    return (
        <div className="wizard-step">
            <h3 className="step-title">Sinal ({formData.downPaymentPercent}%)</h3>

            <div className="value-card">
                <label>Valor Total do Sinal</label>
                <div className="value-display-medium">{formatCurrency(downPaymentTotal)}</div>
            </div>

            {formData.sinalLines.length === 1 ? (
                <div className="sinal-single-config">
                    <div className="form-group">
                        <label>Número de Parcelas</label>
                        <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="wizard-input"
                            min="1"
                            max="12"
                            value={formData.sinalLines[0].qtd || ""}
                            onChange={(e) => updateSinalLine(0, 'qtd', e.target.value)}
                            onFocus={(e) => e.target.select()}
                        />
                    </div>

                    <div className="result-card">
                        <div className="result-label">Valor por Parcela</div>
                        <div className="result-value">
                            {formatCurrency((parseFloat(sinalDiscountedTotal) || 0) / (parseInt(formData.sinalLines[0].qtd) || 1))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Data da 1ª Parcela</label>
                        <input
                            type="date"
                            className="wizard-input"
                            value={formData.sinalLineDates[0]}
                            onChange={(e) => {
                                const updated = [...formData.sinalLineDates];
                                updated[0] = e.target.value;
                                updateFormData({ sinalLineDates: updated });
                            }}
                        />
                    </div>
                </div>
            ) : (
                <div className="sinal-multiple-config">
                    {formData.sinalLines.map((line, idx) => (
                        <div key={idx} className="sinal-line-card">
                            <div className="sinal-line-header">
                                <span>Linha {idx + 1}</span>
                                <button
                                    className="remove-line-btn-small"
                                    onClick={() => removeSinalLine(idx)}
                                    title="Remover linha"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Qtd</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        className="wizard-input"
                                        min="1"
                                        value={line.qtd ?? ""}
                                        onChange={(e) => updateSinalLine(idx, 'qtd', e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                    />
                                </div>
                                <div className="form-group flex-1">
                                    <label>Valor Total</label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        className="wizard-input"
                                        value={line.value ?? ""}
                                        onChange={(e) => updateSinalLine(idx, 'value', e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group flex-1">
                                    <label>1ª Parcela</label>
                                    <input
                                        type="date"
                                        className="wizard-input"
                                        value={formData.sinalLineDates[idx] || ""}
                                        onChange={(e) => {
                                            const updated = [...formData.sinalLineDates];
                                            updated[idx] = e.target.value;
                                            updateFormData({ sinalLineDates: updated });
                                        }}
                                    />
                                </div>
                                <div className="sinal-line-result flex-1" style={{ alignSelf: 'center', marginTop: '1.2rem' }}>
                                    = {formatCurrency((parseFloat(line.value) || 0) / (parseInt(line.qtd) || 1))} /mês
                                </div>
                            </div>
                        </div>
                    ))}

                    {Math.abs(sinalDifference) > 0.01 ? (
                        <div className={`sinal-difference-alert ${sinalDifference > 0 ? 'warning' : 'error'}`}>
                            {sinalDifference > 0
                                ? `Faltam ${formatCurrency(sinalDifference)}`
                                : `Excedente de ${formatCurrency(Math.abs(sinalDifference))}`}
                        </div>
                    ) : (
                        <div className="sinal-difference-alert success">
                            ✅ Valor do sinal fechado corretamente!
                        </div>
                    )}
                </div>
            )}

            <button className="wizard-btn-add" onClick={addSinalLine}>
                <Plus size={18} />
                Adicionar Linha de Sinal
            </button>
        </div>
    );
};

const Step4Saldo = ({ formData, updateFormData, formatCurrency, effectiveRemainingBalance, effectiveBalanceInstallmentValue, getPlanType }) => (
    <div className="wizard-step">
        <h3 className="step-title">Saldo a Parcelar</h3>

        <div className="value-card">
            <label>Valor do Saldo</label>
            <div className="value-display-medium">{formatCurrency(effectiveRemainingBalance)}</div>
        </div>

        <div className="form-group">
            <label>Número de Parcelas (1-200)</label>
            <input
                type="number"
                inputMode="numeric"
                className="wizard-input"
                min="1"
                max="200"
                value={formData.balanceInstallments || ""}
                onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                        updateFormData({ balanceInstallments: "" });
                    } else {
                        const parsed = parseInt(val);
                        if (!isNaN(parsed)) updateFormData({ balanceInstallments: Math.min(200, Math.max(1, parsed)) });
                    }
                }}
                onFocus={(e) => e.target.select()}
            />
        </div>

        <div className="result-card">
            <div className="result-label">Valor por Parcela</div>
            <div className="result-value">{formatCurrency(effectiveBalanceInstallmentValue)}</div>
            <div className="result-subtitle">
                {formData.balanceInstallments}x {getPlanType(formData.balanceInstallments)}
            </div>
        </div>

        <div className="form-group">
            <label>Data da 1ª Parcela do Saldo</label>
            <input
                type="date"
                className="wizard-input"
                value={formData.saldoFirstDate}
                onChange={(e) => updateFormData({ saldoFirstDate: e.target.value })}
            />
        </div>
    </div>
);

const Step5Summary = ({
    lot, obraName, formData, updateFormData, formatCurrency, lotValue, totalWithDiscount,
    downPaymentTotal, entradaAmount, effectiveRemainingBalance, effectiveBalanceInstallmentValue,
    handleCopyMessage, handleWhatsAppShare, copied
}) => {
    const subdivisionName = obraName || lot.Descricao_Empreendimento || 'VALLE';
    const currentObra = OBRAS.find(o => o.descricao === subdivisionName || o.codigo === lot.Obra);
    const cityState = currentObra ? `${currentObra.cidade} - ${currentObra.uf}` : '';

    // Check if redundant
    const isLocationRedundant = cityState && subdivisionName.toLowerCase().includes(currentObra.cidade.toLowerCase());
    const locationLine = isLocationRedundant ? '' : cityState;

    return (
        <div className="wizard-step">
            <h3 className="step-title">Resumo da Proposta</h3>

            <div className="summary-section">
                <div className="summary-header-premium">
                    <div className="summary-obra-name">{subdivisionName}</div>
                    {locationLine && (
                        <div className="summary-location">
                            <MapPin size={12} />
                            <span>{locationLine}</span>
                        </div>
                    )}
                </div>

                <div className="summary-item">
                    <span className="summary-label">Lote</span>
                    <span className="summary-value">Quadra {lot.QD}, Lote {lot.LT}</span>
                </div>

                <div className="summary-item">
                    <span className="summary-label">Valor do Lote</span>
                    <span className="summary-value">
                        {formData.discountActive ? formatCurrency(totalWithDiscount) : formatCurrency(lotValue)}
                    </span>
                </div>

                {formData.entradaEnabled && entradaAmount > 0 && (
                    <div className="summary-item">
                        <span className="summary-label">Entrada</span>
                        <span className="summary-value">{formatCurrency(entradaAmount)}</span>
                    </div>
                )}

                <div className="summary-item">
                    <span className="summary-label">Sinal ({formData.downPaymentPercent}%)</span>
                    <span className="summary-value">{formatCurrency(downPaymentTotal)}</span>
                </div>

                <div className="summary-item">
                    <span className="summary-label">Saldo a Parcelar</span>
                    <span className="summary-value">{formatCurrency(effectiveRemainingBalance)}</span>
                </div>

                <div className="summary-item">
                    <span className="summary-label">Parcelas do Saldo</span>
                    <span className="summary-value">
                        {formData.balanceInstallments}x de {formatCurrency(effectiveBalanceInstallmentValue)}
                    </span>
                </div>
            </div>

            <div className="form-group">
                <label>Data da Proposta</label>
                <input
                    type="date"
                    className="wizard-input"
                    value={formData.propostaDate}
                    onChange={(e) => updateFormData({ propostaDate: e.target.value })}
                />
            </div>

            <div className="summary-actions">
                <button className="wizard-action-btn" onClick={handleCopyMessage}>
                    {copied ? <Check size={18} /> : <ClipboardCopy size={18} />}
                    {copied ? 'Copiado!' : 'Copiar Mensagem'}
                </button>
                <button className="wizard-action-btn" onClick={handleWhatsAppShare}>
                    <Send size={18} />
                    Enviar WhatsApp
                </button>
            </div>
        </div>
    );
};

export default BudgetWizard;
