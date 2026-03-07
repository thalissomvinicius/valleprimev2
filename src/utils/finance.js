/**
 * Financial utilities for Valle Prime V2
 */

export const formatCurrency = (val) => {
    if (!val || !Number.isFinite(val)) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatCurrencyForBackend = (value) => {
    const num = parseFloat(value);
    if (!num || !Number.isFinite(num)) return '0,00';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const getPlanType = (n) => {
    if (n === 1) return 'À Vista';
    if (n <= 36) return 'Parcelas Fixas';
    if (n <= 72) return 'Parcelas Corrigidas';
    return 'Parcelas Reajustáveis';
};

export const calculateDownPayment = (lotValue, downPaymentPercent) => {
    return lotValue * (downPaymentPercent / 100);
};

export const calculateDiscountedSinal = (downPaymentTotal, sinalDiscountEnabled, sinalDiscountValue) => {
    return sinalDiscountEnabled
        ? Math.max(0, downPaymentTotal - (parseFloat(sinalDiscountValue) || 0))
        : downPaymentTotal;
};

export const calculateDiscountedValues = (lotValue, downPaymentTotal, entradaAmount, discountPercent) => {
    const balance = lotValue - downPaymentTotal - entradaAmount;
    const steps = discountPercent / 10;
    let discountedBalance = balance;

    // Applying cascading discount 
    for (let i = 0; i < steps; i++) {
        discountedBalance = discountedBalance * 0.90;
    }

    return {
        openBalance: discountedBalance,
        totalWithDiscount: discountedBalance + downPaymentTotal + entradaAmount
    };
};

export const calculateInstallmentValue = (remainingBalance, installments) => {
    if (!installments || installments <= 0) return 0;
    return remainingBalance / installments;
};

export const getShortObraName = (fullName) => {
    if (!fullName) return 'EMPREENDIMENTO';

    // Remove city suffix (e.g., "- TOMÉ-AÇU")
    let name = fullName.split(' - ')[0].trim().toUpperCase();

    // Remove "RESIDENCIAL" 
    name = name.replace(/^RESIDENCIAL\s+/, '');

    // Apply abbreviations mapped from pattern definitions
    name = name.replace(/^VALLE\s+DO\s+/, 'V. DO ');
    name = name.replace(/^VALLE\s+DOS\s+/, 'V. DOS ');
    name = name.replace(/^VALLE\s+DAS\s+/, 'V. DAS ');
    name = name.replace(/^VALLE\s+/, 'V. ');
    name = name.replace(/^JARDIM\s+DO\s+/, 'J. DO ');
    name = name.replace(/^JARDIM\s+/, 'J. ');
    name = name.replace(/^PARQUE\s+DO\s+/, 'P. DO ');
    name = name.replace(/^SALLES\s+/, 'S. ');

    return name.substring(0, 30).trim();
};

export const getShortClientName = (fullName) => {
    if (!fullName) return 'CLIENTE';

    const parts = fullName.trim().toUpperCase().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 20);

    // First Name + Last Name
    return `${parts[0]} ${parts[parts.length - 1]}`.substring(0, 30);
};
