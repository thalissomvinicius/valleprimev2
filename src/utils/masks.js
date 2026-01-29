// Funções de máscara para formatação de inputs

export const maskCPF = (value) => {
    if (!value) return '';
    return value
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
};

export const maskCNPJ = (value) => {
    if (!value) return '';
    return value
        .replace(/\D/g, '')
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
};

export const maskPhone = (value) => {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');

    if (cleaned.length <= 10) {
        // (XX) XXXX-XXXX
        return cleaned
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2')
            .replace(/(-\d{4})\d+?$/, '$1');
    } else {
        // (XX) XXXXX-XXXX
        return cleaned
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .replace(/(-\d{4})\d+?$/, '$1');
    }
};

export const maskCEP = (value) => {
    if (!value) return '';
    return value
        .replace(/\D/g, '')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .replace(/(-\d{3})\d+?$/, '$1');
};

export const maskDDD = (value) => {
    if (!value) return '';
    return value
        .replace(/\D/g, '')
        .replace(/(\d{2})\d+?$/, '$1');
};

export const maskPhoneNumber = (value) => {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');

    if (cleaned.length <= 8) {
        // XXXX-XXXX
        return cleaned
            .replace(/(\d{4})(\d)/, '$1-$2')
            .replace(/(-\d{4})\d+?$/, '$1');
    } else {
        // XXXXX-XXXX
        return cleaned
            .replace(/(\d{5})(\d)/, '$1-$2')
            .replace(/(-\d{4})\d+?$/, '$1');
    }
};

// Remove all non-digit characters
export const unmask = (value) => {
    if (!value) return '';
    return value.replace(/\D/g, '');
};
