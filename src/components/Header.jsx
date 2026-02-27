import React from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Home, FileText, Users, Shield, LogOut } from 'lucide-react';
import logo from '../assets/Valle-logo-azul.png';
import { useAuth } from '../context/AuthContext';
import './Header.css';

const Header = ({ children, title }) => {
    const { currentUser, logout, isAdmin } = useAuth();

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
                            <Link to="/dashboard" className="btn-clients-header" title="Dashboard">
                                <LayoutDashboard size={18} />
                                <span className="hide-mobile">Dashboard</span>
                            </Link>
                            <Link to="/disponibilidade" className="btn-clients-header" title="Disponibilidade">
                                <Home size={18} />
                                <span className="hide-mobile">Disponibilidade</span>
                            </Link>
                            <Link to="/propostas" className="btn-clients-header" title="Propostas">
                                <FileText size={18} />
                                <span className="hide-mobile">Propostas</span>
                            </Link>
                            <Link to="/clientes" className="btn-clients-header" title="Clientes">
                                <Users size={18} />
                                <span className="hide-mobile">Clientes</span>
                            </Link>
                            {isAdmin && (
                                <Link to="/admin" className="btn-clients-header" title="Admin">
                                    <Shield size={18} />
                                    <span className="hide-mobile">Admin</span>
                                </Link>
                            )}
                            <button className="btn-logout" onClick={logout} title="Sair">
                                <LogOut size={18} />
                                <span className="hide-mobile">Sair</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
