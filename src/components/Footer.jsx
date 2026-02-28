import React from 'react';
import './Footer.css';

const Footer = ({ lastUpdate }) => {
    return (
        <footer className="global-footer">
            <div className="footer-content">
                <p className="footer-credits">
                    Desenvolvido por{' '}
                    <a
                        href="https://wa.me/5591991697664"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="footer-link"
                    >
                        <strong>Vinicius Dev</strong>
                    </a>
                </p>
                <p className="footer-copyright">
                    © {new Date().getFullYear()} Valle Prime
                </p>
                {lastUpdate && (
                    <p className="footer-last-update">
                        Última atualização: {lastUpdate}
                    </p>
                )}
            </div>
        </footer>
    );
};

export default Footer;
