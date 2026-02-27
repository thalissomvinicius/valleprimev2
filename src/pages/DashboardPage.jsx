import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Home, FileText, Users, Shield, LogOut, MapPin, Loader2 } from 'lucide-react';
import Header from '../components/Header';
import { useAuth, OBRAS } from '../context/AuthContext';
import { getClients, getProposals } from '../services/api';
import './DashboardPage.css';



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
        return <span>{value}</span>;
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Bom dia';
        if (hour < 18) return 'Boa tarde';
        return 'Boa noite';
    };

    return (
        <div className="dashboard-page">
            <Header title="Dashboard" />

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

            <footer style={{
                textAlign: 'center',
                padding: '2rem 1rem 1rem',
                color: 'var(--text-muted)',
                fontSize: '0.85rem'
            }}>
                <p style={{ margin: 0 }}>
                    <a href="https://wa.me/5591991697664" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                        Desenvolvido por <strong>Vinicius Dev</strong>
                    </a>
                </p>
            </footer>
        </div>
    );
};

export default DashboardPage;
