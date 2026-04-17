import React from 'react';
import { ServerCrash, MessageCircle } from 'lucide-react';
import './OfflineWarning.css';

const OfflineWarning = ({ message }) => {
    const adminPhone = "5591991697664";
    const whatsappMessage = encodeURIComponent("Olá Vinicius, estou tentando acessar o painel da VallePrime mas o sistema informa que a Ponte UAU parece estar Offline.");

    return (
        <div className="offline-warning-container">
            <div className="offline-warning-card">
                <div className="offline-icon-wrapper">
                    <ServerCrash size={48} className="offline-icon pulse-error" />
                </div>
                <h2>Conexão Perdida</h2>
                <p className="offline-message">
                    Não foi possível extrair os dados da base local. O Servidor UAU ou a Ponte de Conexão (Cloudflare Tunnel) pode estar offline.
                </p>
                <div className="offline-tech-details">
                    <strong>Detalhes Técnicos:</strong> {message || "Servidor inacessível"}
                </div>
                
                <div className="offline-action">
                    <p>Por favor, comunique ao Administrador do Sistema para religar o servidor de espelhamento.</p>
                    <a 
                        href={`https://wa.me/${adminPhone}?text=${whatsappMessage}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="offline-whatsapp-btn"
                    >
                        <MessageCircle size={20} />
                        Avisar Vinicius Dev
                    </a>
                </div>
            </div>
        </div>
    );
};

export default OfflineWarning;