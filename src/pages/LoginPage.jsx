import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import logo from '../assets/Valle-logo-azul.png';
import { Eye, EyeOff } from 'lucide-react';
import './LoginPage.css';
import { useAuth } from '../context/authContextValue';

function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const isLoggingIn = useRef(false); // Controla se está no fluxo de login

    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Só redireciona automaticamente se já estava autenticado ao carregar a página
        // Não redireciona durante o fluxo de login ativo
        if (isAuthenticated && !isLoggingIn.current) {
            navigate('/', { replace: true });
        }
    }, [isAuthenticated, navigate]);

    const translateLoginError = (rawMessage) => {
        const msg = String(rawMessage || '');
        const normalized = msg.toLowerCase();
        if (!msg) return 'Erro ao validar login.';
        if (normalized.includes('status code 401') || normalized.includes('unauthorized') || normalized.includes('invalid credentials') || normalized.includes('invalid username') || normalized.includes('invalid password')) {
            return 'Usuário ou senha inválidos.';
        }
        if (normalized.includes('status code 403') || normalized.includes('not approved') || normalized.includes('not active') || normalized.includes('inactive') || normalized.includes('pending')) {
            return 'Seu acesso ainda não foi aprovado. Aguarde a liberação do administrador.';
        }
        if (normalized.includes('network error') || normalized.includes('failed to fetch') || normalized.includes('fetch failed')) {
            return 'Erro de conexão. Verifique sua internet e tente novamente.';
        }
        if (normalized.includes('too many requests')) {
            return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
        }
        if (normalized.includes('status code 500') || normalized.includes('internal server error')) {
            return 'Erro interno no servidor. Tente novamente.';
        }
        return msg;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        isLoggingIn.current = true; // Marca que estamos no fluxo de login

        try {
            const result = await login(username, password);
            if (result?.success) {
                setSuccess(true);
                setLoading(false);

                const redirectTo = location.state?.from?.pathname || '/';
                setTimeout(() => {
                    isLoggingIn.current = false;
                    navigate(redirectTo, { replace: true });
                }, 2000);
            } else {
                isLoggingIn.current = false;
                setError(translateLoginError(result?.error) || 'Usuário ou senha inválidos.');
                setLoading(false);
            }
        } catch {
            isLoggingIn.current = false;
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
                            <svg className="success-check" viewBox="0 0 52 52">
                                <circle className="success-check__circle" cx="26" cy="26" r="25" fill="none" />
                                <path className="success-check__check" fill="none" d="M14 27l7 7 17-17" />
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
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Digite sua senha"
                                    autoComplete="current-password"
                                    disabled={loading}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                    disabled={loading}
                                    tabIndex="-1"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
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
                    <p className="whatsapp-request">
                        Adquira seu acesso <a href="https://wa.me/559191697664" target="_blank" rel="noopener noreferrer">clicando aqui!</a>
                    </p>
                    <p>© 2025 Desenvolvido por Vinicius Dev</p>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
