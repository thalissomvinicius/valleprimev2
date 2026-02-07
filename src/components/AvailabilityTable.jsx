import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import Loader from './Loader';
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

const SKELETON_ROWS = 10;

const SortableHeader = ({ label, mobileLabel, sortKey, onSort, sortConfig }) => {
    const renderSortIcon = (key) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
    };

    return (
        <th onClick={() => onSort(sortKey)} className="sortable-header">
            <div className="header-content">
                <span className="hide-mobile">{label}</span>
                <span className="show-mobile">{mobileLabel}</span>
                {renderSortIcon(sortKey)}
            </div>
        </th>
    );
};

const AvailabilityTable = ({ data, loading, onRowClick, onSort, sortConfig }) => {
    if (loading) {
        return (
            <div className="table-container">
                <table className="data-table loading-skeleton">
                    <thead>
                        <tr>
                            <th><span className="hide-mobile">Quadra</span><span className="show-mobile">QD</span></th>
                            <th><span className="hide-mobile">Lote</span><span className="show-mobile">LT</span></th>
                            <th>M²</th>
                            <th><span className="hide-mobile">Valor</span><span className="show-mobile">R$</span></th>
                            <th><span className="hide-mobile">Status</span><span className="show-mobile">ST.</span></th>
                            <th><span className="hide-mobile">Logradouro</span><span className="show-mobile">LOG.</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                            <tr key={i}>
                                <td><span className="skeleton" /></td>
                                <td><span className="skeleton" /></td>
                                <td><span className="skeleton" /></td>
                                <td><span className="skeleton" /></td>
                                <td><span className="skeleton" /></td>
                                <td><span className="skeleton skeleton-long" /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <Loader label="Carregando lotes..." size="sm" />
            </div>
        );
    }

    if (!data || data.length === 0) {
        return <div className="no-results">Nenhum lote encontrado.</div>;
    }

    return (
        <div className="table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        <SortableHeader label="Quadra" mobileLabel="QD" sortKey="QD" onSort={onSort} sortConfig={sortConfig} />
                        <SortableHeader label="Lote" mobileLabel="LT" sortKey="LT" onSort={onSort} sortConfig={sortConfig} />
                        <SortableHeader label="M²" mobileLabel="M²" sortKey="M2" onSort={onSort} sortConfig={sortConfig} />
                        <SortableHeader label="Valor" mobileLabel="R$" sortKey="Valor_Terreno" onSort={onSort} sortConfig={sortConfig} />
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
