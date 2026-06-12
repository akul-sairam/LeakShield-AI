export const SENSITIVE_PATTERNS = {
    EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    PHONE: /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
    API_KEY: /(?:sk-|key-|auth-)[a-zA-Z0-9]{24,}/i,
    CREDIT_CARD: /\b(?:\d[ -]*?){13,16}\b/,
    IPV4: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/
};

export function fastScan(text) {
    const findings = [];
    for (const [key, pattern] of Object.entries(SENSITIVE_PATTERNS)) {
        if (pattern.test(text)) {
            findings.push(key.replace('_', ' '));
        }
    }
    return findings;
}

export function checkContext(text, customKeywords) {
    const findings = [];
    
    customKeywords.forEach(keyword => {
        if (keyword && text.toLowerCase().includes(keyword.toLowerCase())) {
            findings.push(`Internal Project: ${keyword}`);
        }
    });
    
    return findings;
}