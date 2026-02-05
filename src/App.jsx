import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, OBRAS } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import AvailabilityTable from './components/AvailabilityTable';
import AdminPanel from './pages/AdminPanel';
import { fetchAvailability } from './services/api';
import { Building2, LogOut, ChevronDown, FileDown, CheckCircle, Shield, Lock, MessageCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from './assets/Valle-logo-azul.png';
import BudgetModal from './components/BudgetModalWrapper';
import ClientListPage from './pages/ClientListPage';
import { Users as UsersIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusWarningModal from './components/StatusWarningModal';

function MainApp() {
  const { currentUser, logout, isAdmin } = useAuth();
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

    const cached = dataCacheRef.current[selectedObra];
    if (cached && Array.isArray(cached) && cached.length >= 0) {
      setData(cached);
      setLoading(false);
      setError(null);
      // Atualizar em background (API já tem cache, tende a ser rápido)
      fetchAvailability(selectedObra).then((result) => {
        setData(result);
        dataCacheRef.current[selectedObra] = result;
      }).catch(() => {});
      return;
    }

    setLoading(true);
    fetchAvailability(selectedObra)
      .then((result) => {
        setData(result);
        setError(null);
        dataCacheRef.current[selectedObra] = result;
      })
      .catch(() => setError('Erro ao carregar dados. Por favor, tente novamente mais tarde.'))
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
      if (sortConfig.key === 'Valor_Terreno') {
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

  const handleLotClick = (lot) => {
    if (lot.Status_Terreno.includes('0 - Disponível')) {
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
        didDrawPage: (data) => {
          // Footer
          const pageHeight = doc.internal.pageSize.height;
          doc.setFontSize(8);

          // Left Footer
          doc.text("Viva Bem, Viva Valle...", 14, pageHeight - 10);

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
      window.open(pdfBlobUrl, '_blank');

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
            
            <p className="no-permission-footer">© 2025 Desenvolvido por Vinicius Dev</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header title={currentObraInfo?.descricao}>
        <div className="header-user-section">
          <button
            onClick={handleExportPDF}
            className="btn-pdf-header"
            title="Exportar PDF"
          >
            <FileDown size={18} />
            <span className="hide-mobile">Exportar PDF</span>
          </button>

          {allowedObras.length > 1 && (
            <div className="obra-selector">
              <button
                className="obra-selector-btn"
                onClick={() => setObraDropdownOpen(!obraDropdownOpen)}
              >
                <Building2 size={18} />
                <span className="obra-codigo">{selectedObra}</span>
                <span className="obra-nome">{currentObraInfo?.descricao?.split(' - ')[1] || ''}</span>
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
                      <span className="descricao">{obra.descricao}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Link to="/clientes" className="btn-clients-header" title="Gerenciar Clientes">
            <UsersIcon size={18} />
            <span className="hide-mobile">Clientes</span>
          </Link>

          {isAdmin && (
            <Link to="/admin" className="btn-clients-header" title="Painel Administrativo">
              <Shield size={18} />
              <span className="hide-mobile">Admin</span>
            </Link>
          )}
          <button className="btn-logout" onClick={logout} title="Sair">
            <LogOut size={18} />
            <span className="hide-mobile">Sair</span>
          </button>
        </div>
      </Header>

      {data.length > 0 && (
        <div className="stats-container animate-fade-in-up">
          <div className="stat-card total">
            <div className="stat-icon-wrapper">
              <Building2 size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{data.length}</span>
              <span className="stat-label">Total de Lotes</span>
            </div>
          </div>

          <div className="stat-card available">
            <div className="stat-icon-wrapper">
              <CheckCircle size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {data.filter(item => item.Status_Terreno.includes('0 - Disponível')).length}
              </span>
              <span className="stat-label">Disponíveis</span>
            </div>
          </div>

        </div>
      )}

      <main className="container">
        <SearchBar
          onSearch={setSearchTerms}
          allowedStatus={allowedStatus}
          currentStatus={searchTerms.status}
        />

        {error ? (
          <div className="error-message" style={{ textAlign: 'center', color: 'var(--danger-color)', padding: '2rem' }}>
            {error}
          </div>
        ) : (
          <AvailabilityTable
            data={filteredData}
            loading={loading}
            onRowClick={handleLotClick}
            onSort={handleSort}
            sortConfig={sortConfig}
          />
        )}
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '2rem 1rem',
        marginTop: '2rem',
        borderTop: '1px solid var(--border-color)',
        color: 'var(--text-muted)',
        fontSize: '0.85rem'
      }}>
        <p style={{ marginBottom: '0.5rem' }}>Desenvolvido por <strong>Vinicius Dev</strong> (v1.1)</p>
        {data && (
          (() => {
            const lastUpdate = data.lastUpdate || (data[0] && data[0].Data_Atualizacao);
            if (!lastUpdate) return null;
            return (
              <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                Última atualização: {lastUpdate}
              </p>
            );
          })()
        )}
      </footer>

      {selectedLot && (
        <BudgetModal
          lot={selectedLot}
          onClose={() => setSelectedLot(null)}
          obraName={currentObraInfo?.descricao}
        />
      )}

      {showStatusWarning && (
        <StatusWarningModal
          lot={pendingLot}
          onClose={() => {
            setShowStatusWarning(false);
            setPendingLot(null);
          }}
          onConfirm={handleConfirmStatusWarning}
        />
      )}
    </div>
  );
}

function App() {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen animate-fade-in">
        <div className="loading-spinner-container">
          <div className="loading-spinner-large"></div>
          <div className="loading-logo-glow"></div>
        </div>
        <p className="loading-text">Sincronizando Disponibilidades...</p>
      </div>
    );
  }

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
      <Route path="/admin" element={isAdmin ? <AdminPanel /> : <Navigate to="/" replace />} />
      <Route path="/clientes" element={<ClientListPage />} />
      <Route path="/" element={<MainApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
