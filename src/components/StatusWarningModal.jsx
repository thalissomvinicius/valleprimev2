import React from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle, ArrowRight, X } from 'lucide-react';
import './StatusWarningModal.css';

const StatusWarningModal = ({ lot, onClose, onConfirm }) => {
    if (!lot) return null;

    const status = lot.Status_Terreno || '';

    const getWarningContent = () => {
        if (status.includes('1 - Vendido')) {
            return {
                icon: <XCircle size={48} className="warning-icon error" />,
                title: 'Lote Vendido',
                message: 'Esse lote encontra-se vendido, deseja mesmo assim seguir com a proposta de venda? Lembrando que o mesmo passará por aprovação do setor de vendas.',
                color: 'var(--danger-color)'
            };
        }
        if (status.includes('2 - Reservado')) {
            return {
                icon: <AlertTriangle size={48} className="warning-icon warning" />,
                title: 'Lote Reservado',
                message: 'Atenção, esse lote encontra-se no status reservado, verifique antes de realizar o orçamento ou proposta se o mesmo já está reservado para você. Deseja continuar a simulação/proposta?',
                color: 'var(--warning-color)'
            };
        }
        if (status.includes('4 - Quitado')) {
            return {
                icon: <CheckCircle size={48} className="warning-icon success" />,
                title: 'Lote Quitado',
                message: 'Atenção, esse lote se encontra quitado em sistema, deseja continuar com a realização do orçamento/proposta?',
                color: 'var(--success-color)'
            };
        }
        if (status.includes('7 - Suspenso')) {
            return {
                icon: <AlertTriangle size={48} className="warning-icon warning" />,
                title: 'Lote Suspenso',
                message: 'Atenção, esse lote se encontra no status suspenso, e não disponível para venda, deseja continuar com o orçamento/proposta?',
                color: 'var(--warning-color)'
            };
        }
        if (status.includes('8 - Fora de venda')) {
            return {
                icon: <XCircle size={48} className="warning-icon error" />,
                title: 'Fora de Venda',
                message: 'Atenção, esse lote está fora de venda, reservado pela diretoria. Deseja continuar com o orçamento/proposta?',
                color: 'var(--danger-color)'
            };
        }

        return {
            icon: <Info size={48} className="warning-icon info" />,
            title: 'Atenção',
            message: `Esse lote possui o status "${status}". Deseja continuar com o orçamento/proposta?`,
            color: 'var(--accent-color)'
        };
    };

    const content = getWarningContent();

    return (
        <div className="warning-modal-overlay animate-fade-in" onClick={onClose}>
            <div className="warning-modal-content animate-scale-up" onClick={e => e.stopPropagation()}>
                <button className="warning-close-btn" onClick={onClose}>
                    <X size={20} />
                </button>

                <div className="warning-header" style={{ borderBottom: `3px solid ${content.color}` }}>
                    {content.icon}
                    <h2>{content.title}</h2>
                    <div className="lot-badge">
                        QD {lot.QD} - LT {lot.LT}
                    </div>
                </div>

                <div className="warning-body">
                    <p className="warning-message">{content.message}</p>
                    <div className="approval-notice">
                        <Info size={16} />
                        <span>Lembrando que todos os status passarão pelo departamento de venda para verificar e aprovar a venda.</span>
                    </div>
                </div>

                <div className="warning-footer">
                    <button className="btn-warning-cancel" onClick={onClose}>
                        Cancelar
                    </button>
                    <button className="btn-warning-confirm" onClick={onConfirm}>
                        Continuar <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StatusWarningModal;
