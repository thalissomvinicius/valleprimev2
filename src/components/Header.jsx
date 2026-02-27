import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/Valle-logo-azul.png';
import './Header.css';

const Header = ({ children, title }) => {
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
                </div>
            </div>
        </header>
    );
};

export default Header;
