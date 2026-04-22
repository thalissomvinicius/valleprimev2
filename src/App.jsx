import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, OBRAS } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Header from './components/Header';
import Footer from './components/Footer';
import SearchBar from './components/SearchBar';
import AvailabilityTable from './components/AvailabilityTable';
import AdminPanel from './pages/AdminPanel';
import { fetchAvailability } from './services/api';
import { Building2, LogOut, ChevronDown, FileDown, CheckCircle, Shield, Lock, MessageCircle, LayoutDashboard, FileText, AlertTriangle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from './assets/Valle-logo-azul.png';
import BudgetModal from './components/BudgetModalWrapper';
import ClientListPage from './pages/ClientListPage';
import { Users as UsersIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProposalHistoryPage from './pages/ProposalHistoryPage';
import DashboardPage from './pages/DashboardPage';
import BrokersPage from './pages/BrokersPage';
import StatusWarningModal from './components/StatusWarningModal';
import OfflineWarning from './components/OfflineWarning';
import HelpBot from './components/HelpBot';

function MainApp() {
  const { currentUser, logout } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerms, setSearchTerms] = useState({ quadra: '', lote: '', status: '0 - Disponível' });
  const [error, setError] = useState(null);
  const [selectedObra, setSelectedObra] = useState(() => {
    const saved = localStorage.getItem('selectedObra');
    if (saved && currentUser?.obrasPermitidas?.includes(saved)) {
      return saved;
    }
    return currentUser?.obrasPermitidas?.[0] || '624';
  });
  const [obraDropdownOpen, setObraDropdownOpen] = useState(false);
  const [selectedLot, setSelectedLot] = useState(null);
  const [pendingLot, setPendingLot] = useState(null);
  const [showStatusWarning, setShowStatusWarning] = useState(false);
  const dataCacheRef = useRef({}); // cache por obra: { [codigo]: data }

  // Obras que o usuário pode ver
  const allowedObras = useMemo(() => {
    if (!currentUser) return [];
    return OBRAS.filter(obra => currentUser.obrasPermitidas.includes(obra.codigo));
  }, [currentUser]);

  // Status que o usuário pode ver
  const allowedStatus = useMemo(() => {
    return [
      { value: 'TODOS', label: 'TODOS OS STATUS' },
      { value: '0 - Disponível', label: 'DISPONÍVEIS' },
      { value: '1 - Vendido', label: 'VENDIDOS' },
      { value: '2 - Reservado', label: 'RESERVADOS' },
      { value: '4 - Quitado', label: 'QUITADOS' },
      { value: '7 - Suspenso', label: 'LOTE SUSPENSO' },
      { value: '8 - Fora de venda', label: 'FORA DE VENDA' }
    ];
  }, []);

  useEffect(() => {
    if (!selectedObra) return;
    localStorage.setItem('selectedObra', selectedObra);

    setLoading(true);
    const obraInfo = OBRAS.find(o => o.codigo === selectedObra);
    fetchAvailability(selectedObra, obraInfo?.empresa || 28)
      .then((result) => {
        setData(result);
        setError(null);
        dataCacheRef.current[selectedObra] = result;
      })
      .catch((err) => setError(err?.message || 'Erro ao carregar dados do Banco UAU.'))
      .finally(() => setLoading(false));
  }, [selectedObra]);

  // Parse numeric value from formatted string
  const parseValue = (valueStr) => {
    if (!valueStr) return 0;
    const cleaned = valueStr.toString().replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  };

  const [sortConfig, setSortConfig] = useState(null);

  const handleSort = (key) => {
    let direction = 'asc';

    if (sortConfig && sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else {
        setSortConfig(null); // Remove sort on 3rd click
        return;
      }
    }

    setSortConfig({ key, direction });
  };

  const filteredData = useMemo(() => {
    let result = data.filter((item) => {
      // Filter by Status
      if (searchTerms.status !== 'TODOS') {
        if (!item.Status_Terreno.includes(searchTerms.status)) {
          return false;
        }
      }

      // Search Filter (Quadra & Lote)
      if (searchTerms.quadra && !item.QD.toLowerCase().includes(searchTerms.quadra.toLowerCase())) {
        return false;
      }
      if (searchTerms.lote && !item.LT.toLowerCase().includes(searchTerms.lote.toLowerCase())) {
        return false;
      }

      return true;
    });

    // Dynamic Sorting
    result.sort((a, b) => {
      // Default Sort (Quadra asc, Lote numeric asc) if no config
      if (!sortConfig) {
        const qdA = a.QD.toString();
        const qdB = b.QD.toString();
        const qdComparison = qdA.localeCompare(qdB, undefined, { numeric: true, sensitivity: 'base' });
        if (qdComparison !== 0) return qdComparison;
        const ltA = parseInt(a.LT, 10) || 0;
        const ltB = parseInt(b.LT, 10) || 0;
        return ltA - ltB;
      }

      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle specific column types
      if (sortConfig.key === 'Status_Terreno') {
        return sortConfig.direction === 'asc' 
          ? String(a.Status_Terreno || '').localeCompare(String(b.Status_Terreno || ''))
          : String(b.Status_Terreno || '').localeCompare(String(a.Status_Terreno || ''));
      } else if (sortConfig.key === 'Valor_Terreno') {
        aVal = parseValue(a.Valor_Terreno);
        bVal = parseValue(b.Valor_Terreno);
      } else if (sortConfig.key === 'M2') {
        aVal = parseFloat(a.M2);
        bVal = parseFloat(b.M2);
      } else if (sortConfig.key === 'LT') {
        aVal = parseInt(a.LT, 10);
        bVal = parseInt(b.LT, 10);
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [data, searchTerms, sortConfig]);

  // Helper para obter a data mais recente
  const computeLastUpdate = () => {
    return data?.lastUpdate || (data[0] && data[0].Data_Atualizacao) || null;
  };

  const handleLotClick = (lot) => {
    if (String(lot?.Status_Terreno || '').includes('0 - Disponível')) {
      setSelectedLot(lot);
    } else {
      setPendingLot(lot);
      setShowStatusWarning(true);
    }
  };

  const handleConfirmStatusWarning = () => {
    setSelectedLot(pendingLot);
    setShowStatusWarning(false);
    setPendingLot(null);
  };

  const handleExportPDF = async () => {
    try {
      if (!filteredData || filteredData.length === 0) {
        alert('Não há dados para exportar com os filtros atuais.');
        return;
      }

      // 1. Setup Landscape PDF
      const doc = new jsPDF({ orientation: "landscape" });
      const currentObra = OBRAS.find(o => o.codigo === selectedObra);
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      // Helper to load image
      const getImageData = (url) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.src = url;
          img.onload = () => {
            // Create canvas to convert image
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = reject;
        });
      };

      // 2. Add Logo (Top Left)
      try {
        const logoData = await getImageData(logo);
        // Position: x=14, y=10, width=30, height=auto(keep aspect ratio)
        // Adjust width/height as needed for the layout
        doc.addImage(logoData, 'PNG', 14, 5, 35, 12);
      } catch (e) {
        console.warn("Logo não carregado", e);
      }

      // 3. Header Information
      // Title: Centered "Relatório de Disponibilidade"
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text("Relatório de Disponibilidade", pageWidth / 2, 10, { align: "center" });

      // Subtitle: Centered "Loteamento: (CODE) NAME"
      doc.setFontSize(10);
      const loteamentoText = `Loteamento:(${selectedObra}) ${currentObra?.descricao || ''}`;
      doc.text(loteamentoText, pageWidth / 2, 16, { align: "center" });

      // Update Date (Top Right)
      const updateDate = data[0]?.Data_Atualizacao || '';
      if (updateDate) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`Atualização: ${updateDate}`, pageWidth - 14, 10, { align: "right" });
      }

      // 4. Table Columns (11 columns matching reference)
      const tableColumn = [
        "QD",
        "LT",
        "Área M²",
        "Valor do Lote",
        "Logradouro",
        "M Frente",
        "M Fundo",
        "Lado Direito",
        "Lado Esquerdo",
        "Chanfro",
        "Status Lote"
      ];

      // 5. Data Mapping
      const tableRows = filteredData.map(item => [
        item.QD,
        item.LT,
        item.M2,
        // Format Value: "55.749,75" (No R$, 2 decimals)
        parseValue(item.Valor_Terreno).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        item.Logradouro,
        item.M_Frente || '0,00',
        item.M_Fundo || '0,00',
        item.M_Lado_Direito || '0,00',
        item.M_Lado_Esquerdo || '0,00',
        item.Chanfro || '- / -', // Assuming 'Chanfro' matches image logic or use fallback
        item.Status_Terreno.includes(' - ') ? item.Status_Terreno.split(' - ')[1] : item.Status_Terreno
      ]);

      // 6. Generate Table
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 25,
        theme: 'grid', // 'grid' theme matches the bordered look better
        styles: {
          fontSize: 8,
          cellPadding: 2,
          valign: 'middle',
          halign: 'center', // Center all text by default
          lineColor: [0, 0, 0], // Black borders
          lineWidth: 0.1,
          textColor: [0, 0, 0] // Black text
        },
        headStyles: {
          fillColor: [220, 220, 220], // Light gray header background
          textColor: [0, 0, 0], // Black header text
          fontStyle: 'bold',
          lineColor: [0, 0, 0],
          lineWidth: 0.1
        },
        columnStyles: {
          // Logradouro (Index 4) centered as requested
          4: { halign: 'center' }
        },
        didDrawPage: () => {
          // Footer
          const pageHeight = doc.internal.pageSize.height;
          doc.setFontSize(8);

          // Left Footer
          doc.text("Viva Bem, Viva Valle... | Desenvolvido por Vinicius Dev (91) 99169-7664", 14, pageHeight - 10);

          // Right: "Emissão: dd/mm/yyyy hh:mm"
          const date = new Date();
          const dateStr = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR').substring(0, 5);
          doc.text(`Emissão: ${dateStr}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
        }
      });

      // Add Total Pages to Center Footer
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`${i}/${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      }

      const pdfBlobUrl = doc.output('bloburl');
      const link = document.createElement('a');
      link.href = pdfBlobUrl;
      link.download = `Disponibilidade_Valle_${selectedObra}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      alert("Ocorreu um erro ao gerar o PDF. Verifique o console.");
    }
  };

  const currentObraInfo = OBRAS.find(o => o.codigo === selectedObra);

  // Se usuário não tem permissão em nenhuma obra
  if (allowedObras.length === 0) {
    return (
      <div className="app">
        <Header title="Valle Prime">
          <div className="header-user-section">
            <button className="btn-logout" onClick={logout} title="Sair">
              <LogOut size={18} />
              <span className="hide-mobile">Sair</span>
            </button>
          </div>
        </Header>

        <div className="no-permission-container">
          <div className="no-permission-card">
            <div className="no-permission-icon">
              <Lock size={64} />
            </div>
            <h2>Acesso Restrito</h2>
            <p>Você ainda não possui permissão para acessar nenhum loteamento.</p>
            <p className="no-permission-subtitle">Entre em contato com o administrador do sistema para solicitar acesso.</p>

            <div className="no-permission-contact">
              <a
                href="https://wa.me/559191697664"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-whatsapp-contact"
              >
                <MessageCircle size={20} />
                Falar com Vinicius Dev
              </a>
            </div>

            <p className="no-permission-footer"><a href="https://wa.me/5591991697664" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>© 2025 Desenvolvido por Vinicius Dev</a></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header title={currentObraInfo?.descricao} />
      {
        data.length > 0 && (
          <div className="stats-container animate-fade-in-up">
            <div className="stat-card total">
              <div className="stat-icon-wrapper">
                <Building2 size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-value">{data.length}</span>
                <span className="stat-label">TOTAL DE LOTES</span>
              </div>
            </div>

            {(searchTerms.status === 'TODOS' || searchTerms.status === '0 - Disponível') && (
              <div className="stat-card available">
                <div className="stat-icon-wrapper">
                  <CheckCircle size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">
                    {data.filter(item => item.Status_Terreno.includes('0 - Disponível')).length}
                  </span>
                  <span className="stat-label">DISPONÍVEIS</span>
                </div>
              </div>
            )}

            {(searchTerms.status === 'TODOS' || searchTerms.status === '1 - Vendido') && (
              <div className="stat-card" style={{ backgroundColor: '#fff5f5' }}>
                <div className="stat-icon-wrapper" style={{ color: '#ef4444', backgroundColor: '#fee2e2' }}>
                  <Lock size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">
                    {data.filter(item => item.Status_Terreno.includes('1 - Vendido')).length}
                  </span>
                  <span className="stat-label">VENDIDOS</span>
                </div>
              </div>
            )}

            {(searchTerms.status === 'TODOS' || searchTerms.status === '2 - Reservado') && (
              <div className="stat-card" style={{ backgroundColor: '#fffbeb' }}>
                <div className="stat-icon-wrapper" style={{ color: '#f59e0b', backgroundColor: '#fef3c7' }}>
                  <FileText size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">
                    {data.filter(item => item.Status_Terreno.includes('2 - Reservado')).length}
                  </span>
                  <span className="stat-label">RESERVADOS</span>
                </div>
              </div>
            )}

            {(searchTerms.status === 'TODOS' || searchTerms.status === '4 - Quitado') && (
              <div className="stat-card" style={{ backgroundColor: '#f0fdf4' }}>
                <div className="stat-icon-wrapper" style={{ color: '#22c55e', backgroundColor: '#dcfce7' }}>
                  <Shield size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">
                    {data.filter(item => item.Status_Terreno.includes('4 - Quitado')).length}
                  </span>
                  <span className="stat-label">QUITADOS</span>
                </div>
              </div>
            )}

            {(searchTerms.status === 'TODOS' || searchTerms.status === '7 - Suspenso') && (
              <div className="stat-card" style={{ backgroundColor: '#f8fafc' }}>
                <div className="stat-icon-wrapper" style={{ color: '#64748b', backgroundColor: '#e2e8f0' }}>
                  <Building2 size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">
                    {data.filter(item => item.Status_Terreno.includes('7 - Suspenso')).length}
                  </span>
                  <span className="stat-label">SUSPENSOS</span>
                </div>
              </div>
            )}

            {(searchTerms.status === 'TODOS' || searchTerms.status === '8 - Fora de venda') && (
              <div className="stat-card" style={{ backgroundColor: '#faf2f2' }}>
                <div className="stat-icon-wrapper" style={{ color: '#94a3b8', backgroundColor: '#e2e8f0' }}>
                  <Lock size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">
                    {data.filter(item => item.Status_Terreno.includes('8 - Fora de venda')).length}
                  </span>
                  <span className="stat-label">FORA DE VENDA</span>
                </div>
              </div>
            )}
          </div>
        )
      }

      < main className="container" >
        <div className="availability-actions-bar animate-fade-in-up">
          {allowedObras.length > 1 && (
            <div className="obra-selector">
              <button
                className="availability-action-btn obra-selector-btn"
                onClick={() => setObraDropdownOpen(!obraDropdownOpen)}
              >
                <Building2 size={18} />
                <span className="obra-codigo">{selectedObra}</span>
                <span className="obra-nome">
                  {(() => {
                    if (!currentObraInfo) return '';
                    const cleanDesc = currentObraInfo.descricao.replace('RESIDENCIAL ', '');
                    const [loteamento, cidade] = cleanDesc.split(' - ');
                    if (cidade) return `${cidade.trim()} - ${loteamento.trim()}`;
                    return cleanDesc;
                  })()}
                </span>
                <ChevronDown size={16} className={obraDropdownOpen ? 'rotated' : ''} />
              </button>
              {obraDropdownOpen && (
                <div className="obra-dropdown">
                  {allowedObras.map(obra => (
                    <button
                      key={obra.codigo}
                      className={`obra-option ${obra.codigo === selectedObra ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedObra(obra.codigo);
                        setObraDropdownOpen(false);
                      }}
                    >
                      <span className="codigo">{obra.codigo}</span>
                      <span className="descricao">
                        {(() => {
                          const cleanDesc = obra.descricao.replace('RESIDENCIAL ', '');
                          const [loteamento, cidade] = cleanDesc.split(' - ');
                          if (cidade) return `${cidade.trim()} - ${loteamento.trim()}`;
                          return cleanDesc;
                        })()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleExportPDF}
            className="availability-action-btn btn-pdf-export"
            title="Exportar PDF"
          >
            <FileDown size={18} />
            <span>Exportar PDF</span>
          </button>
        </div>

        <SearchBar
          onSearch={setSearchTerms}
          allowedStatus={allowedStatus}
          currentStatus={searchTerms.status}
        />

        {
          error ? (
            <OfflineWarning message={error} />
          ) : (
            <AvailabilityTable
              data={filteredData}
              loading={loading}
              onRowClick={handleLotClick}
              onSort={handleSort}
              sortConfig={sortConfig}
              totalCount={data.length}
            />
          )
        }
      </main >

      <Footer lastUpdate={computeLastUpdate()} />

      {
        selectedLot && (
          <BudgetModal
            lot={selectedLot}
            onClose={() => setSelectedLot(null)}
            obraName={(() => {
              if (!currentObraInfo?.descricao) return 'Valle';
              const clean = currentObraInfo.descricao.replace('RESIDENCIAL ', '');
              if (clean.includes(' - ')) {
                const [lot, city] = clean.split(' - ');
                return `${lot.trim()} (${city.trim()})`;
              }
              return clean;
            })()}
          />
        )
      }

      {
        showStatusWarning && (
          <StatusWarningModal
            lot={pendingLot}
            onClose={() => {
              setShowStatusWarning(false);
              setPendingLot(null);
            }}
            onConfirm={handleConfirmStatusWarning}
          />
        )
      }
    </div >
  );
}


function App() {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();
  const [showLoading, setShowLoading] = useState(true);

  // Gracefully fade out the loading screen
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setShowLoading(false), 400); // 400ms matches CSS exit transition
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const renderRoutes = () => {
    // Se estiver carregando o estado de autenticação, não renderiza nada ainda
    // para evitar redirecionamentos errados (ex: ir para /login e depois /dashboard ao dar F5)
    if (loading) return null;

    if (!isAuthenticated) {
      return (
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" state={{ from: location }} replace />} />
        </Routes>
      );
    }

    return (
      <Routes>
        <Route path="/admin" element={isAdmin ? <AdminPanel /> : <Navigate to="/dashboard" replace />} />
        <Route path="/clientes" element={<ClientListPage />} />
        <Route path="/propostas" element={<ProposalHistoryPage />} />
        <Route path="/corretores" element={<BrokersPage />} />
        <Route path="/disponibilidade" element={<MainApp />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    );
  };

  return (
    <>
      {renderRoutes()}
      {isAuthenticated && <HelpBot />}
      {showLoading && (
        <div className={`global-loading-screen ${!loading ? 'animate-fade-out' : 'animate-fade-in'}`}>
          <div className="global-loading-content">
            <img src={logo} alt="Valle Prime" className="global-loading-logo pulse-animation" />
            <p className="global-loading-text fade-in-up-delay">Acessando Sistema...</p>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
