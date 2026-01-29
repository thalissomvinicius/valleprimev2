import React, { useState } from 'react';
import { Search, Filter } from 'lucide-react';
import './SearchBar.css';

const SearchBar = ({ onSearch, allowedStatus = [], currentStatus = '' }) => {
    const [quadraTerm, setQuadraTerm] = useState('');
    const [loteTerm, setLoteTerm] = useState('');

    const handleQuadraChange = (e) => {
        const value = e.target.value.toUpperCase();
        setQuadraTerm(value);
        onSearch(prev => ({ ...prev, quadra: value }));
    };

    const handleLoteChange = (e) => {
        const value = e.target.value;
        setLoteTerm(value);
        onSearch(prev => ({ ...prev, lote: value }));
    };

    const handleStatusChange = (e) => {
        const value = e.target.value;
        onSearch(prev => ({ ...prev, status: value }));
    };

    return (
        <div className="search-bar-container animate-fade-in">
            <div className="search-filters">
                <div className="input-group">
                    <div className="input-wrapper">
                        <label className="input-label">Quadra</label>
                        <div className="input-with-icon">
                            <Search size={16} className="input-icon" />
                            <input
                                type="text"
                                placeholder="Buscar quadra..."
                                value={quadraTerm}
                                onChange={handleQuadraChange}
                                className="search-input quadra-input"
                            />
                        </div>
                    </div>
                    <div className="input-wrapper">
                        <label className="input-label">Lote</label>
                        <div className="input-with-icon">
                            <Search size={16} className="input-icon" />
                            <input
                                type="text"
                                placeholder="Buscar lote..."
                                value={loteTerm}
                                onChange={handleLoteChange}
                                className="search-input lote-input"
                            />
                        </div>
                    </div>
                </div>

                <div className="status-filter-wrapper">
                    <label className="input-label">Status do Lote</label>
                    <div className="input-with-icon">
                        <Filter size={16} className="input-icon" />
                        <select
                            value={currentStatus}
                            onChange={handleStatusChange}
                            className="status-select"
                        >
                            {allowedStatus.map(status => (
                                <option key={status.value} value={status.value}>
                                    {status.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SearchBar;
