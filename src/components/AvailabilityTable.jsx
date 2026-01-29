import React from 'react';
import './AvailabilityTable.css';

const getStatusClass = (status) => {
    if (!status) return '';
    if (status.includes('0 - Disponível')) return 'status-available';
    if (status.includes('1 - Vendido')) return 'status-sold';
    if (status.includes('2 - Reservado')) return 'status-reserved';
    if (status.includes('4 - Quitado')) return 'status-quitado';
    if (status.includes('7 - Suspenso') || status.includes('8 - Fora de venda')) return 'status-suspended';
    return '';
};

// Format value to Brazilian Real (R$) currency format
const formatCurrency = (value) => {
    if (!value) return 'R$ 0,00';
    // If the value is already a formatted string, parse it first
    let numericValue;
    if (typeof value === 'string') {
        // Remove dots (thousands) and replace comma with dot (decimal)
        numericValue = parseFloat(value.replace(/\./g, '').replace(',', '.'));
    } else {
        numericValue = value;
    }

    if (isNaN(numericValue)) return 'R$ 0,00';

    // Format as Brazilian currency
    return numericValue.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

import { ArrowUp, ArrowDown } from 'lucide-react';

const AvailabilityTable = ({ data, loading, onRowClick, onSort, sortConfig }) => {
    if (loading) {
        return <div className="loading">Carregando dados...</div>;
    }

    if (!data || data.length === 0) {
        return <div className="no-results">Nenhum lote encontrado.</div>;
    }

    const renderSortIcon = (key) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
    };

    const SortableHeader = ({ label, mobileLabel, sortKey }) => (
        <th onClick={() => onSort(sortKey)} className="sortable-header">
            <div className="header-content">
                <span className="hide-mobile">{label}</span>
                <span className="show-mobile">{mobileLabel}</span>
                {renderSortIcon(sortKey)}
            </div>
        </th>
    );

    return (
        <div className="table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        <SortableHeader label="Quadra" mobileLabel="QD" sortKey="QD" />
                        <SortableHeader label="Lote" mobileLabel="LT" sortKey="LT" />
                        <SortableHeader label="M²" mobileLabel="M²" sortKey="M2" />
                        <SortableHeader label="Valor" mobileLabel="R$" sortKey="Valor_Terreno" />
                        <th><span className="hide-mobile">Status</span><span className="show-mobile">ST.</span></th>
                        <th><span className="hide-mobile">Logradouro</span><span className="show-mobile">LOG.</span></th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((item, index) => (
                        <tr
                            key={`${item.QD}-${item.LT}-${index}`}
                            onClick={() => onRowClick(item)}
                            className="clickable-row"
                        >
                            <td>{item.QD}</td>
                            <td>{item.LT}</td>
                            <td>{item.M2}</td>
                            <td className="value-cell">{formatCurrency(item.Valor_Terreno)}</td>
                            <td>
                                <span className={`status-badge ${getStatusClass(item.Status_Terreno)}`}>
                                    {item.Status_Terreno.includes(' - ') ? item.Status_Terreno.split(' - ')[1] : item.Status_Terreno}
                                </span>
                            </td>
                            <td>{item.Logradouro}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default AvailabilityTable;
