import { SENSITIVE_PATTERNS, checkContext } from './utils/regex-detectors.js';
import { pipeline, env } from './lib/transformers.js';
import { checkKNNThreshold } from './utils/vector-math.js';
import { JAILBREAK_LABELS } from './utils/jailbreak-labels.js';

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
    static models = {
        'token-classification': 'Xenova/distilbert-base-uncased-finetuned-pii',
        'feature-extraction': 'Xenova/all-MiniLM-L6-v2'
    };
    static instances = {};

    static async getInstance(task, progressCallback) {
        if (!this.instances[task]) {
            this.instances[task] = pipeline(task, this.models[task], { 
                progress_callback: progressCallback,
                quantized: true // Enable 8-bit quantized model version
            });
        }
        return this.instances[task];
    }
}

// Jailbreak & Intent Detector
class JailbreakDetector {
    static task = 'zero-shot-classification';
    static model = 'Xenova/distilbert-base-uncased-mnli';
    static instance = null;

    static async getInstance(progressCallback) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, {
                progress_callback: progressCallback,
                quantized: true
            });
        }
        return this.instance;
    }
}

const intentCache = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "STORE_TOKEN") {
        const token = `{{L_VAULT_${Math.random().toString(36).substring(2, 10).toUpperCase()}}}`;
        chrome.storage.session.set({ [token]: request.rawText }).then(() => {
            sendResponse({ token: token });
        });
        return true;
    } else if (request.type === "GET_TOKEN") {
        chrome.storage.session.get(request.token).then((data) => {
            sendResponse({ rawText: data[request.token] });
        });
        return true;
    } else if (request.type === "LOG_LEAK") {
        chrome.storage.local.get(['leaksPrevented', 'leakHistory'], (data) => {
            const prevented = (data.leaksPrevented || 0) + 1;
            const history = data.leakHistory || [];
            history.unshift({ type: request.violationType || "Unknown Leak", timestamp: Date.now() });
            if (history.length > 50) history.pop(); // keep last 50
            chrome.storage.local.set({ leaksPrevented: prevented, leakHistory: history });
        });
        sendResponse({ success: true });
        return false;
    } else if (request.type === "CHECK_PROMPT") {
        // Analytics: increment totalScans
        chrome.storage.local.get(['totalScans'], (data) => {
            const scans = (data.totalScans || 0) + 1;
            chrome.storage.local.set({ totalScans: scans });
        });

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
    } else if (request.type === "MARK_FALSE_POSITIVE") {
        (async () => {
            try {
                const extractor = await AIProtect.getInstance('feature-extraction', () => {});
                const output = await extractor(request.text, { pooling: 'mean', normalize: true });
                const embedding = Array.from(output.data);
                
                chrome.storage.local.get(['safeVectorStore'], (data) => {
                    const store = data.safeVectorStore || [];
                    store.push({ text: request.text, vector: embedding });
                    chrome.storage.local.set({ safeVectorStore: store });
                });
                sendResponse({ success: true });
            } catch (err) {
                console.error("Failed to generate embedding for false positive:", err);
                sendResponse({ success: false, error: err.toString() });
            }
        })();
        return true;
    } else if (request.type === "CHECK_INTENT") {
        (async () => {
            const text = request.text;
            if (intentCache.has(text)) {
                sendResponse(intentCache.get(text));
                return;
            }
            try {
                const classifier = await JailbreakDetector.getInstance(() => {});
                const output = await classifier(text, JAILBREAK_LABELS);
                const highestScore = output.scores[0];
                const highestLabel = output.labels[0];
                
                const isJailbreak = highestLabel !== 'safe' && highestScore > 0.75;
                const result = { isJailbreak, label: highestLabel, score: highestScore };
                
                // Keep cache size reasonable
                if (intentCache.size > 100) {
                    const firstKey = intentCache.keys().next().value;
                    intentCache.delete(firstKey);
                }
                intentCache.set(text, result);
                
                sendResponse(result);
            } catch (err) {
                console.error("Jailbreak scan failed:", err);
                sendResponse({ isJailbreak: false, label: 'error', score: 0 });
            }
        })();
        return true;
    }
});

function mergeTokens(entities) {
    const merged = [];
    for (const entity of entities) {
        if (entity.score < 0.30) continue;

        const baseType = entity.entity.split('-')[1] || entity.entity; // e.g. PER from B-PER

        if (merged.length > 0 && 
            entity.index === merged[merged.length - 1].lastIndex + 1 && 
            baseType === merged[merged.length - 1].rawType) {
            
            // If this token is a continuation (starts with ##), merge it
            const word = entity.word.startsWith('##') ? entity.word.slice(2) : ' ' + entity.word;
            merged[merged.length - 1].word += word;
            merged[merged.length - 1].lastIndex = entity.index;
            merged[merged.length - 1].score = Math.max(merged[merged.length - 1].score, entity.score);
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
        const detector = await AIProtect.getInstance('token-classification', (data) => {
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

    // Check KNN False Positives
    try {
        const extractor = await AIProtect.getInstance('feature-extraction', () => {});
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data);
        const vectorData = await chrome.storage.local.get(['safeVectorStore']);
        
        if (checkKNNThreshold(embedding, vectorData.safeVectorStore, 0.85)) {
            console.log("LeakShield AI: Flagged as Safe (False Positive Match)");
            return { isSafe: true, riskScore: 0, violations: [], aiEntities: [] };
        }
    } catch (e) {
        console.error("LeakShield AI: KNN Vector check failed:", e);
    }

    let nonRiskProb = 1.0;

    const addRegexEntities = (regexSource, label) => {
        const regex = new RegExp(regexSource, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
            violations.push(label);
            aiEntities.push({ type: label, word: match[0], score: 0.99 });
            nonRiskProb *= (1 - 0.99);
        }
    };

    // 1. Run Regex Scans if toggled on
    if (toggles.email) addRegexEntities(SENSITIVE_PATTERNS.EMAIL.source, "Email Address");
    if (toggles.phone) addRegexEntities(SENSITIVE_PATTERNS.PHONE.source, "Phone Number");
    if (toggles.api) addRegexEntities(SENSITIVE_PATTERNS.API_KEY.source, "API Key");
    if (toggles.card) addRegexEntities(SENSITIVE_PATTERNS.CREDIT_CARD.source, "Credit Card");
    if (toggles.ip) addRegexEntities(SENSITIVE_PATTERNS.IPV4.source, "IP Address");

    // 2. Run Secrets Scan if toggled on
    if (toggles.secrets) {
        // Built-in company secrets
        const defaultSecrets = ["Project Titan", "Internal Q4 Revenue", "Confidential Strategy"];
        defaultSecrets.forEach(secret => {
            const regex = new RegExp(secret.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
            let match;
            while ((match = regex.exec(text)) !== null) {
                violations.push(`Company Secret (${secret})`);
                aiEntities.push({ type: "Company Secret", word: match[0], score: 0.99 });
                nonRiskProb *= (1 - 0.99);
            }
        });

        // User's custom keywords (fuzzy match checker)
        customKeywords.forEach(keyword => {
            if (keyword) {
                const regex = new RegExp(keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
                let match;
                while ((match = regex.exec(text)) !== null) {
                    violations.push(`Internal Project: ${keyword}`);
                    aiEntities.push({ type: "Custom Keyword", word: match[0], score: 0.99 });
                    nonRiskProb *= (1 - 0.99);
                }
            }
        });
    }

    // 3. Run Quantized Contextual AI Scan
    const runAIScan = toggles.secrets || toggles.email || toggles.phone;
    if (runAIScan) {
        try {
            const findings = await runContextualCheck(text);
            findings.forEach(entity => {
                // Skip if already caught by regex
                const alreadyFound = aiEntities.some(e => e.word.toLowerCase() === entity.word.toLowerCase());
                if (!alreadyFound) {
                    violations.push(`${entity.type} (${entity.word})`);
                    aiEntities.push({ type: entity.type, word: entity.word, score: entity.score });
                    nonRiskProb *= (1 - entity.score);
                }
            });
        } catch (e) {
            console.error("LeakShield AI: Contextual check failed:", e);
        }
    }

    const riskScore = Math.round((1 - nonRiskProb) * 100);
    const isSafe = riskScore < 75; // Set 75 as the threshold for hard blocking

    // Log average risk score to local storage asynchronously
    chrome.storage.local.get(['totalRiskScore', 'totalScans'], (data) => {
        const totalScore = (data.totalRiskScore || 0) + riskScore;
        const scans = (data.totalScans || 1); // Avoid division by zero
        chrome.storage.local.set({ totalRiskScore: totalScore, averageRiskScore: Math.round(totalScore / scans) });
    });

    return {
        isSafe: isSafe,
        riskScore: riskScore,
        violations: violations,
        aiEntities: aiEntities
    };
}

// "Leaky Site" Scanner (Governance)
const KNOWN_SAFE_AI = ["chatgpt.com", "claude.ai", "gemini.google.com", "perplexity.ai", "poe.com", "meta.ai", "x.com", "github.com", "huggingface.co"];

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