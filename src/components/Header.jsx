import React from 'react';
import logo from '../assets/Valle-logo-azul.png';
import './Header.css';

const Header = ({ children, title }) => {
    return (
        <header className="app-header">
            <div className="container header-content">
                <div className="header-left">
                    <img src={logo} alt="Valle do Ipitinga" className="logo" />
                </div>

                <div className="header-center">
                    <h1 className="system-title">SISTEMA DE DISPONIBILIDADES</h1>
                    {title && (
                        <h2 className="lot-title">
                            <span className="hide-mobile">{title}</span>
                            <span className="show-mobile">{title.replace('RESIDENCIAL ', '')}</span>
                        </h2>
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
