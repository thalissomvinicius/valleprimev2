import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Home, FileText, Users, Shield, LogOut, Menu, X, TrendingUp } from 'lucide-react';
import logo from '../assets/Valle-logo-azul.png';
import { useAuth } from '../context/AuthContext';
import './Header.css';

const Header = ({ children, title }) => {
    const { currentUser, logout, isAdmin } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const closeMenu = () => setIsMenuOpen(false);

    return (
        <header className="app-header">
            <div className="header-container">
                <div className="header-left">
                    <Link to="/dashboard" className="logo-link">
                        <img src={logo} alt="Valle" className="logo" />
                    </Link>
                    {title && (
                        <>
                            <div className="header-divider"></div>
                            <div className="header-title-wrapper">
                                <span className="system-subtitle">SISTEMA VALLE</span>
                                <h1 className="header-title" title={title}>
                                    {title.replace('RESIDENCIAL ', '')}
                                </h1>
                            </div>
                        </>
                    )}
                </div>

                <div className="header-right">
                    {children}

                    {currentUser && (
                        <>
                            <button className="mobile-menu-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                            <nav className={`nav-links ${isMenuOpen ? 'open' : ''}`}>
                                <Link to="/dashboard" className="btn-clients-header" onClick={closeMenu} title="Dashboard">
                                    <LayoutDashboard size={18} />
                                    <span className="nav-text">Dashboard</span>
                                </Link>
                                <Link to="/disponibilidade" className="btn-clients-header" onClick={closeMenu} title="Disponibilidade">
                                    <Home size={18} />
                                    <span className="nav-text">Disponibilidade</span>
                                </Link>
                                <Link to="/propostas" className="btn-clients-header" onClick={closeMenu} title="Propostas">
                                    <FileText size={18} />
                                    <span className="nav-text">Propostas</span>
                                </Link>
                                <Link to="/corretores" className="btn-clients-header" onClick={closeMenu} title="Vendas/Corretores">
                                    <TrendingUp size={18} />
                                    <span className="nav-text">Vendas</span>
                                </Link>
                                <Link to="/clientes" className="btn-clients-header" onClick={closeMenu} title="Clientes">
                                    <Users size={18} />
                                    <span className="nav-text">Clientes</span>
                                </Link>
                                {isAdmin && (
                                    <Link to="/admin" className="btn-clients-header" onClick={closeMenu} title="Admin">
                                        <Shield size={18} />
                                        <span className="nav-text">Admin</span>
                                    </Link>
                                )}
                                <button className="btn-logout" onClick={() => { closeMenu(); logout(); }} title="Sair">
                                    <LogOut size={18} />
                                    <span className="nav-text">Sair</span>
                                </button>
                            </nav>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
