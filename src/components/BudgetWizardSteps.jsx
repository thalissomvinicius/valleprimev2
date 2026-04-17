import React from 'react';
import { MapPin, Maximize, Plus, Trash2, Check, ClipboardCopy, Send, Info, Layers } from 'lucide-react';
import { OBRAS } from '../context/AuthContext';

export const Step1LotInfo = ({ lotValue, lot, formData, updateFormData, formatCurrency, totalWithDiscount, getPlanType, obraName }) => {
    const subdivisionName = obraName || lot?.Descricao_Empreendimento || 'VALLE';
    const currentObra = OBRAS.find(o => o.descricao === subdivisionName || o.codigo === lot?.Obra);
    const cityState = currentObra ? `${currentObra.cidade} - ${currentObra.uf}` : '';

    const isLocationRedundant = cityState && currentObra?.cidade && subdivisionName.toLowerCase().includes(currentObra.cidade.toLowerCase());
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
                <>
                    <div className="discount-warning-alert" style={{ background: 'rgba(237, 137, 54, 0.1)', border: '1px solid #ed8936', borderRadius: '8px', padding: '10px', fontSize: '0.8rem', color: '#c05621', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.4' }}>
                        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span><strong>Atenção:</strong> O Desconto Especial só é válido para os loteamentos com a devida permissão da Diretoria. Certifique-se da liberação antes de aplicar à proposta.</span>
                    </div>
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
                </>
            )}

            <div className="lot-details-card">
                <div className="lot-card-header">
                    <div className="lot-card-obra">{subdivisionName}</div>
                    {locationInfo && <div className="lot-card-location">{locationInfo}</div>}
                </div>
                <div className="lot-badge-row">
                    <div className="lot-badge">
                        <Layers size={14} />
                        <span>QD: <strong>{lot?.QD || '-'}</strong></span>
                    </div>
                    <div className="lot-badge">
                        <MapPin size={14} />
                        <span>LT: <strong>{lot?.LT || '-'}</strong></span>
                    </div>
                    <div className="lot-badge area">
                        <Maximize size={14} />
                        <span><strong>{lot?.M2 || '0'}m²</strong></span>
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

export const Step3Sinal = ({ formData, updateFormData, formatCurrency, downPaymentTotal, sinalDiscountedTotal, addSinalLine, removeSinalLine, updateSinalLine }) => {
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

export const Step4Saldo = ({ formData, updateFormData, formatCurrency, effectiveRemainingBalance, effectiveBalanceInstallmentValue, getPlanType }) => (
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

export const Step5Summary = ({
    lot, obraName, formData, updateFormData, formatCurrency, lotValue, totalWithDiscount,
    downPaymentTotal, entradaAmount, effectiveRemainingBalance, effectiveBalanceInstallmentValue,
    handleCopyMessage, handleWhatsAppShare, copied, getPlanType
}) => {
    const subdivisionName = obraName || lot?.Descricao_Empreendimento || 'VALLE';
    const currentObra = OBRAS.find(o => o.descricao === subdivisionName || o.codigo === lot?.Obra);
    const cityState = currentObra ? `${currentObra.cidade} - ${currentObra.uf}` : '';

    const isLocationRedundant = cityState && currentObra?.cidade && subdivisionName.toLowerCase().includes(currentObra.cidade.toLowerCase());
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
                    <span className="summary-value">Quadra {lot?.QD || '-'}, Lote {lot?.LT || '-'}</span>
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
                    <span className="summary-value">
                        {formatCurrency(downPaymentTotal)}
                        {formData.sinalLines && formData.sinalLines.length > 0 && (
                            ` (${formData.sinalLines.reduce((acc, line) => acc + (parseInt(line.qtd) || 1), 0)}x)`
                        )}
                    </span>
                </div>

                <div className="summary-item">
                    <span className="summary-label">Saldo a Parcelar</span>
                    <span className="summary-value">{formatCurrency(effectiveRemainingBalance)}</span>
                </div>

                <div className="summary-item">
                    <span className="summary-label">Parcelas do Saldo</span>
                    <span className="summary-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <span>{formData.balanceInstallments}x de {formatCurrency(effectiveBalanceInstallmentValue)}</span>
                        <small style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {getPlanType ? getPlanType(formData.balanceInstallments) : ''}
                        </small>
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
