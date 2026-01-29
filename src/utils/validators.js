// Funções de validação de dados

export const validateCPF = (cpf) => {
    if (!cpf) return false;

    const cleaned = cpf.replace(/\D/g, '');

    if (cleaned.length !== 11) return false;

    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cleaned)) return false;

    // Valida primeiro dígito verificador
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(cleaned.charAt(i)) * (10 - i);
    }
    let remainder = 11 - (sum % 11);
    let digit1 = remainder >= 10 ? 0 : remainder;

    if (digit1 !== parseInt(cleaned.charAt(9))) return false;

    // Valida segundo dígito verificador
    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(cleaned.charAt(i)) * (11 - i);
    }
    remainder = 11 - (sum % 11);
    let digit2 = remainder >= 10 ? 0 : remainder;

    if (digit2 !== parseInt(cleaned.charAt(10))) return false;

    return true;
};

export const validateCNPJ = (cnpj) => {
    if (!cnpj) return false;

    const cleaned = cnpj.replace(/\D/g, '');

    if (cleaned.length !== 14) return false;

    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{13}$/.test(cleaned)) return false;

    // Valida primeiro dígito verificador
    let length = cleaned.length - 2;
    let numbers = cleaned.substring(0, length);
    let digits = cleaned.substring(length);
    let sum = 0;
    let pos = length - 7;

    for (let i = length; i >= 1; i--) {
        sum += parseInt(numbers.charAt(length - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0))) return false;

    // Valida segundo dígito verificador
    length = length + 1;
    numbers = cleaned.substring(0, length);
    sum = 0;
    pos = length - 7;

    for (let i = length; i >= 1; i--) {
        sum += parseInt(numbers.charAt(length - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1))) return false;

    return true;
};

export const validateEmail = (email) => {
    if (!email) return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

export const validatePhone = (ddd, number) => {
    if (!number) return false;

    const cleanedNumber = number.replace(/\D/g, '');

    // Aceita 8 ou 9 dígitos
    if (cleanedNumber.length < 8 || cleanedNumber.length > 9) return false;

    // Se tiver DDD, valida
    if (ddd) {
        const cleanedDDD = ddd.replace(/\D/g, '');
        if (cleanedDDD.length !== 2) return false;
    }

    return true;
};

export const validateCEP = (cep) => {
    if (!cep) return false;

    const cleaned = cep.replace(/\D/g, '');
    return cleaned.length === 8;
};

export const getValidationMessage = (field, value) => {
    switch (field) {
        case 'cpf':
            return validateCPF(value) ? '' : 'CPF inválido';
        case 'cnpj':
            return validateCNPJ(value) ? '' : 'CNPJ inválido';
        case 'email':
            return validateEmail(value) ? '' : 'E-mail inválido';
        case 'cep':
            return validateCEP(value) ? '' : 'CEP deve ter 8 dígitos';
        default:
            return '';
    }
};
