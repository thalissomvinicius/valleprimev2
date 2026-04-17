import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, ChevronRight, Bot, Info } from 'lucide-react';
import './HelpBot.css';

const FAQ_OPTIONS = [
    { 
        id: 'disp', 
        label: 'Ver Disponibilidade', 
        text: 'Para ver as disponibilidades, acesse a tela inicial clicando em "Disponibilidade". O mapa exibirá os lotes com cores: Verde (Livre), Amarelo (Reservado) e Vermelho (Vendido). Clique em um lote verde para ver os valores.' 
    },
    { 
        id: 'simular', 
        label: 'Como Simular?', 
        text: 'No mapa, clique em um lote disponível (Verde). Um painel se abrirá mostrando a entrada mínima. Você pode alterar as parcelas ou o valor do sinal, e gerar a proposta ali mesmo!' 
    },
    { 
        id: 'vendas', 
        label: 'Acompanhar Vendas', 
        text: 'Sua performance fica no painel de "Vendas". Lá você pode acompanhar o % de parcelas pagas, seu VGV atualizado e extrato individual de comissão.' 
    },
    { 
        id: 'admin', 
        label: 'Sem Permissão?', 
        text: 'Se alguma obra não aparece ou você não consegue ver "Vendas", solicite liberação ao seu Administrador Supremo. Ele pode liberar obras individualmente pelo Painel Admin.' 
    },
    { 
        id: 'suporte', 
        label: 'Falar com Suporte WhatsApp', 
        isContact: true 
    }
];

const HelpBot = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [chatHistory, setChatHistory] = useState([
        { role: 'bot', text: 'Olá! Sou o assistente do Valle Prime. Como posso te ajudar hoje?' }
    ]);
    const bodyRef = useRef(null);

    // Auto-scroll para a última mensagem
    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [chatHistory, isOpen]);

    const handleOptionSelect = (opt) => {
        if (opt.isContact) {
            // WHATSAPP DO DESENVOLVEDOR / SUPORTE
            const num = '5591991697664';
            const msg = encodeURIComponent("Olá Vinicius (Suporte VallePrime), preciso de uma ajuda técnica com o Sistema!");
            window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
            return;
        }

        // Adiciona a pergunta do usuario
        setChatHistory(prev => [...prev, { role: 'user', text: opt.label }]);

        // Simula digitando...
        setTimeout(() => {
            setChatHistory(prev => [...prev, { role: 'bot', text: opt.text }]);
        }, 600);
    };

    const resetChat = () => {
        setChatHistory([
            { role: 'bot', text: 'Estou aqui! O que mais quer saber?' }
        ]);
    };

    return (
        <div className="helpbot-container">
            {/* The Floating Window */}
            <div className={`helpbot-window ${isOpen ? 'open' : ''}`}>
                <div className="helpbot-header">
                    <div className="helpbot-header-info">
                        <div className="helpbot-avatar">
                            <Bot size={20} color="#60a5fa" />
                        </div>
                        <div>
                            <h3>Ajuda Valle</h3>
                            <p>Online agora</p>
                        </div>
                    </div>
                    <button className="helpbot-header-close" onClick={() => setIsOpen(false)}>
                        <X size={20} />
                    </button>
                </div>

                <div className="helpbot-body" ref={bodyRef}>
                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`helpmsg ${msg.role}`}>
                            {msg.text}
                        </div>
                    ))}
                    
                    {chatHistory[chatHistory.length - 1].role === 'bot' && (
                        <div className="helpbot-options" style={{ animation: 'fadeInMsg 0.5s ease' }}>
                            {FAQ_OPTIONS.map(opt => (
                                <button 
                                    key={opt.id} 
                                    className={`helpopt-btn ${opt.isContact ? 'whatsapp-opt' : ''}`}
                                    onClick={() => handleOptionSelect(opt)}
                                >
                                    <span>{opt.label}</span>
                                    <ChevronRight size={16} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {chatHistory.length > 2 && (
                    <div className="helpbot-footer">
                        <button onClick={resetChat}>Mostrar Menu Inicial</button>
                    </div>
                )}
            </div>

            {/* The Trigger Button */}
            <div className={`helpbot-toggle ${isOpen ? 'active' : ''}`} onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
            </div>
        </div>
    );
};

export default HelpBot;
