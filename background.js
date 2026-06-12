import { SENSITIVE_PATTERNS, checkContext } from './utils/regex-detectors.js';
import { pipeline, env } from './lib/transformers.js';

// Configure environment for browser extension environments
env.allowRemoteModels = true; 
env.allowLocalModels = false;
if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
    env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('lib/');
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
}

// AI Protection Model Controller (Singleton Pattern)
class AIProtect {
    static task = 'token-classification'; 
    static model = 'Xenova/distilbert-base-uncased-finetuned-pii'; 
    static instance = null;

    static async getInstance(progressCallback) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, { 
                progress_callback: progressCallback,
                quantized: true // Enable 8-bit quantized model version (~25MB)
            });
        }
        return this.instance;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CHECK_PROMPT") {
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                console.warn("Background scan timed out, failing open.");
                resolve({ isSafe: true, violations: [], aiEntities: [] });
            }, 2000);
        });

        Promise.race([analyzeText(request.text), timeoutPromise])
            .then(sendResponse)
            .catch(err => {
                console.error("Background scanning failed, failing open:", err);
                sendResponse({ isSafe: true, violations: [], aiEntities: [] });
            });
        return true; // Keeps the message channel open for async response
    }
});

function mergeTokens(entities) {
    const merged = [];
    for (const entity of entities) {
        if (entity.score < 0.85) continue;

        const baseType = entity.entity.split('-')[1] || entity.entity; // e.g. PER from B-PER

        if (merged.length > 0 && 
            entity.index === merged[merged.length - 1].lastIndex + 1 && 
            baseType === merged[merged.length - 1].rawType) {
            
            // If this token is a continuation (starts with ##), merge it
            const word = entity.word.startsWith('##') ? entity.word.slice(2) : ' ' + entity.word;
            merged[merged.length - 1].word += word;
            merged[merged.length - 1].lastIndex = entity.index;
        } else {
            merged.push({
                type: mapEntityLabel(baseType),
                rawType: baseType,
                word: entity.word.replace('##', ''),
                lastIndex: entity.index,
                score: entity.score
            });
        }
    }
    return merged;
}

async function runContextualCheck(text) {
    try {
        const detector = await AIProtect.getInstance((data) => {
            if (data.status === 'progress') {
                console.log(`Loading LeakShield AI Model: ${data.progress.toFixed(2)}%`);
            }
        });

        const output = await detector(text);
        return mergeTokens(output);
    } catch (e) {
        console.error("AI Analysis Failed:", e);
        return [];
    }
}

function mapEntityLabel(label) {
    switch (label.toUpperCase()) {
        case 'PER': return 'Person';
        case 'ORG': return 'Organization';
        case 'LOC': return 'Location';
        case 'MISC': return 'Miscellaneous';
        default: return label;
    }
}

async function analyzeText(text) {
    const data = await chrome.storage.local.get(['toggles', 'customKeywords']);
    
    // Default all toggles to true if not set
    const toggles = data.toggles || {
        email: true,
        phone: true,
        api: true,
        card: true,
        ip: true,
        secrets: true
    };
    
    const customKeywords = data.customKeywords || [];
    const violations = [];
    const aiEntities = [];

    // 1. Run Regex Scans if toggled on
    if (toggles.email && SENSITIVE_PATTERNS.EMAIL.test(text)) {
        violations.push("Email Address");
    }
    if (toggles.phone && SENSITIVE_PATTERNS.PHONE.test(text)) {
        violations.push("Phone Number");
    }
    if (toggles.api && SENSITIVE_PATTERNS.API_KEY.test(text)) {
        violations.push("API Key");
    }
    if (toggles.card && SENSITIVE_PATTERNS.CREDIT_CARD.test(text)) {
        violations.push("Credit Card");
    }
    if (toggles.ip && SENSITIVE_PATTERNS.IPV4.test(text)) {
        violations.push("IP Address");
    }

    // 2. Run Secrets Scan if toggled on
    if (toggles.secrets) {
        // Built-in company secrets
        const defaultSecrets = ["Project Titan", "Internal Q4 Revenue", "Confidential Strategy"];
        defaultSecrets.forEach(secret => {
            if (text.toLowerCase().includes(secret.toLowerCase())) {
                violations.push(`Company Secret (${secret})`);
            }
        });

        // User's custom keywords (fuzzy match checker)
        const customViolations = checkContext(text, customKeywords);
        customViolations.forEach(finding => {
            violations.push(finding);
        });
    }

    // If regex or secrets check already found a violation, return immediately to bypass the slow AI loading.
    if (violations.length > 0) {
        return {
            isSafe: false,
            violations: violations,
            aiEntities: aiEntities
        };
    }

    // 3. Run Quantized Contextual AI Scan
    const runAIScan = toggles.secrets || toggles.email || toggles.phone;
    if (runAIScan) {
        try {
            const findings = await runContextualCheck(text);
            findings.forEach(entity => {
                violations.push(`${entity.type} (${entity.word})`);
                aiEntities.push({ type: entity.type, word: entity.word });
            });
        } catch (e) {
            console.error("LeakShield AI: Contextual check failed:", e);
        }
    }

    return {
        isSafe: violations.length === 0,
        violations: violations,
        aiEntities: aiEntities
    };
}

// "Leaky Site" Scanner (Governance)
const KNOWN_SAFE_AI = ["chatgpt.com", "claude.ai", "gemini.google.com"];

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        try {
            const url = new URL(tab.url);
            // Check if it's a non-whitelisted site that appears to offer AI services
            if (!KNOWN_SAFE_AI.includes(url.hostname) && (url.hostname.includes("ai") || url.href.includes("ai"))) {
                chrome.action.setBadgeText({text: "!", tabId: tabId});
                chrome.action.setBadgeBackgroundColor({color: "#FF0000", tabId: tabId});
            } else {
                chrome.action.setBadgeText({text: "", tabId: tabId});
            }
        } catch (e) {
            // Ignore invalid URLs
        }
    }
});