import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import ClientSelectionModal from './ClientSelectionModal';
import { X, FileText, CheckCircle, Building2, User, Users, MapPin, Contact, Briefcase, ChevronRight, ChevronLeft, Trash2, Search, AlertCircle } from 'lucide-react';
import { deleteClient, checkDuplicate } from '../services/api';
import { useToast } from '../context/toastContextValue';
import { maskCPF, maskCNPJ, maskCEP, maskDDD, maskPhoneNumber, unmask } from '../utils/masks';
import { validateCNPJ, validateEmail } from '../utils/validators';
import { generateResidenceDeclaration } from '../utils/generateResidenceDeclaration';
import './ClientFormModal.css';

const COMMON_DOMAINS = [
    'gmail.com',
    'hotmail.com',
    'outlook.com',
    'icloud.com',
    'yahoo.com.br',
    'me.com',
    'uol.com.br',
    'terra.com.br'
];

const ClientFormModal = ({ onClose, onConfirm, onDelete, initialData = null, clientId = null, onBack, lot, obraName }) => {
    const { showToast } = useToast();
    const [personType, setPersonType] = useState(initialData?.tipo_pessoa || 'PF');
    const [personTypeSegundo, setPersonTypeSegundo] = useState(initialData?.tipo_pessoa_segundo || 'PF');
    const [activeTab, setActiveTab] = useState('titular');
    const [showP2Selection, setShowP2Selection] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [duplicateWarning, setDuplicateWarning] = useState({ show: false, clientName: '', clientId: null });
    const [isSaving, setIsSaving] = useState(false);
    const [residenceDeclarationDate, setResidenceDeclarationDate] = useState(new Date().toISOString().split('T')[0]);
    const [residenceReason, setResidenceReason] = useState('option1');
    const [residenceReasonOther, setResidenceReasonOther] = useState('');
    const [declarationMode, setDeclarationMode] = useState('combined'); // 'combined' or 'individual'

    const [formData, setFormData] = useState({
        // Titular
        nome_proponente: initialData?.nome_proponente || '',
        cpf_cnpj_proponente: initialData?.cpf_cnpj_proponente || '',
        rg_proponente: initialData?.rg_proponente || '',
        orgao_emissor_proponente: initialData?.orgao_emissor_proponente?.split('/')[0] || '',
        uf_rg_proponente: initialData?.orgao_emissor_proponente?.split('/')[1] || '',
        data_nascimento_proponente: initialData?.data_nascimento_proponente?.split('/').reverse().join('-') || '',
        sexo: initialData?.sexo_masc_proponente ? 'M' : 'F',
        naturalidade_proponente: initialData?.naturalidade_proponente || '',
        uf_naturalidade_proponente: initialData?.uf_naturalidade_proponente || '',
        nacionalidade_proponente: initialData?.nacionalidade_proponente || 'BRASILEIRO',
        estado_civil_proponente: initialData?.estado_civil_proponente || '',
        regime_casamento_proponente: initialData?.regime_casamento_proponente || (initialData?.estado_civil_proponente && initialData.estado_civil_proponente !== 'CASADO' ? '-' : ''),
        profissao_proponente: initialData?.profissao_proponente || '',
        local_trabalho_proponente: initialData?.local_trabalho_proponente || '',
        email_proponente: initialData?.email_proponente || '',
        fone1_ddd_proponente: initialData?.fone1_ddd_proponente || '',
        fone1_numero_proponente: initialData?.fone1_numero_proponente || '',
        fone2_ddd_proponente: initialData?.fone2_ddd_proponente || '',
        fone2_numero_proponente: initialData?.fone2_numero_proponente || '',
        fone_comercial_ddd_proponente: initialData?.fone_comercial_ddd_proponente || '',
        fone_comercial_numero_proponente: initialData?.fone_comercial_numero_proponente || '',
        endereco_residencial_proponente: initialData?.endereco_residencial_proponente || '',
        numero_endereco_proponente: initialData?.numero_endereco_proponente || '',
        bairro_proponente: initialData?.bairro_proponente || '',
        cidade_proponente: initialData?.cidade_proponente || '',
        uf_endereco_proponente: initialData?.uf_endereco_proponente || '',
        cep_proponente: initialData?.cep_proponente || '',
        inscricao_estadual_proponente: initialData?.inscricao_estadual_proponente || '',
        data_fundacao_proponente: initialData?.data_fundacao_proponente?.split('/').reverse().join('-') || '',

        has_referencia_titular: initialData?.has_referencia_titular || false,
        nome_referencia_proponente: initialData?.nome_referencia_proponente || '',
        fone_referencia_ddd_proponente: initialData?.fone_referencia_ddd_proponente || '',
        fone_referencia_numero_proponente: initialData?.fone_referencia_numero_proponente || '',
        parentesco_referencia_proponente: initialData?.parentesco_referencia_proponente || '',

        // Segundo Proponente
        has_segundo: initialData?.has_segundo || false,
        tipo_segundo: initialData?.tipo_conjuge ? 'conjuge' : (initialData?.tipo_procurador ? 'procurador' : (initialData?.tipo_segundo_proponente ? 'segundo' : 'none')),
        nome_segundo: initialData?.nome_segundo || '',
        cpf_cnpj_segundo: initialData?.cpf_cnpj_segundo || '',
        rg_segundo: initialData?.rg_segundo || '',
        orgao_emissor_segundo: initialData?.orgao_emissor_segundo?.split('/')[0] || '',
        uf_rg_segundo: initialData?.orgao_emissor_segundo?.split('/')[1] || '',
        data_nascimento_segundo: initialData?.data_nascimento_segundo?.split('/').reverse().join('-') || '',
        sexo_seg: initialData?.sexo_masc_segundo ? 'M' : 'F',
        naturalidade_segundo: initialData?.naturalidade_segundo || '',
        uf_naturalidade_segundo: initialData?.uf_naturalidade_segundo || '',
        nacionalidade_segundo: initialData?.nacionalidade_segundo || 'BRASILEIRO',
        estado_civil_segundo: initialData?.estado_civil_segundo || '',
        regime_casamento_segundo: initialData?.regime_casamento_segundo || (initialData?.estado_civil_segundo && initialData.estado_civil_segundo !== 'CASADO' ? '-' : ''),
        profissao_segundo: initialData?.profissao_segundo || '',
        local_trabalho_segundo: initialData?.local_trabalho_segundo || '',
        email_segundo: initialData?.email_segundo || '',
        fone1_ddd_segundo: initialData?.fone1_ddd_segundo || '',
        fone1_numero_segundo: initialData?.fone1_numero_segundo || '',
        fone2_ddd_segundo: initialData?.fone2_ddd_segundo || '',
        fone2_numero_segundo: initialData?.fone2_numero_segundo || '',
        fone_comercial_ddd_segundo: initialData?.fone_comercial_ddd_segundo || '',
        fone_comercial_numero_segundo: initialData?.fone_comercial_numero_segundo || '',
        endereco_residencial_segundo: initialData?.endereco_residencial_segundo || '',
        numero_endereco_segundo: initialData?.numero_endereco_segundo || '',
        bairro_segundo: initialData?.bairro_segundo || '',
        cidade_segundo: initialData?.cidade_segundo || '',
        uf_endereco_segundo: initialData?.uf_endereco_segundo || '',
        cep_segundo: initialData?.cep_segundo || '',

        razao_social_segundo: initialData?.razao_social_segundo || '',
        nome_fantasia_segundo: initialData?.nome_fantasia_segundo || '',
        inscricao_estadual_segundo: initialData?.inscricao_estadual_segundo || '',

        has_referencia_segundo: initialData?.has_referencia_segundo || false,
        nome_referencia_segundo: initialData?.nome_referencia_segundo || '',
        fone_referencia_ddd_segundo: initialData?.fone_referencia_ddd_segundo || '',
        fone_referencia_numero_segundo: initialData?.fone_referencia_numero_segundo || '',
        parentesco_referencia_segundo: initialData?.parentesco_referencia_segundo || ''
    });

    const [estados, setEstados] = useState([]);
    const [cidadesNaturalidade, setCidadesNaturalidade] = useState([]);
    const [cidadesNaturalidadeSeg, setCidadesNaturalidadeSeg] = useState([]);
    const [cidadesEndereco, setCidadesEndereco] = useState([]);
    const [cidadesEnderecoSeg, setCidadesEnderecoSeg] = useState([]);

    const fetchEstados = useCallback(async () => {
        try {
            const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?ordenacao=nome');
            const data = await response.json();
            setEstados(data.map(uf => ({ sigla: uf.sigla, nome: uf.nome })));
        } catch (error) { console.error("Erro ao buscar estados:", error); }
    }, []);

    const fetchCidades = useCallback(async (uf, setCidadesFn) => {
        if (!uf) return;
        try {
            const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
            const data = await response.json();
            setCidadesFn(data.map(c => c.nome.toUpperCase()).sort());
        } catch (error) { console.error("Erro ao buscar cidades:", error); }
    }, []);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        fetchEstados();
        if (initialData) {
            if (initialData.uf_naturalidade_proponente) fetchCidades(initialData.uf_naturalidade_proponente, setCidadesNaturalidade);
            if (initialData.uf_endereco_proponente) fetchCidades(initialData.uf_endereco_proponente, setCidadesEndereco);
            if (initialData.uf_naturalidade_segundo) fetchCidades(initialData.uf_naturalidade_segundo, setCidadesNaturalidadeSeg);
            if (initialData.uf_endereco_segundo) fetchCidades(initialData.uf_endereco_segundo, setCidadesEnderecoSeg);
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [fetchEstados, fetchCidades, initialData]);

    const handleUFChange = (e, fieldName, setCidadesFn) => {
        const uf = e.target.value;
        handleChange(e);
        fetchCidades(uf, setCidadesFn);
    };

    const validateCPF = (cpf) => {
        cpf = cpf.replace(/[^\d]+/g, '');
        if (cpf.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(cpf)) return false;
        let add = 0;
        for (let i = 0; i < 9; i++) add += parseInt(cpf.charAt(i)) * (10 - i);
        let rev = 11 - (add % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(cpf.charAt(9))) return false;
        add = 0;
        for (let i = 0; i < 10; i++) add += parseInt(cpf.charAt(i)) * (11 - i);
        rev = 11 - (add % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(cpf.charAt(10))) return false;
        return true;
    };

    const handleCEPBlur = async (e, type = 'titular') => {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await response.json();
                if (!data.erro) {
                    if (type === 'titular') {
                        setFormData(prev => ({
                            ...prev,
                            endereco_residencial_proponente: data.logradouro.toUpperCase(),
                            bairro_proponente: data.bairro.toUpperCase(),
                            cidade_proponente: data.localidade.toUpperCase(),
                            uf_endereco_proponente: data.uf.toUpperCase()
                        }));
                        fetchCidades(data.uf, setCidadesEndereco);
                    } else {
                        setFormData(prev => ({
                            ...prev,
                            endereco_residencial_segundo: data.logradouro.toUpperCase(),
                            bairro_segundo: data.bairro.toUpperCase(),
                            cidade_segundo: data.localidade.toUpperCase(),
                            uf_endereco_segundo: data.uf.toUpperCase()
                        }));
                        fetchCidades(data.uf, setCidadesEnderecoSeg);
                    }
                }
            } catch (error) { console.error("Erro ao buscar CEP:", error); }
        }
    };

    const handleModalDelete = async () => {
        if (!window.confirm('Tem certeza que deseja excluir este cliente definitivamente?')) return;
        try {
            const result = await deleteClient(clientId);
            if (result.success) {
                if (onDelete) onDelete(clientId);
                onClose();
            } else { alert('Erro ao excluir cliente: ' + (result.error || 'Erro desconhecido')); }
        } catch (err) { console.error('Error deleting client:', err); alert('Erro ao excluir cliente.'); }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        // Don't uppercase email fields
        const isEmail = name.includes('email');
        let updatedValue = type === 'checkbox' ? checked : (isEmail ? value.toLowerCase() : value.toUpperCase());

        setFormData(prev => {
            const newState = { ...prev, [name]: updatedValue };
            if (name === 'sexo') newState.nacionalidade_proponente = updatedValue === 'M' ? 'BRASILEIRO' : 'BRASILEIRA';
            else if (name === 'sexo_seg') newState.nacionalidade_segundo = updatedValue === 'M' ? 'BRASILEIRO' : 'BRASILEIRA';
            if (name === 'estado_civil_proponente' && updatedValue !== 'CASADO') newState.regime_casamento_proponente = '-';
            if (name === 'estado_civil_segundo' && updatedValue !== 'CASADO') newState.regime_casamento_segundo = '-';
            return newState;
        });
    };

    const getEmailSuggestions = (emailValue) => {
        if (!emailValue || !emailValue.includes('@')) return [];
        const [localPart, domainPart] = emailValue.split('@');
        if (!localPart) return [];

        return COMMON_DOMAINS
            .filter(domain => domain.startsWith(domainPart))
            .map(domain => `${localPart}@${domain}`);
    };

    // Verificação de duplicatas (debounced)
    const checkDuplicateCPF = useMemo(() => debounce(async (cpfCnpj, fieldName, personType) => {
            try {
                // checkDuplicate(cpf, tipo, clientId) - ordem correta dos parâmetros
                const result = await checkDuplicate(cpfCnpj, personType, clientId);
                if (result.exists) {
                    setDuplicateWarning({
                        show: true,
                        clientName: result.client_name || result.client?.nome_proponente || 'Cliente existente',
                        clientId: result.client_id || result.client?.id,
                        field: fieldName
                    });
                    setFieldErrors(prev => ({
                        ...prev,
                        [fieldName]: `CPF/CNPJ já cadastrado: ${result.client_name || 'outro cliente'}`
                    }));
                } else {
                    setDuplicateWarning({ show: false, clientName: '', clientId: null, field: null });
                    setFieldErrors(prev => {
                        const newErrors = { ...prev };
                        if (newErrors[fieldName]?.includes('já cadastrado')) {
                            delete newErrors[fieldName];
                        }
                        return newErrors;
                    });
                }
            } catch (error) {
                console.error('Error checking duplicate:', error);
            }
        }, 800), [clientId]);

    useEffect(() => {
        return () => {
            checkDuplicateCPF.cancel?.();
        };
    }, [checkDuplicateCPF]);

    // Handler para CPF/CNPJ com máscara e validação
    const handleCPFCNPJChange = (e, fieldName, tipo) => {
        const value = e.target.value;
        const masked = tipo === 'PF' ? maskCPF(value) : maskCNPJ(value);

        setFormData(prev => ({ ...prev, [fieldName]: masked }));

        const cleaned = unmask(masked);
        const expectedLength = tipo === 'PF' ? 11 : 14;

        if (cleaned.length === expectedLength) {
            const isValid = tipo === 'PF' ? validateCPF(masked) : validateCNPJ(masked);

            if (isValid) {
                setFieldErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors[fieldName];
                    return newErrors;
                });
                checkDuplicateCPF(cleaned, fieldName, tipo);
            } else {
                setFieldErrors(prev => ({
                    ...prev,
                    [fieldName]: `${tipo === 'PF' ? 'CPF' : 'CNPJ'} inválido`
                }));
            }
        } else if (cleaned.length > 0 && cleaned.length < expectedLength) {
            setFieldErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[fieldName];
                return newErrors;
            });
        }
    };

    // Handler para telefone com máscara
    const handlePhoneChange = (e, dddField) => {
        const { name, value } = e.target;

        if (name === dddField) {
            const masked = maskDDD(value);
            setFormData(prev => ({ ...prev, [name]: masked }));
        } else {
            const masked = maskPhoneNumber(value);
            setFormData(prev => ({ ...prev, [name]: masked }));
        }
    };

    // Handler para CEP com máscara
    const handleCEPChange = (e, fieldName, type = 'titular') => {
        const masked = maskCEP(e.target.value);
        setFormData(prev => ({ ...prev, [fieldName]: masked }));

        const cleaned = unmask(masked);
        if (cleaned.length === 8) {
            handleCEPBlur({ target: { value: masked } }, type);
        }
    };

    // Handler para email com validação
    const handleEmailChange = (e, fieldName) => {
        const value = e.target.value.toLowerCase();
        setFormData(prev => ({ ...prev, [fieldName]: value }));

        if (value.trim()) {
            if (validateEmail(value)) {
                setFieldErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors[fieldName];
                    return newErrors;
                });
            } else {
                setFieldErrors(prev => ({
                    ...prev,
                    [fieldName]: 'E-mail inválido'
                }));
            }
        } else {
            setFieldErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[fieldName];
                return newErrors;
            });
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr || dateStr.includes('/')) return dateStr || '';
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    };

    const handleSelectP2 = (client) => {
        const data = client.data;
        setPersonTypeSegundo(client.data.tipo_pessoa || 'PF');
        setFormData(prev => ({
            ...prev,
            nome_segundo: data.nome_proponente || '',
            razao_social_segundo: data.nome_proponente || '',
            nome_fantasia_segundo: data.nome_fantasia_proponente || '',
            inscricao_estadual_segundo: data.inscricao_estadual_proponente || '',
            cpf_cnpj_segundo: data.cpf_cnpj_proponente || '',
            rg_segundo: data.rg_proponente || '',
            orgao_emissor_segundo: data.orgao_emissor_proponente?.split('/')[0] || '',
            uf_rg_segundo: data.orgao_emissor_proponente?.split('/')[1] || '',
            data_nascimento_segundo: data.data_nascimento_proponente?.split('/').reverse().join('-') || '',
            sexo_seg: data.sexo_masc_proponente ? 'M' : 'F',
            naturalidade_segundo: data.naturalidade_proponente || '',
            uf_naturalidade_segundo: data.uf_naturalidade_proponente || '',
            nacionalidade_segundo: data.nacionalidade_proponente || 'BRASILEIRO',
            estado_civil_segundo: data.estado_civil_proponente || '',
            regime_casamento_segundo: data.regime_casamento_proponente || '',
            profissao_segundo: data.profissao_proponente || '',
            local_trabalho_segundo: data.local_trabalho_proponente || '',
            email_segundo: data.email_proponente || '',
            fone1_ddd_segundo: data.fone1_ddd_proponente || '',
            fone1_numero_segundo: data.fone1_numero_proponente || '',
            fone2_ddd_segundo: data.fone2_ddd_proponente || '',
            fone2_numero_segundo: data.fone2_numero_proponente || '',
            fone_comercial_ddd_segundo: data.fone_comercial_ddd_proponente || '',
            fone_comercial_numero_segundo: data.fone_comercial_numero_proponente || '',
            endereco_residencial_segundo: data.endereco_residencial_proponente || '',
            numero_endereco_segundo: data.numero_endereco_proponente || '',
            bairro_segundo: data.bairro_proponente || '',
            cidade_segundo: data.cidade_proponente || '',
            uf_endereco_segundo: data.uf_endereco_proponente || '',
            cep_segundo: data.cep_proponente || ''
        }));
        setShowP2Selection(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation: CPF/CNPJ is mandatory
        if (!formData.cpf_cnpj_proponente) {
            showToast('Por favor, preencha o CPF ou CNPJ.', 'error');
            return;
        }

        setIsSaving(true);

        try {
            // Only save spouse link to the titular's record
            // For segundo proponente and procurador, create separate records but don't link them
            const isConjuge = formData.has_segundo && formData.tipo_segundo === 'conjuge';

            const submissionData = {
                ...formData,
                data_nascimento_proponente: formatDate(formData.data_nascimento_proponente),
                data_nascimento_segundo: formatDate(formData.data_nascimento_segundo),
                sexo_masc_proponente: personType === 'PF' ? formData.sexo === 'M' : false,
                sexo_fem_proponente: personType === 'PF' ? formData.sexo === 'F' : false,
                tipo_conjuge: isConjuge,
                tipo_segundo_proponente: formData.has_segundo && formData.tipo_segundo === 'segundo',
                tipo_procurador: formData.has_segundo && formData.tipo_segundo === 'procurador',
                sexo_masc_segundo: formData.has_segundo && personTypeSegundo === 'PF' ? formData.sexo_seg === 'M' : false,
                sexo_fem_segundo: formData.has_segundo && personTypeSegundo === 'PF' ? formData.sexo_seg === 'F' : false,
                tipo_pessoa: personType,
                tipo_pessoa_segundo: formData.has_segundo ? personTypeSegundo : null,
                razao_social_segundo: personTypeSegundo === 'PJ' ? formData.razao_social_segundo : '',
                nome_fantasia_segundo: personTypeSegundo === 'PJ' ? formData.nome_fantasia_segundo : '',
                inscricao_estadual_segundo: personTypeSegundo === 'PJ' ? formData.inscricao_estadual_segundo : '',
                nome_segundo: personTypeSegundo === 'PJ' ? formData.razao_social_segundo : formData.nome_segundo,
                orgao_emissor_proponente: personType === 'PF' ? `${formData.orgao_emissor_proponente}/${formData.uf_rg_proponente}` : '',
                inscricao_estadual_proponente: personType === 'PJ' ? formData.inscricao_estadual_proponente : '',
                data_fundacao_proponente: personType === 'PJ' ? formatDate(formData.data_fundacao_proponente) : '',
                orgao_emissor_segundo: formData.has_segundo && personTypeSegundo === 'PF' ? `${formData.orgao_emissor_segundo}/${formData.uf_rg_segundo}` : '',
                // Flag to tell backend: only save spouse link, not others
                salvar_vinculo_segundo: isConjuge
            };

            await onConfirm(submissionData);
            showToast(clientId ? 'Cliente atualizado com sucesso!' : 'Cliente salvo com sucesso!', 'success');
        } catch (error) {
            console.error('Error saving client:', error);
            showToast('Erro ao salvar cliente. Tente novamente.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const renderTitular = () => (
        <div className="tab-pane">
            {duplicateWarning.show && duplicateWarning.field === 'cpf_cnpj_proponente' && (
                <div className="duplicate-warning">
                    <AlertCircle size={20} />
                    <span>
                        Já existe um cliente com este CPF/CNPJ: <strong>{duplicateWarning.clientName}</strong>
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            // TODO: Trigger edit of existing client
                        }}
                    >
                        Ver Cliente
                    </button>
                    <button
                        type="button"
                        onClick={() => setDuplicateWarning({ show: false, clientName: '', clientId: null, field: null })}
                    >
                        Continuar
                    </button>
                </div>
            )}
            <div className="form-section-title"><User size={16} /> Identificação</div>
            <div className="form-grid">
                <div className="form-group full-width">
                    <label>{personType === 'PF' ? 'Nome Completo' : 'Razão Social'}</label>
                    <input type="text" name="nome_proponente" value={formData.nome_proponente} onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label>{personType === 'PF' ? 'CPF' : 'CNPJ'}</label>
                    <input
                        type="text"
                        name="cpf_cnpj_proponente"
                        value={formData.cpf_cnpj_proponente}
                        onChange={(e) => handleCPFCNPJChange(e, 'cpf_cnpj_proponente', personType)}
                        className={fieldErrors.cpf_cnpj_proponente ? 'input-error' : ''}
                        maxLength={personType === 'PF' ? 14 : 18}
                        placeholder={personType === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                    />
                    {fieldErrors.cpf_cnpj_proponente && (
                        <span className="error-message">{fieldErrors.cpf_cnpj_proponente}</span>
                    )}
                </div>
                {personType === 'PF' ? (
                    <>
                        <div className="form-group"><label>RG</label><input type="text" name="rg_proponente" value={formData.rg_proponente} onChange={handleChange} /></div>
                        <div className="form-group"><label>Órgão Emissor</label><div className="flex-row"><input type="text" name="orgao_emissor_proponente" value={formData.orgao_emissor_proponente} onChange={handleChange} placeholder="SSP" style={{ flex: 1 }} /><select name="uf_rg_proponente" value={formData.uf_rg_proponente} onChange={handleChange} style={{ width: '75px' }}><option value="">UF</option>{estados.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}</select></div></div>
                        <div className="form-group"><label>Sexo</label><div className="radio-group"><label className="radio-label"><input type="radio" name="sexo" value="M" checked={formData.sexo === 'M'} onChange={handleChange} /> M</label><label className="radio-label"><input type="radio" name="sexo" value="F" checked={formData.sexo === 'F'} onChange={handleChange} /> F</label></div></div>
                        <div className="form-group"><label>Data Nascimento</label><input type="date" name="data_nascimento_proponente" value={formData.data_nascimento_proponente} onChange={handleChange} /></div>
                    </>
                ) : (
                    <>
                        <div className="form-group"><label>Inscrição Estadual</label><input type="text" name="inscricao_estadual_proponente" value={formData.inscricao_estadual_proponente} onChange={handleChange} placeholder="ISENTO" /></div>
                        <div className="form-group"><label>Data de Fundação</label><input type="date" name="data_fundacao_proponente" value={formData.data_fundacao_proponente} onChange={handleChange} /></div>
                    </>
                )}
            </div>
            <div className="form-section-title" style={{ marginTop: '1.5rem' }}><MapPin size={16} /> Endereço Residencial</div>
            <div className="form-grid">
                <div className="form-group"><label>CEP</label><input type="text" name="cep_proponente" value={formData.cep_proponente} onChange={(e) => handleCEPChange(e, 'cep_proponente', 'titular')} placeholder="00000-000" maxLength="9" /></div>
                <div className="form-group"><label>Cidade / UF</label><div className="flex-row"><select name="uf_endereco_proponente" value={formData.uf_endereco_proponente} onChange={(e) => handleUFChange(e, 'uf_endereco_proponente', setCidadesEndereco)} style={{ width: '75px' }}><option value="">UF</option>{estados.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}</select><select name="cidade_proponente" value={formData.cidade_proponente} onChange={handleChange} style={{ flex: 1 }}><option value="">CIDADE...</option>{cidadesEndereco.map(city => <option key={city} value={city}>{city}</option>)}</select></div></div>
                <div className="form-group full-width"><label>Rua / Logradouro</label><input type="text" name="endereco_residencial_proponente" value={formData.endereco_residencial_proponente} onChange={handleChange} /></div>
                <div className="form-group"><label>Número / Comp.</label><input type="text" name="numero_endereco_proponente" value={formData.numero_endereco_proponente} onChange={handleChange} /></div>
                <div className="form-group"><label>Bairro</label><input type="text" name="bairro_proponente" value={formData.bairro_proponente} onChange={handleChange} /></div>
            </div>
            {personType === 'PF' && (
                <>
                    <div className="form-section-title" style={{ marginTop: '1.5rem' }}><Briefcase size={16} /> Profissional</div>
                    <div className="form-grid">
                        <div className="form-group"><label>Estado Civil</label><select name="estado_civil_proponente" value={formData.estado_civil_proponente} onChange={handleChange}><option value="">SELECIONE...</option><option value="SOLTEIRO">SOLTEIRO(A)</option><option value="CASADO">CASADO(A)</option><option value="DIVORCIADO">DIVORCIADO(A)</option><option value="VIÚVO">VIÚVO(A)</option><option value="UNIÃO ESTÁVEL">UNIÃO ESTÁVEL</option></select></div>
                        <div className="form-group"><label>Regime Casamento</label>
                            <select name="regime_casamento_proponente" value={formData.regime_casamento_proponente} onChange={handleChange} disabled={formData.estado_civil_proponente !== 'CASADO' && formData.estado_civil_proponente !== 'UNIÃO ESTÁVEL'} style={{ opacity: (formData.estado_civil_proponente !== 'CASADO' && formData.estado_civil_proponente !== 'UNIÃO ESTÁVEL') ? 0.6 : 1 }}>
                                <option value="">SELECIONE...</option>
                                <option value="COMUNHÃO PARCIAL">COMUNHÃO PARCIAL DE BENS</option>
                                <option value="COMUNHÃO UNIVERSAL">COMUNHÃO UNIVERSAL DE BENS</option>
                                <option value="SEPARAÇÃO TOTAL">SEPARAÇÃO TOTAL DE BENS</option>
                                <option value="SEPARAÇÃO OBRIGATÓRIA">SEPARAÇÃO OBRIGATÓRIA</option>
                                <option value="PARTICIPAÇÃO FINAL">PARTICIPAÇÃO FINAL NOS AQUESTOS</option>
                                <option value="UNIÃO ESTÁVEL">UNIÃO ESTÁVEL (COM CONTRATO)</option>
                                <option value="UNIÃO ESTÁVEL S/C">UNIÃO ESTÁVEL (SEM CONTRATO)</option>
                                <option value="-">NÃO SE APLICA</option>
                            </select>
                        </div>
                        <div className="form-group"><label>Profissão</label><input type="text" name="profissao_proponente" value={formData.profissao_proponente} onChange={handleChange} /></div>
                        <div className="form-group"><label>Naturalidade / UF</label><div className="flex-row"><select name="uf_naturalidade_proponente" value={formData.uf_naturalidade_proponente} onChange={(e) => handleUFChange(e, 'uf_naturalidade_proponente', setCidadesNaturalidade)} style={{ width: '75px' }}><option value="">UF</option>{estados.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}</select><select name="naturalidade_proponente" value={formData.naturalidade_proponente} onChange={handleChange} style={{ flex: 1 }}><option value="">CIDADE...</option>{cidadesNaturalidade.map(city => <option key={city} value={city}>{city}</option>)}</select></div></div>
                    </div>
                </>
            )}
            <div className="form-section-title" style={{ marginTop: '1.5rem' }}><Contact size={16} /> Contatos</div>
            <div className="form-grid">
                <div className="form-group">
                    <label>E-mail</label>
                    <input
                        type="email"
                        name="email_proponente"
                        value={formData.email_proponente}
                        onChange={(e) => handleEmailChange(e, 'email_proponente')}
                        className={fieldErrors.email_proponente ? 'input-error' : ''}
                        style={{ textTransform: 'none' }}
                        list="email-suggestions-titular"
                    />
                    {fieldErrors.email_proponente && (
                        <span className="error-message">{fieldErrors.email_proponente}</span>
                    )}
                </div>
                <datalist id="email-suggestions-titular">
                    {getEmailSuggestions(formData.email_proponente).map(suggestion => (
                        <option key={suggestion} value={suggestion} />
                    ))}
                </datalist>
                <div className="form-group"><label>Telefone Principal</label><div className="flex-row"><input type="text" name="fone1_ddd_proponente" value={formData.fone1_ddd_proponente} onChange={(e) => handlePhoneChange(e, 'fone1_ddd_proponente')} style={{ width: '50px' }} placeholder="DDD" maxLength="2" /><input type="text" name="fone1_numero_proponente" value={formData.fone1_numero_proponente} onChange={(e) => handlePhoneChange(e, 'fone1_ddd_proponente')} style={{ flex: 1 }} placeholder="NÚMERO" maxLength="10" /></div></div>
                <div className="form-group"><label>Telefone 02</label><div className="flex-row"><input type="text" name="fone2_ddd_proponente" value={formData.fone2_ddd_proponente} onChange={(e) => handlePhoneChange(e, 'fone2_ddd_proponente')} style={{ width: '50px' }} placeholder="DDD" maxLength="2" /><input type="text" name="fone2_numero_proponente" value={formData.fone2_numero_proponente} onChange={(e) => handlePhoneChange(e, 'fone2_ddd_proponente')} style={{ flex: 1 }} placeholder="NÚMERO" maxLength="10" /></div></div>
                <div className="form-group"><label>Telefone Comercial</label><div className="flex-row"><input type="text" name="fone_comercial_ddd_proponente" value={formData.fone_comercial_ddd_proponente} onChange={(e) => handlePhoneChange(e, 'fone_comercial_ddd_proponente')} style={{ width: '50px' }} placeholder="DDD" maxLength="2" /><input type="text" name="fone_comercial_numero_proponente" value={formData.fone_comercial_numero_proponente} onChange={(e) => handlePhoneChange(e, 'fone_comercial_ddd_proponente')} style={{ flex: 1 }} placeholder="NÚMERO" maxLength="10" /></div></div>
            </div>
            <div className="form-group-checkbox" style={{ marginTop: '1.5rem' }}><label className="checkbox-label"><input type="checkbox" name="has_referencia_titular" checked={formData.has_referencia_titular} onChange={handleChange} /><strong>Adicionar Referência Pessoal?</strong></label></div>
            {formData.has_referencia_titular && (
                <div className="form-grid" style={{ marginTop: '1rem' }}><div className="form-group full-width"><label>Nome</label><input type="text" name="nome_referencia_proponente" value={formData.nome_referencia_proponente} onChange={handleChange} /></div><div className="form-group"><label>Telefone</label><div className="flex-row"><input type="text" name="fone_referencia_ddd_proponente" value={formData.fone_referencia_ddd_proponente} onChange={handleChange} style={{ width: '50px' }} /><input type="text" name="fone_referencia_numero_proponente" value={formData.fone_referencia_numero_proponente} onChange={handleChange} style={{ flex: 1 }} /></div></div></div>
            )}
        </div>
    );

    // Function to clear spouse link
    const handleRemoveSpouseLink = () => {
        setFormData(prev => ({
            ...prev,
            has_segundo: false,
            tipo_segundo: 'none',
            nome_segundo: '',
            cpf_cnpj_segundo: '',
            rg_segundo: '',
            orgao_emissor_segundo: '',
            uf_rg_segundo: '',
            data_nascimento_segundo: '',
            sexo_seg: 'M',
            naturalidade_segundo: '',
            uf_naturalidade_segundo: '',
            nacionalidade_segundo: 'BRASILEIRO',
            estado_civil_segundo: '',
            regime_casamento_segundo: '',
            profissao_segundo: '',
            local_trabalho_segundo: '',
            email_segundo: '',
            fone1_ddd_segundo: '',
            fone1_numero_segundo: '',
            fone2_ddd_segundo: '',
            fone2_numero_segundo: '',
            fone_comercial_ddd_segundo: '',
            fone_comercial_numero_segundo: '',
            endereco_residencial_segundo: '',
            numero_endereco_segundo: '',
            bairro_segundo: '',
            cidade_segundo: '',
            uf_endereco_segundo: '',
            cep_segundo: ''
        }));
        showToast('Vínculo de cônjuge removido. Salve para confirmar.', 'info');
    };

    const renderSegundo = () => (
        <div className="tab-pane">
            <div className="form-group-checkbox" style={{ marginBottom: '1rem' }}>
                <label className="checkbox-label"><input type="checkbox" name="has_segundo" checked={formData.has_segundo} onChange={handleChange} /><strong>Adicionar 2º Proponente / Cônjuge / Procurador?</strong></label>
            </div>
            {formData.has_segundo && (
                <>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label>Vínculo do 2º Proponente</label>
                        <select name="tipo_segundo" value={formData.tipo_segundo} onChange={(e) => { const v = e.target.value; setFormData(p => ({ ...p, tipo_segundo: v })); if (v === 'conjuge') setPersonTypeSegundo('PF'); }}>
                            <option value="none">SELECIONE...</option>
                            {/* Only show spouse option for PF (individuals), not for PJ (companies) */}
                            {personType === 'PF' && <option value="conjuge">CÔNJUGE (MARIDO/ESPOSA)</option>}
                            <option value="segundo">2º PROPONENTE (SÓCIO/CO-COMPRADOR)</option>
                            <option value="procurador">PROCURADOR</option>
                        </select>
                    </div>

                    {/* Informative alert about link storage */}
                    {formData.tipo_segundo === 'conjuge' && (
                        <div style={{ background: 'rgba(49, 130, 206, 0.1)', border: '1px solid var(--accent-color)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <AlertCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                O vínculo de cônjuge será salvo no cadastro do titular.
                            </span>
                            {initialData?.tipo_conjuge && (
                                <button type="button" onClick={handleRemoveSpouseLink} style={{ background: 'var(--danger-color)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Trash2 size={12} /> Remover Vínculo
                                </button>
                            )}
                        </div>
                    )}
                    {(formData.tipo_segundo === 'segundo' || formData.tipo_segundo === 'procurador') && (
                        <div style={{ background: 'rgba(237, 137, 54, 0.1)', border: '1px solid #ED8936', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <AlertCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            <strong>Atenção:</strong> Este vínculo NÃO será salvo no cadastro. Apenas será usado nesta proposta. Um cadastro separado será criado para este proponente.
                        </div>
                    )}

                    {formData.tipo_segundo !== 'conjuge' && formData.tipo_segundo !== 'none' && (
                        <div className="person-type-selector" style={{ marginBottom: '1.5rem' }}>
                            <label style={{ marginBottom: '0.5rem', display: 'block', fontWeight: '600' }}>Tipo de Pessoa</label>
                            <div className="type-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="button" className={`type-btn ${personTypeSegundo === 'PF' ? 'active' : ''}`} onClick={() => setPersonTypeSegundo('PF')} style={{ flex: 1, padding: '0.75rem', border: personTypeSegundo === 'PF' ? '2px solid var(--accent-color)' : '2px solid var(--border-color)', background: personTypeSegundo === 'PF' ? 'rgba(49, 130, 206, 0.1)' : 'white', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: personTypeSegundo === 'PF' ? '600' : '400', color: personTypeSegundo === 'PF' ? 'var(--accent-color)' : 'var(--text-secondary)' }}><User size={18} /> Pessoa Física</button>
                                <button type="button" className={`type-btn ${personTypeSegundo === 'PJ' ? 'active' : ''}`} onClick={() => setPersonTypeSegundo('PJ')} style={{ flex: 1, padding: '0.75rem', border: personTypeSegundo === 'PJ' ? '2px solid var(--accent-color)' : '2px solid var(--border-color)', background: personTypeSegundo === 'PJ' ? 'rgba(49, 130, 206, 0.1)' : 'white', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: personTypeSegundo === 'PJ' ? '600' : '400', color: personTypeSegundo === 'PJ' ? 'var(--accent-color)' : 'var(--text-secondary)' }}><Building2 size={18} /> Pessoa Jurídica</button>
                            </div>
                        </div>
                    )}

                    <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Building2 size={16} /> Identificação</div>
                        <button type="button" className="btn-search-agenda" onClick={() => setShowP2Selection(true)} style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}><Search size={14} /> Buscar na Agenda</button>
                    </div>

                    <div className="form-grid">
                        {personTypeSegundo === 'PJ' && formData.tipo_segundo !== 'conjuge' ? (
                            <>
                                <div className="form-group full-width"><label>Razão Social</label><input type="text" name="razao_social_segundo" value={formData.razao_social_segundo} onChange={handleChange} /></div>
                                <div className="form-group"><label>Nome Fantasia</label><input type="text" name="nome_fantasia_segundo" value={formData.nome_fantasia_segundo} onChange={handleChange} /></div>
                                <div className="form-group"><label>CNPJ</label><input type="text" name="cpf_cnpj_segundo" value={formData.cpf_cnpj_segundo} onChange={(e) => handleCPFCNPJChange(e, 'cpf_cnpj_segundo', 'PJ')} className={fieldErrors.cpf_cnpj_segundo ? 'input-error' : ''} placeholder="00.000.000/0000-00" maxLength="18" />{fieldErrors.cpf_cnpj_segundo && (<span className="error-message">{fieldErrors.cpf_cnpj_segundo}</span>)}</div>
                                <div className="form-group"><label>Inscrição Estadual</label><input type="text" name="inscricao_estadual_segundo" value={formData.inscricao_estadual_segundo} onChange={handleChange} placeholder="ISENTO" /></div>
                            </>
                        ) : (
                            <>
                                <div className="form-group full-width"><label>Nome Completo</label><input type="text" name="nome_segundo" value={formData.nome_segundo} onChange={handleChange} /></div>
                                <div className="form-group"><label>CPF</label><input type="text" name="cpf_cnpj_segundo" value={formData.cpf_cnpj_segundo} onChange={(e) => handleCPFCNPJChange(e, 'cpf_cnpj_segundo', 'PF')} className={fieldErrors.cpf_cnpj_segundo ? 'input-error' : ''} placeholder="000.000.000-00" maxLength="14" />{fieldErrors.cpf_cnpj_segundo && (<span className="error-message">{fieldErrors.cpf_cnpj_segundo}</span>)}</div>
                                <div className="form-group"><label>RG / Órgão</label><div className="flex-row"><input type="text" name="rg_segundo" value={formData.rg_segundo} onChange={handleChange} style={{ flex: 1 }} /><input type="text" name="orgao_emissor_segundo" value={formData.orgao_emissor_segundo} onChange={handleChange} style={{ width: '60px' }} placeholder="SSP" /><select name="uf_rg_segundo" value={formData.uf_rg_segundo} onChange={handleChange} style={{ width: '70px' }}><option value="">UF</option>{estados.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}</select></div></div>
                                <div className="form-group"><label>Sexo</label><div className="radio-group"><label className="radio-label"><input type="radio" name="sexo_seg" value="M" checked={formData.sexo_seg === 'M'} onChange={handleChange} /> M</label><label className="radio-label"><input type="radio" name="sexo_seg" value="F" checked={formData.sexo_seg === 'F'} onChange={handleChange} /> F</label></div></div>
                                <div className="form-group"><label>Data Nascimento</label><input type="date" name="data_nascimento_segundo" value={formData.data_nascimento_segundo} onChange={handleChange} /></div>
                                <div className="form-group"><label>Naturalidade / UF</label><div className="flex-row"><select name="uf_naturalidade_segundo" value={formData.uf_naturalidade_segundo} onChange={(e) => handleUFChange(e, 'uf_naturalidade_segundo', setCidadesNaturalidadeSeg)} style={{ width: '75px' }}><option value="">UF</option>{estados.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}</select><select name="naturalidade_segundo" value={formData.naturalidade_segundo} onChange={handleChange} style={{ flex: 1 }}><option value="">CIDADE...</option>{cidadesNaturalidadeSeg.map(city => <option key={city} value={city}>{city}</option>)}{!cidadesNaturalidadeSeg.includes(formData.naturalidade_segundo) && formData.naturalidade_segundo && <option value={formData.naturalidade_segundo}>{formData.naturalidade_segundo}</option>}</select></div></div>
                                <div className="form-group"><label>Nacionalidade</label><input type="text" name="nacionalidade_segundo" value={formData.nacionalidade_segundo} onChange={handleChange} /></div>
                            </>
                        )}
                    </div>

                    <div className="form-section-title" style={{ marginTop: '1.5rem' }}><Briefcase size={16} /> Profissional e Social</div>
                    <div className="form-grid">
                        <div className="form-group"><label>Estado Civil</label><select name="estado_civil_segundo" value={formData.estado_civil_segundo} onChange={handleChange}><option value="">SELECIONE...</option><option value="SOLTEIRO">SOLTEIRO(A)</option><option value="CASADO">CASADO(A)</option><option value="DIVORCIADO">DIVORCIADO(A)</option><option value="VIÚVO">VIÚVO(A)</option><option value="UNIÃO ESTÁVEL">UNIÃO ESTÁVEL</option></select></div>
                        <div className="form-group"><label>Regime Casamento</label>
                            <select name="regime_casamento_segundo" value={formData.regime_casamento_segundo} onChange={handleChange} disabled={formData.estado_civil_segundo !== 'CASADO' && formData.estado_civil_segundo !== 'UNIÃO ESTÁVEL'} style={{ opacity: (formData.estado_civil_segundo !== 'CASADO' && formData.estado_civil_segundo !== 'UNIÃO ESTÁVEL') ? 0.6 : 1 }}>
                                <option value="">SELECIONE...</option>
                                <option value="COMUNHÃO PARCIAL">COMUNHÃO PARCIAL DE BENS</option>
                                <option value="COMUNHÃO UNIVERSAL">COMUNHÃO UNIVERSAL DE BENS</option>
                                <option value="SEPARAÇÃO TOTAL">SEPARAÇÃO TOTAL DE BENS</option>
                                <option value="SEPARAÇÃO OBRIGATÓRIA">SEPARAÇÃO OBRIGATÓRIA</option>
                                <option value="PARTICIPAÇÃO FINAL">PARTICIPAÇÃO FINAL NOS AQUESTOS</option>
                                <option value="UNIÃO ESTÁVEL">UNIÃO ESTÁVEL (COM CONTRATO)</option>
                                <option value="UNIÃO ESTÁVEL S/C">UNIÃO ESTÁVEL (SEM CONTRATO)</option>
                                <option value="-">NÃO SE APLICA</option>
                            </select>
                        </div>
                        <div className="form-group"><label>Profissão</label><input type="text" name="profissao_segundo" value={formData.profissao_segundo} onChange={handleChange} /></div>
                        <div className="form-group"><label>Local de Trabalho</label><input type="text" name="local_trabalho_segundo" value={formData.local_trabalho_segundo} onChange={handleChange} /></div>
                    </div>

                    <div className="form-section-title" style={{ marginTop: '1.5rem' }}><Contact size={16} /> Contatos</div>
                    <div className="form-grid">
                        <div className="form-group full-width"><label>E-mail</label><input type="email" name="email_segundo" value={formData.email_segundo} onChange={(e) => handleEmailChange(e, 'email_segundo')} className={fieldErrors.email_segundo ? 'input-error' : ''} style={{ textTransform: 'none' }} list="email-suggestions-segundo" />{fieldErrors.email_segundo && (<span className="error-message">{fieldErrors.email_segundo}</span>)}</div>
                        <datalist id="email-suggestions-segundo">
                            {getEmailSuggestions(formData.email_segundo).map(suggestion => (
                                <option key={suggestion} value={suggestion} />
                            ))}
                        </datalist>
                        <div className="form-group"><label>Telefone Principal</label><div className="flex-row"><input type="text" name="fone1_ddd_segundo" value={formData.fone1_ddd_segundo} onChange={(e) => handlePhoneChange(e, 'fone1_ddd_segundo')} style={{ width: '50px' }} placeholder="DDD" maxLength="2" /><input type="text" name="fone1_numero_segundo" value={formData.fone1_numero_segundo} onChange={(e) => handlePhoneChange(e, 'fone1_ddd_segundo')} style={{ flex: 1 }} placeholder="NÚMERO" maxLength="10" /></div></div>
                        <div className="form-group"><label>Telefone 02</label><div className="flex-row"><input type="text" name="fone2_ddd_segundo" value={formData.fone2_ddd_segundo} onChange={(e) => handlePhoneChange(e, 'fone2_ddd_segundo')} style={{ width: '50px' }} maxLength="2" /><input type="text" name="fone2_numero_segundo" value={formData.fone2_numero_segundo} onChange={(e) => handlePhoneChange(e, 'fone2_ddd_segundo')} style={{ flex: 1 }} maxLength="10" /></div></div>
                        <div className="form-group"><label>Telefone Comercial</label><div className="flex-row"><input type="text" name="fone_comercial_ddd_segundo" value={formData.fone_comercial_ddd_segundo} onChange={(e) => handlePhoneChange(e, 'fone_comercial_ddd_segundo')} style={{ width: '50px' }} maxLength="2" /><input type="text" name="fone_comercial_numero_segundo" value={formData.fone_comercial_numero_segundo} onChange={(e) => handlePhoneChange(e, 'fone_comercial_ddd_segundo')} style={{ flex: 1 }} maxLength="10" /></div></div>
                    </div>

                    <div className="form-section-title" style={{ marginTop: '1.5rem' }}><MapPin size={16} /> Endereço Residencial</div>
                    <div className="form-grid">
                        <div className="form-group"><label>CEP</label><input type="text" name="cep_segundo" value={formData.cep_segundo} onChange={(e) => handleCEPChange(e, 'cep_segundo', 'segundo')} placeholder="00000-000" maxLength="9" /></div>
                        <div className="form-group"><label>Cidade / UF</label><div className="flex-row"><select name="uf_endereco_segundo" value={formData.uf_endereco_segundo} onChange={(e) => handleUFChange(e, 'uf_endereco_segundo', setCidadesEnderecoSeg)} style={{ width: '75px' }}><option value="">UF</option>{estados.map(uf => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}</select><select name="cidade_segundo" value={formData.cidade_segundo} onChange={handleChange} style={{ flex: 1 }}><option value="">CIDADE...</option>{cidadesEnderecoSeg.map(city => <option key={city} value={city}>{city}</option>)}{!cidadesEnderecoSeg.includes(formData.cidade_segundo) && formData.cidade_segundo && <option value={formData.cidade_segundo}>{formData.cidade_segundo}</option>}</select></div></div>
                        <div className="form-group full-width"><label>Rua / Logradouro</label><input type="text" name="endereco_residencial_segundo" value={formData.endereco_residencial_segundo} onChange={handleChange} /></div>
                        <div className="form-group"><label>Número / Comp.</label><input type="text" name="numero_endereco_segundo" value={formData.numero_endereco_segundo} onChange={handleChange} /></div>
                        <div className="form-group"><label>Bairro</label><input type="text" name="bairro_segundo" value={formData.bairro_segundo} onChange={handleChange} /></div>
                    </div>

                    <div className="form-group-checkbox" style={{ marginTop: '1.5rem' }}><label className="checkbox-label"><input type="checkbox" name="has_referencia_segundo" checked={formData.has_referencia_segundo} onChange={handleChange} /><strong>Adicionar Referência Pessoal?</strong></label></div>
                    {formData.has_referencia_segundo && (
                        <>
                            <div className="form-section-title" style={{ marginTop: '1rem' }}><Users size={16} /> Referência Pessoal</div>
                            <div className="form-grid">
                                <div className="form-group full-width"><label>Nome da Referência</label><input type="text" name="nome_referencia_segundo" value={formData.nome_referencia_segundo} onChange={handleChange} /></div>
                                <div className="form-group"><label>Telefone</label><div className="flex-row"><input type="text" name="fone_referencia_ddd_segundo" value={formData.fone_referencia_ddd_segundo} onChange={handleChange} style={{ width: '50px' }} placeholder="DDD" /><input type="text" name="fone_referencia_numero_segundo" value={formData.fone_referencia_numero_segundo} onChange={handleChange} style={{ flex: 1 }} placeholder="NÚMERO" /></div></div>
                                <div className="form-group"><label>Parentesco / Vínculo</label><input type="text" name="parentesco_referencia_segundo" value={formData.parentesco_referencia_segundo} onChange={handleChange} placeholder="Ex: AMIGO, IRMÃO" /></div>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );

    const handleGenerateResidencePDF = () => {
        if (!formData.nome_proponente) {
            alert('Por favor, preencha pelo menos o nome do proponente para gerar a declaração.');
            return;
        }

        // Map form fields to utility fields
        // Ensure CPF and CEP have proper formatting
        const formatCPF = (cpf) => {
            if (!cpf) return '';
            const cleaned = cpf.replace(/\D/g, '');
            if (cleaned.length === 11) {
                return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            }
            return cpf; // Return as-is if already formatted or invalid
        };

        const formatCEP = (cep) => {
            if (!cep) return '';
            const cleaned = cep.replace(/\D/g, '');
            if (cleaned.length === 8) {
                return cleaned.replace(/(\d{5})(\d{3})/, '$1-$2');
            }
            return cep; // Return as-is if already formatted or invalid
        };

        const mappedData = {
            p1: {
                nome: formData.nome_proponente,
                cpf: formatCPF(formData.cpf_cnpj_proponente),
                rg: formData.rg_proponente,
                orgao: `${formData.orgao_emissor_proponente}/${formData.uf_rg_proponente}`,
                endereco: `${formData.endereco_residencial_proponente}, ${formData.numero_endereco_proponente}`,
                bairro: formData.bairro_proponente,
                cep: formatCEP(formData.cep_proponente),
                cidade: formData.cidade_proponente,
                uf: formData.uf_endereco_proponente,
            },
            p2: formData.has_segundo ? {
                nome: formData.nome_segundo,
                cpf: formatCPF(formData.cpf_cnpj_segundo),
                rg: formData.rg_segundo,
                orgao: `${formData.orgao_emissor_segundo}/${formData.uf_rg_segundo}`,
                endereco: `${formData.endereco_residencial_segundo || formData.endereco_residencial_proponente}, ${formData.numero_endereco_segundo || formData.numero_endereco_proponente}`,
                bairro: formData.bairro_segundo || formData.bairro_proponente,
                cep: formatCEP(formData.cep_segundo || formData.cep_proponente),
                cidade: formData.cidade_segundo || formData.cidade_proponente,
                uf: formData.uf_endereco_segundo || formData.uf_endereco_proponente,
            } : null,
            lote: lot?.LT || '-',
            quadra: lot?.QD || '-'
        };

        // Extract city/UF from obraName (e.g., "RESIDENCIAL JARDIM DO VALLE - DOM ELISEU" -> "DOM ELISEU - PA")
        // Note: The obraName usually has the city after the dash. 
        // We'll try to find the city and append the state of the lot if possible, 
        // or just use what's after the dash.
        let cityUF = "";
        if (obraName && obraName.includes('-')) {
            cityUF = obraName.split('-').pop().trim();
            // All current OBRAS are in PA, ensure the state is included
            if (!cityUF.includes(' - ') && !cityUF.includes('-')) {
                cityUF = `${cityUF} - PA`;
            }
        }

        if (declarationMode === 'individual' && formData.has_segundo && formData.tipo_segundo !== 'conjuge') { const p1Data = { p1: mappedData.p1, p2: null, lote: mappedData.lote, quadra: mappedData.quadra }; generateResidenceDeclaration(p1Data, cityUF, residenceDeclarationDate, obraName, residenceReason, residenceReasonOther); setTimeout(() => { const p2Data = { p1: mappedData.p2, p2: null, lote: mappedData.lote, quadra: mappedData.quadra }; generateResidenceDeclaration(p2Data, cityUF, residenceDeclarationDate, obraName, residenceReason, residenceReasonOther); }, 500); } else { generateResidenceDeclaration(mappedData, cityUF, residenceDeclarationDate, obraName, residenceReason, residenceReasonOther); }
    };

    const renderDocumentos = () => (
        <div className="tab-pane">
            <div className="form-section-title"><FileText size={16} /> Documentos Adicionais</div>

            <div className="documents-card">
                <div className="doc-item">
                    <div className="doc-info">
                        <h3>Declaracao de Residencia</h3>
                        <p>Gera o PDF da declaracao para os proponentes qualificados no formulario.</p>
                    </div>

                    <div className="doc-controls">
                        <div className="form-group">
                            <label>Data do Documento</label>
                            <input
                                type="date"
                                value={residenceDeclarationDate}
                                onChange={(e) => setResidenceDeclarationDate(e.target.value)}
                            />
                        </div>

                        {formData.has_segundo && formData.tipo_segundo !== 'conjuge' && (
                            <div className="form-group">
                                <label>Modo de Geracao</label>
                                <select
                                    value={declarationMode}
                                    onChange={(e) => setDeclarationMode(e.target.value)}
                                    style={{ width: '100%' }}
                                >
                                    <option value="combined">Declaracao Combinada (Ambos no mesmo PDF)</option>
                                    <option value="individual">Declaracoes Individuais (1 PDF para cada)</option>
                                </select>
                            </div>
                        )}

                        <button
                            type="button"
                            className="btn-generate-doc"
                            onClick={handleGenerateResidencePDF}
                        >
                            <FileText size={18} />
                            {declarationMode === 'individual' && formData.has_segundo && formData.tipo_segundo !== 'conjuge' ? 'GERAR 2 PDFs (INDIVIDUAL)' : 'GERAR PDF AGORA'}
                        </button>
                    </div>
                </div>

                <div className="doc-item" style={{ marginTop: '1.5rem', flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="doc-info">
                        <h3>Motivo da Declaracao</h3>
                        <p>Selecione o motivo pelo qual nao possui comprovante de endereco:</p>
                    </div>

                    <div className="residence-reason-options" style={{ marginTop: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="residenceReason"
                                value="option1"
                                checked={residenceReason === 'option1'}
                                onChange={(e) => setResidenceReason(e.target.value)}
                                style={{ marginTop: '0.2rem' }}
                            />
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem' }}>Não resido em endereço fixo/próprio (locatário)</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="residenceReason"
                                value="option2"
                                checked={residenceReason === 'option2'}
                                onChange={(e) => setResidenceReason(e.target.value)}
                                style={{ marginTop: '0.2rem' }}
                            />
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem' }}>Bairro onde resido não possui rede de água ou elétrica regularizada pela prefeitura</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="residenceReason"
                                value="option3"
                                checked={residenceReason === 'option3'}
                                onChange={(e) => setResidenceReason(e.target.value)}
                                style={{ marginTop: '0.2rem' }}
                            />
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem' }}>Declaro que resido no endereço acima citado</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="residenceReason"
                                value="outros"
                                checked={residenceReason === 'outros'}
                                onChange={(e) => setResidenceReason(e.target.value)}
                                style={{ marginTop: '0.2rem' }}
                            />
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem' }}>Outros (especifique abaixo)</span>
                        </label>

                        {residenceReason === 'outros' && (
                            <div className="form-group" style={{ marginTop: '0.5rem', marginLeft: '1.75rem' }}>
                                <input
                                    type="text"
                                    value={residenceReasonOther}
                                    onChange={(e) => setResidenceReasonOther(e.target.value.toUpperCase())}
                                    placeholder="DIGITE O MOTIVO..."
                                    style={{ width: '100%' }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="doc-tips">
                <AlertCircle size={16} />
                <p>Os dados do Lote ({lot?.QD || '-'}/{lot?.LT || '-'}) e a localidade do empreendimento serão inseridos automaticamente.</p>
            </div>
        </div>
    );

    const tabs = [
        { id: 'titular', label: 'Comprador', icon: <User size={16} /> },
        { id: 'segundo', label: '2º Proponente', icon: <Users size={16} /> },
        { id: 'documentos', label: 'Documentos', icon: <FileText size={16} /> }
    ];
    const goToNext = () => { const idx = tabs.findIndex(t => t.id === activeTab); if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1].id); };
    const goToPrev = () => { const idx = tabs.findIndex(t => t.id === activeTab); if (idx > 0) setActiveTab(tabs[idx - 1].id); };

    return (
        <div className="client-modal-overlay">
            <div className="client-modal-content animate-pop-in" onClick={e => e.stopPropagation()}>
                <header className="client-modal-header">
                    <div className="header-title-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {onBack && (
                            <button
                                type="button"
                                className="back-btn"
                                onClick={(e) => { e.stopPropagation(); onBack(); }}
                                title="Voltar para seleção de clientes"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                            >
                                <ChevronLeft size={24} color="#4A5568" />
                            </button>
                        )}
                        <div className="header-info"><h2>Cadastro da Proposta</h2><p>Preencha os dados do cliente</p></div>
                    </div>
                    <button className="close-btn" type="button" onClick={(e) => { e.stopPropagation(); onClose(); }}><X size={24} /></button>
                </header>
                {/* Only show type selector for new clients, not editing existing ones */}
                {!clientId && (
                    <div className="person-type-banner"><button type="button" className={`banner-btn ${personType === 'PF' ? 'active' : ''}`} onClick={() => setPersonType('PF')}><User size={18} /> PESSOA FÍSICA</button><button type="button" className={`banner-btn ${personType === 'PJ' ? 'active' : ''}`} onClick={() => setPersonType('PJ')}><Building2 size={18} /> PESSOA JURÍDICA</button></div>
                )}
                <nav className="client-modal-tabs">{tabs.map(tab => (<button type="button" key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.icon}<span>{tab.label}</span></button>))}</nav>
                <form onSubmit={handleSubmit} className="flex-form">
                    <div className="client-modal-body">
                        {activeTab === 'titular' && renderTitular()}
                        {activeTab === 'segundo' && renderSegundo()}
                        {activeTab === 'documentos' && renderDocumentos()}
                    </div>
                    <footer className="client-modal-footer">
                        <div className="nav-buttons">
                            <div className="footer-left">{activeTab !== 'titular' && <button type="button" className="btn-nav" onClick={goToPrev}><ChevronLeft size={18} /> Anterior</button>}{clientId && <button type="button" className="btn-delete-modal" onClick={handleModalDelete}><Trash2 size={18} /> Excluir Cliente</button>}</div>
                            <div className="footer-right">{activeTab !== 'segundo' && <button type="button" className="btn-nav primary" onClick={goToNext}>Próximo <ChevronRight size={18} /></button>}{(activeTab === 'segundo' || clientId) && <button type="submit" className="btn-confirm" disabled={isSaving}>{isSaving ? <><span className="spinner"></span> Salvando...</> : <><FileText size={18} /> {clientId ? 'GRAVAR ALTERAÇÕES' : 'GRAVAR E GERAR PROPOSTA'}</>}</button>}</div>
                        </div>
                    </footer>
                </form>
            </div>
            {showP2Selection && <ClientSelectionModal onSelectClient={handleSelectP2} onNewClient={() => setShowP2Selection(false)} onClose={() => setShowP2Selection(false)} />}
        </div>
    );
};

export default ClientFormModal;
