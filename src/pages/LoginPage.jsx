import React, { useState } from 'react';
import logo from '../assets/Valle-logo-azul.png';
import './LoginPage.css';

function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        console.log('[LOGIN] Iniciando login para:', username);

        try {
            // Chamada direta via fetch para garantir controle total
            const response = await fetch(`/api/login-get?username=${encodeURIComponent(username.trim())}&password=${encodeURIComponent(password)}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                }
            });

            console.log('[LOGIN] Response status:', response.status);

            const data = await response.json();
            console.log('[LOGIN] Response data:', data);

            if (response.ok && data.token) {
                // Sucesso! Salvar token e mostrar animação
                console.log('[LOGIN] Token recebido, salvando no localStorage');
                localStorage.setItem('valle_token', data.token);

                // Mostrar sucesso
                setSuccess(true);
                setLoading(false);

                // Aguardar animação e redirecionar
                console.log('[LOGIN] Redirecionando para home em 1.5s...');
                setTimeout(() => {
                    // Usando window.location para garantir redirecionamento
                    window.location.href = '/';
                }, 1500);
            } else {
                // Erro do servidor
                console.log('[LOGIN] Erro:', data.message);
                setError(data.message || 'Credenciais inválidas');
                setLoading(false);
            }
        } catch (err) {
            console.error('[LOGIN] Erro de rede:', err);
            setError('Erro de conexão. Tente novamente.');
            setLoading(false);
        }
    };

    return (
        <div className="login-wrapper">
            {/* Background animado */}
            <div className="login-bg">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="login-box">
                {/* Logo e título */}
                <div className="login-brand">
                    <img src={logo} alt="Valle" className="login-logo" />
                    <h1>Valle Prime</h1>
                    <p>Sistema de Disponibilidades</p>
                </div>

                {/* Formulário ou mensagem de sucesso */}
                {success ? (
                    <div className="login-success">
                        <div className="success-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                        <h2>Login realizado!</h2>
                        <p>Redirecionando...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="input-group">
                            <label>Usuário</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Digite seu usuário"
                                autoComplete="username"
                                autoFocus
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="input-group">
                            <label>Senha</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Digite sua senha"
                                autoComplete="current-password"
                                disabled={loading}
                                required
                            />
                        </div>

                        {error && (
                            <div className="login-error">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                                {error}
                            </div>
                        )}

                        <button type="submit" className="login-btn" disabled={loading}>
                            {loading ? (
                                <span className="spinner"></span>
                            ) : (
                                'Entrar'
                            )}
                        </button>
                    </form>
                )}

                <div className="login-footer">
                    <p>© 2025 Valle Empreendimentos</p>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
