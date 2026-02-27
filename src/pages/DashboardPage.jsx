import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Home, FileText, Users, Shield, LogOut, MapPin, Loader2 } from 'lucide-react';
import Header from '../components/Header';
import { useAuth, OBRAS } from '../context/AuthContext';
import { getClients, getProposals } from '../services/api';
import './DashboardPage.css';

const AnimatedCounter = ({ end, duration = 2000 }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (end === null || end === undefined) return;
        let startTime = null;
        let animationFrame;

        const animate = (currentTime) => {
            if (!startTime) startTime = currentTime;
            const progress = Math.min((currentTime - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 4); // easeOutQuart

            setCount(Math.floor(ease * end));

            if (progress < 1) {
                animationFrame = requestAnimationFrame(animate);
            } else {
                setCount(end);
            }
        };

        if (end > 0) {
            animationFrame = requestAnimationFrame(animate);
        } else {
            setCount(0);
        }

        return () => cancelAnimationFrame(animationFrame);
    }, [end, duration]);

    return <span>{count}</span>;
};

const DashboardPage = () => {
    const { currentUser, logout, isAdmin } = useAuth();
    const [stats, setStats] = useState({ clients: null, proposals: null, loading: true });
    const allowedObras = useMemo(() => {
        if (!currentUser?.obrasPermitidas?.length) return [];
        return OBRAS.filter(obra => currentUser.obrasPermitidas.includes(obra.codigo));
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser?.id) return;
        const loadStats = async () => {
            setStats(prev => ({ ...prev, loading: true }));
            try {
                const [clientsPf, clientsPj, proposalsResult] = await Promise.all([
                    getClients({ page: 1, limit: 200, type: 'pf', created_by: currentUser.id }),
                    getClients({ page: 1, limit: 200, type: 'pj', created_by: currentUser.id }),
                    getProposals({ page: 1, limit: 500 })
                ]);
                const clientsCount = (clientsPf?.total_count ?? clientsPf?.clients?.length ?? 0)
                    + (clientsPj?.total_count ?? clientsPj?.clients?.length ?? 0);
                const proposalsList = proposalsResult?.proposals || [];
                const ownerId = String(currentUser.id);
                const proposalsCount = proposalsList.filter((proposal) => {
                    const createdBy = proposal?.created_by ?? proposal?.createdBy ?? proposal?.user_id ?? proposal?.userId ?? proposal?.user?.id ?? proposal?.payload?.created_by ?? proposal?.payload?.user_id;
                    return createdBy && String(createdBy) === ownerId;
                }).length;
                setStats({ clients: clientsCount, proposals: proposalsCount, loading: false });
            } catch {
                setStats({ clients: null, proposals: null, loading: false });
            }
        };
        loadStats();
    }, [currentUser?.id]);

    const renderStatValue = (value) => {
        if (stats.loading) return <Loader2 size={32} className="stat-loading-spinner" />;
        if (value === null || value === undefined) return '—';
        return <AnimatedCounter end={value} />;
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Bom dia';
        if (hour < 18) return 'Boa tarde';
        return 'Boa noite';
    };

    return (
        <div className="dashboard-page">
            <Header title="Dashboard">
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
            </Header>

            <main className="dashboard-container">
                <section className="dashboard-hero">
                    <div className="hero-icon">
                        <LayoutDashboard size={28} />
                    </div>
                    <div>
                        <h1>{getGreeting()}, <span className="hero-name">{currentUser?.nome || currentUser?.username || 'Usuário'}</span></h1>
                        <p>Acesse rapidamente as principais áreas do seu sistema e gerencie suas vendas.</p>
                    </div>
                </section>

                <section className="dashboard-stats">
                    <div className="dashboard-stat-card">
                        <div className="stat-icon primary">
                            <Users size={22} />
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{renderStatValue(stats.clients)}</span>
                            <span className="stat-label">Clientes cadastrados por você</span>
                        </div>
                    </div>
                    <div className="dashboard-stat-card">
                        <div className="stat-icon info">
                            <FileText size={22} />
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{renderStatValue(stats.proposals)}</span>
                            <span className="stat-label">Propostas feitas por você</span>
                        </div>
                    </div>
                </section>

                <section className="dashboard-cards">
                    <Link to="/disponibilidade" className="dashboard-card">
                        <div className="card-icon primary">
                            <Home size={22} />
                        </div>
                        <div>
                            <h3>Disponibilidade</h3>
                            <p>Mapa de lotes e status atualizados</p>
                        </div>
                    </Link>
                    <Link to="/propostas" className="dashboard-card">
                        <div className="card-icon info">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h3>Histórico de Propostas</h3>
                            <p>Reimpressão e atualização de dados</p>
                        </div>
                    </Link>
                    <Link to="/clientes" className="dashboard-card">
                        <div className="card-icon success">
                            <Users size={22} />
                        </div>
                        <div>
                            <h3>Clientes</h3>
                            <p>Gerencie cadastros e vínculos</p>
                        </div>
                    </Link>
                    {isAdmin && (
                        <Link to="/admin" className="dashboard-card">
                            <div className="card-icon warning">
                                <Shield size={22} />
                            </div>
                            <div>
                                <h3>Painel Administrativo</h3>
                                <p>Permissões, usuários e controles</p>
                            </div>
                        </Link>
                    )}
                </section>

                <section className="dashboard-obras">
                    <div className="section-title">
                        <MapPin size={18} />
                        <h2>Obras Permitidas</h2>
                    </div>
                    {allowedObras.length === 0 ? (
                        <div className="obras-empty">Nenhuma obra configurada para este usuário.</div>
                    ) : (
                        <div className="obras-grid">
                            {allowedObras.map(obra => (
                                <div key={obra.codigo} className="obra-card">
                                    <span className="obra-code">{obra.codigo}</span>
                                    <div className="obra-info">
                                        <span className="obra-name">{obra.descricao}</span>
                                        <span className="obra-location">{obra.cidade} - {obra.uf}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

export default DashboardPage;
