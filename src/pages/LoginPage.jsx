import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, Lock, Building2 } from 'lucide-react';
import logo from '../assets/Valle-logo-azul.png';
import './LoginPage.css';

function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const from = location.state?.from?.pathname || '/';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const result = await login(username, password);
            if (result.success) {
                const isAdmin = result.user?.role === 'admin';
                const targetPath = (isAdmin || from !== '/admin') ? from : '/';
                navigate(targetPath, { replace: true });
            } else {
                setError(result.error || 'Falha no login.');
            }
        } catch (err) {
            setError('Erro ao fazer login. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-background">
                <div className="bg-shape shape-1" />
                <div className="bg-shape shape-2" />
                <div className="bg-shape shape-3" />
            </div>

            <div className="login-container">
                <div className="login-card">
                    <div className="login-header">
                        <div className="login-logo-wrap">
                            <img src={logo} alt="Valle Empreendimentos" className="login-logo-img" />
                        </div>
                        <h1>Sistema de Disponibilidades</h1>
                        <p className="login-subtitle">Entre com seu usuário e senha para acessar</p>
                    </div>

                    <form className="login-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>
                                <User size={18} />
                                Usuário
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Digite seu usuário"
                                autoComplete="username"
                                autoFocus
                                disabled={submitting}
                            />
                        </div>
                        <div className="form-group">
                            <label>
                                <Lock size={18} />
                                Senha
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Digite sua senha"
                                autoComplete="current-password"
                                disabled={submitting}
                            />
                        </div>

                        {error && (
                            <div className="message error-message" role="alert">
                                {error}
                            </div>
                        )}

                        <button type="submit" className="btn-submit" disabled={submitting}>
                            {submitting ? (
                                <span className="loading-spinner" />
                            ) : (
                                'Entrar'
                            )}
                        </button>
                    </form>
                </div>

                <div className="login-info">
                    <p className="login-info-tagline">Bem-vindo ao</p>
                    <h2>Valle Empreendimentos</h2>
                    <p className="login-info-desc">Consulte disponibilidades de lotes, gere propostas e gerencie clientes em um só lugar.</p>
                    <ul className="login-features">
                        <li><Building2 size={20} /> Múltiplas obras</li>
                        <li><Building2 size={20} /> Filtros e exportação PDF</li>
                        <li><Building2 size={20} /> Cadastro de clientes</li>
                    </ul>
                    <p className="login-info-slogan">Viva bem, viva Valle.</p>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
