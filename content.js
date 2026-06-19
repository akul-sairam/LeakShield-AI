console.log("LeakShield AI: Active and Monitoring...");

let isBypassing = false;

// Helper to find the send/submit button on any AI site (ChatGPT, Claude, Gemini, etc.)
function findSendButton() {
    // 1. Look for buttons first with send/submit attributes
    let button = document.querySelector('button[data-testid*="send" i], button[aria-label*="send" i], button[aria-label*="submit" i], button[class*="send" i]');
    if (button) return button;

    // 2. Look for role="button" elements
    button = document.querySelector('[role="button"][data-testid*="send" i], [role="button"][aria-label*="send" i], [role="button"][class*="send" i]');
    if (button) return button;

    // 3. Fallback: look for any element containing "send" testid or label near the prompt textarea
    const promptArea = document.getElementById('prompt-textarea') || document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
    if (promptArea) {
        const parentContainer = promptArea.closest('form') || promptArea.parentElement?.parentElement;
        if (parentContainer) {
            const sendEl = parentContainer.querySelector('[data-testid*="send" i], [aria-label*="send" i], [class*="send" i]');
            if (sendEl) return sendEl;
        }
    }

    // 4. Ultimate fallback
    return document.querySelector('[data-testid*="send" i], [aria-label*="send" i]');
}

// Helper to find the active or associated input element (textarea or contenteditable)
function findInputElement(sendButton = null) {
    if (sendButton) {
        const container = sendButton.closest('form') || sendButton.parentElement?.parentElement;
        if (container) {
            const input = container.querySelector('[contenteditable="true"]') || container.querySelector('textarea') || container.querySelector('input[type="text"]');
            if (input) return input;
        }
    }

    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true' || active.closest('[contenteditable="true"]'))) {
        return active.closest('[contenteditable="true"]') || active;
    }

    const chatGPTInput = document.getElementById('prompt-textarea');
    if (chatGPTInput) return chatGPTInput;

    const contentEditable = document.querySelector('div[contenteditable="true"]');
    if (contentEditable) return contentEditable;

    const textarea = document.querySelector('textarea');
    if (textarea) return textarea;

    return null;
}

// Helper to set input text and trigger React/Lexical/Slate editor state sync
function setElementText(element, text) {
    if (!element) return;
    element.focus();

    let success = false;
    try {
        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            element.select();
        } else {
            // For contenteditable, use selectAll to select all text inside the focused editor
            document.execCommand('selectAll', false, null);
        }
        success = document.execCommand('insertText', false, text);
    } catch (e) {
        console.error("LeakShield AI: execCommand failed:", e);
    }

    if (!success) {
        console.warn("LeakShield AI: execCommand failed, falling back to manual DOM updates.");
        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
            if (descriptor && descriptor.set) {
                descriptor.set.call(element, text);
            } else {
                element.value = text;
            }
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // Fallback for contenteditable
            element.textContent = text;
            const events = ['input', 'change', 'blur'];
            events.forEach(type => {
                element.dispatchEvent(new Event(type, { bubbles: true }));
            });
        }
    }
}

function getActiveText(element = null) {
    const inputEl = element || findInputElement();
    if (!inputEl) return "";
    let val = "";
    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        val = inputEl.value || "";
    } else {
        val = inputEl.innerText || "";
    }
    return val.trim();
}

function getActiveInputElement(eventTarget = null) {
    return findInputElement(eventTarget);
}

// Intercept clicks and keyboard events
document.addEventListener('keydown', (event) => {
    if (isBypassing) return;

    const target = event.target;
    const inputEl = target.closest('[contenteditable="true"]') || target.closest('textarea') || (target.tagName === 'TEXTAREA' ? target : null);
    if (!inputEl) return;

    const isEnter = event.key === 'Enter' && !event.shiftKey;
    if (isEnter) {
        const text = getActiveText(inputEl);
        console.log("LeakShield AI: Keydown Enter detected! inputEl:", inputEl, "text length:", text.length, "text:", text);
        if (text.length > 5) {
            console.log("LeakShield AI: Blocking Enter submission to perform scan...");
            // Block synchronously to prevent the prompt from sending before the async scan completes
            event.preventDefault();
            event.stopImmediatePropagation();

            // Perform scan asynchronously
            performScanAndHandle(text, event, inputEl);
        } else {
            console.log("LeakShield AI: Prompt text too short (< 6 characters), skipping scan.");
        }
    }
}, true); // Capture phase is key

document.addEventListener('click', (event) => {
    if (isBypassing) return;

    // Look for common AI send button patterns (case-insensitive)
    const sendButton = event.target.closest('button[data-testid*="send" i], button[aria-label*="send" i], button[aria-label*="submit" i], button[class*="send" i], [role="button"][data-testid*="send" i], [role="button"][aria-label*="send" i]');
    if (sendButton) {
        const inputEl = findInputElement(sendButton);
        const text = getActiveText(inputEl);
        console.log("LeakShield AI: Send button click detected! button:", sendButton, "inputEl:", inputEl, "text length:", text.length, "text:", text);
        if (text.length > 0) {
            console.log("LeakShield AI: Blocking button click submission to perform scan...");
            // Block synchronously to prevent the prompt from sending before the async scan completes
            event.preventDefault();
            event.stopImmediatePropagation();

            // Perform scan asynchronously
            performScanAndHandle(text, event, sendButton);
        }
    }
}, true);

async function performScanAndHandle(text, originalEvent, eventTarget) {
    console.log("LeakShield AI: Starting background scan for prompt:", text);

    let isIntentSafe = true;
    let intentResponse = null;

    try {
        updateRealtimeBadge('intent-scanning');
        intentResponse = await chrome.runtime.sendMessage({ type: "CHECK_INTENT", text: text });
        if (intentResponse && intentResponse.isJailbreak) {
            isIntentSafe = false;
        }
    } catch (err) {
        console.error("LeakShield AI: Intent scan failed:", err);
    }

    if (!isIntentSafe) {
        console.log("LeakShield AI: Jailbreak/Malicious Intent detected!", intentResponse);
        showSafetyWarningModal(intentResponse.label, intentResponse.score, originalEvent, eventTarget);
        return;
    }

    let response;
    try {
        updateRealtimeBadge('scanning');
        // Race background script scan with a 2.5-second client-side timeout in case service worker is unresponsive
        response = await Promise.race([
            chrome.runtime.sendMessage({ type: "CHECK_PROMPT", text: text }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for background response")), 2500))
        ]);
        console.log("LeakShield AI: Received scan response:", response);
    } catch (err) {
        console.error("LeakShield AI: Scan failed or timed out, failing open to prevent freezing ChatGPT:", err);
        response = { isSafe: true, violations: [], aiEntities: [] };
    }

    if (response.isSafe) {
        console.log("LeakShield AI: Prompt is safe. Dispatching bypass submission.");
        // Trigger bypass and re-dispatch/click
        try {
            isBypassing = true;
            if (originalEvent.type === 'click') {
                eventTarget.click();
            } else if (originalEvent.type === 'keydown') {
                const sendButton = findSendButton();
                if (sendButton) {
                    console.log("LeakShield AI: Re-submitting via send button click.");
                    sendButton.click();
                } else {
                    const form = eventTarget.closest('form');
                    if (form) {
                        console.log("LeakShield AI: Re-submitting via parent form submit.");
                        form.requestSubmit();
                    } else {
                        console.log("LeakShield AI: Re-submitting via synthetic Enter keydown.");
                        const bypassEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        eventTarget.dispatchEvent(bypassEvent);
                    }
                }
            }
        } catch (e) {
            console.error("LeakShield AI: Error during bypass dispatch:", e);
        } finally {
            isBypassing = false;
        }
    } else {
        console.log("LeakShield AI: Prompt is unsafe! Violations:", response.violations, "Showing warning modal.");
        showWarningModal(response.violations, response.aiEntities || [], originalEvent, eventTarget);
    }
}

function showSafetyWarningModal(label, score, originalEvent, eventTarget) {
    const existingContainer = document.getElementById('leakshield-container');
    if (existingContainer) {
        if (typeof existingContainer.cleanup === 'function') existingContainer.cleanup();
        existingContainer.remove();
    }

    const container = document.createElement('div');
    container.id = "leakshield-container";
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2147483647';

    const shadow = container.attachShadow({ mode: 'closed' });

    const modal = document.createElement('div');
    modal.innerHTML = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
            #leakshield-warning {
                position: fixed;
                z-index: 2147483647;
                width: 360px;
                background: linear-gradient(135deg, rgba(30, 0, 0, 0.95) 0%, rgba(15, 0, 0, 0.98) 100%);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(239, 68, 68, 0.8);
                border-radius: 16px;
                padding: 20px;
                box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.8), 0 0 25px rgba(239, 68, 68, 0.4);
                font-family: 'Outfit', sans-serif;
                color: #f8fafc;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
                pointer-events: auto;
            }
            .ls-title {
                font-size: 16px;
                font-weight: 700;
                margin: 0 0 10px 0;
                color: #ef4444;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .ls-text {
                font-size: 13.5px;
                line-height: 1.5;
                color: #cbd5e1;
                margin: 0 0 16px 0;
            }
            .ls-text strong { color: #fca5a5; font-weight: 600; }
            .ls-actions { display: flex; flex-direction: column; gap: 8px; }
            .ls-actions button {
                padding: 10px 16px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 13.5px;
                cursor: pointer;
                border: none;
            }
            #ls-cancel { background: linear-gradient(90deg, #ef4444 0%, #b91c1c 100%); color: #ffffff; }
            #ls-proceed { background: transparent; color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2); }
        </style>
        <div id="leakshield-warning">
            <h2 class="ls-title">🛡️ Safety Warning: Malicious Intent</h2>
            <p class="ls-text">We detected a potential <strong>${label}</strong> attack (Confidence: ${Math.round(score * 100)}%).</p>
            <div class="ls-actions">
                <button id="ls-cancel">Stop & Edit</button>
                <button id="ls-proceed">Send anyway</button>
            </div>
        </div>
    `;
    shadow.appendChild(modal);
    document.body.appendChild(container);

    const warningBox = shadow.querySelector('#leakshield-warning');
    const boxWidth = 360;
    const boxHeight = 220;
    warningBox.style.left = `${(window.innerWidth - boxWidth) / 2}px`;
    warningBox.style.top = `${(window.innerHeight - boxHeight) / 2}px`;

    shadow.querySelector('#ls-cancel').onclick = () => container.remove();
    shadow.querySelector('#ls-proceed').onclick = () => {
        container.remove();
        isBypassing = true;
        try {
            if (originalEvent.type === 'click') eventTarget.click();
            else if (originalEvent.type === 'keydown') {
                const sendBtn = findSendButton();
                if (sendBtn) sendBtn.click();
                else eventTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            }
        } finally { isBypassing = false; }
    };
}

function showWarningModal(violations, aiEntities, originalEvent, eventTarget) {
    // Remove existing container if any
    const existingContainer = document.getElementById('leakshield-container');
    if (existingContainer) {
        if (typeof existingContainer.cleanup === 'function') {
            existingContainer.cleanup();
        }
        existingContainer.remove();
    }

    const container = document.createElement('div');
    container.id = "leakshield-container";
    // Fullscreen transparent container with pointer-events: none to let clicks pass through
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2147483647';
    container.style.visibility = 'hidden';

    // Attach Shadow DOM for encapsulation
    const shadow = container.attachShadow({ mode: 'closed' });

    const modal = document.createElement('div');
    modal.innerHTML = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

            #leakshield-warning {
                position: fixed;
                z-index: 2147483647;
                width: 360px;
                background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(239, 68, 68, 0.35);
                border-radius: 16px;
                padding: 20px;
                box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 25px rgba(239, 68, 68, 0.15);
                font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: #f8fafc;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
                pointer-events: auto;
                opacity: 0;
            }

            .ls-title {
                font-size: 16px;
                font-weight: 700;
                margin: 0 0 10px 0;
                background: linear-gradient(90deg, #ef4444 0%, #f97316 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .ls-text {
                font-size: 13.5px;
                line-height: 1.5;
                color: #cbd5e1;
                margin: 0 0 16px 0;
            }

            .ls-text strong {
                color: #fca5a5;
                background: rgba(239, 68, 68, 0.1);
                padding: 1px 5px;
                border-radius: 4px;
                border: 1px solid rgba(239, 68, 68, 0.25);
                font-weight: 600;
                word-break: break-all;
            }

            .ls-actions {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .ls-actions button {
                padding: 10px 16px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 13.5px;
                font-family: inherit;
                cursor: pointer;
                border: none;
                transition: all 0.2s;
                display: block;
                width: 100%;
                box-sizing: border-box;
            }

            #ls-redact {
                background: linear-gradient(90deg, #10b981 0%, #059669 100%);
                color: #ffffff;
                box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
            }

            #ls-redact:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 15px rgba(16, 185, 129, 0.35);
            }

            #ls-cancel {
                background: linear-gradient(90deg, #3b82f6 0%, #6366f1 100%);
                color: #ffffff;
                box-shadow: 0 4px 10px rgba(59, 130, 246, 0.2);
            }

            #ls-cancel:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 15px rgba(59, 130, 246, 0.35);
            }

            #ls-proceed {
                background: transparent;
                color: #94a3b8;
                border: 1px solid rgba(148, 163, 184, 0.2);
                font-weight: 500;
            }

            #ls-proceed:hover {
                color: #ef4444;
                background: rgba(239, 68, 68, 0.05);
                border-color: rgba(239, 68, 68, 0.3);
            }

            #ls-mark-safe {
                background: transparent;
                color: #fbbf24;
                border: 1px solid rgba(251, 191, 36, 0.2);
                font-weight: 500;
            }

            #ls-mark-safe:hover {
                color: #f59e0b;
                background: rgba(251, 191, 36, 0.05);
                border-color: rgba(251, 191, 36, 0.3);
            }

            #leakshield-warning::after {
                content: "";
                position: absolute;
                bottom: -8px;
                left: var(--ls-arrow-left, 50%);
                transform: translateX(-50%);
                border-width: 8px 8px 0;
                border-style: solid;
                border-color: rgba(15, 23, 42, 0.98) transparent;
                display: block;
                width: 0;
            }

            #leakshield-warning::before {
                content: "";
                position: absolute;
                bottom: -9px;
                left: var(--ls-arrow-left, 50%);
                transform: translateX(-50%);
                border-width: 9px 9px 0;
                border-style: solid;
                border-color: rgba(239, 68, 68, 0.35) transparent;
                display: block;
                width: 0;
                z-index: -1;
            }

            #leakshield-warning.ls-flipped::after {
                bottom: auto;
                top: -8px;
                border-width: 0 8px 8px;
                border-color: rgba(30, 41, 59, 0.95) transparent;
            }

            #leakshield-warning.ls-flipped::before {
                bottom: auto;
                top: -9px;
                border-width: 0 9px 9px;
                border-color: rgba(239, 68, 68, 0.35) transparent;
            }

            #leakshield-warning.ls-no-arrow::after,
            #leakshield-warning.ls-no-arrow::before {
                display: none !important;
            }

            @keyframes ls-shake-in {
                0% {
                    opacity: 0;
                    transform: translateY(10px) scale(0.95);
                }
                15% {
                    opacity: 1;
                    transform: translateY(0) scale(1) translateX(-8px);
                }
                30% {
                    transform: translateX(8px);
                }
                45% {
                    transform: translateX(-6px);
                }
                60% {
                    transform: translateX(6px);
                }
                75% {
                    transform: translateX(-3px);
                }
                90% {
                    transform: translateX(3px);
                }
                100% {
                    opacity: 1;
                    transform: translateY(0) scale(1) translateX(0);
                }
            }

            .ls-animate {
                animation: ls-shake-in 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            }
        </style>
        <div id="leakshield-warning" class="ls-animate">
            <h2 class="ls-title">⚠️ Privacy Risk Detected</h2>
            <p class="ls-text">You are about to share: <strong>${violations.join(', ')}</strong></p>
            <div class="ls-actions">
                <button id="ls-redact">Auto-Redact & Send</button>
                <button id="ls-cancel">Stop & Edit</button>
                <button id="ls-mark-safe">Mark as Safe (False Positive)</button>
                <button id="ls-proceed">Send anyway</button>
            </div>
        </div>
    `;
    shadow.appendChild(modal);
    document.body.appendChild(container);

    const warningBox = shadow.querySelector('#leakshield-warning');
    const inputArea = getActiveInputElement(eventTarget);
    const rect = inputArea ? inputArea.getBoundingClientRect() : null;
    const hasValidRect = rect && rect.width > 0 && rect.height > 0;

    // Make container visible so we can query its child's layout dimensions correctly
    container.style.visibility = 'visible';

    const minArrowOffset = 20;

    const reposition = () => {
        if (!hasValidRect || !inputArea) return;
        const currentRect = inputArea.getBoundingClientRect();
        if (currentRect.width === 0 || currentRect.height === 0) {
            removeContainer();
            return;
        }

        // Read warning box dimensions dynamically
        const currentBoxRect = warningBox.getBoundingClientRect();
        const boxWidth = currentBoxRect.width || 360;
        const boxHeight = currentBoxRect.height || 220;

        let left = currentRect.left + (currentRect.width - boxWidth) / 2;
        let top = currentRect.top - boxHeight - 12;
        let isFlipped = false;

        if (top < 10) {
            top = currentRect.bottom + 12;
            isFlipped = true;
        }

        if (left < 10) {
            left = 10;
        } else if (left + boxWidth > window.innerWidth - 10) {
            left = window.innerWidth - boxWidth - 10;
        }

        warningBox.style.left = `${left}px`;
        warningBox.style.top = `${top}px`;

        if (isFlipped) {
            warningBox.classList.add('ls-flipped');
            warningBox.classList.remove('ls-no-arrow');
        } else {
            warningBox.classList.remove('ls-flipped');
            warningBox.classList.remove('ls-no-arrow');
        }

        const currentInputCenter = currentRect.left + currentRect.width / 2;
        const currentArrowOffset = currentInputCenter - left;
        const currentClampedOffset = Math.max(minArrowOffset, Math.min(boxWidth - 20, currentArrowOffset));
        warningBox.style.setProperty('--ls-arrow-left', `${currentClampedOffset}px`);
    };

    const cleanup = () => {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition);
    };

    const removeContainer = () => {
        cleanup();
        container.remove();
    };

    // Attach cleanup function to container
    container.cleanup = cleanup;

    // Perform initial positioning
    if (hasValidRect) {
        reposition();
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, { passive: true });
    } else {
        // Fallback: center in viewport
        const currentBoxRect = warningBox.getBoundingClientRect();
        const boxWidth = currentBoxRect.width || 360;
        const boxHeight = currentBoxRect.height || 220;
        const fallbackLeft = (window.innerWidth - boxWidth) / 2;
        const fallbackTop = (window.innerHeight - boxHeight) / 2;
        warningBox.style.left = `${fallbackLeft}px`;
        warningBox.style.top = `${fallbackTop}px`;
        warningBox.classList.add('ls-no-arrow');
    }

    shadow.querySelector('#ls-cancel').onclick = () => removeContainer();

    shadow.querySelector('#ls-mark-safe').onclick = () => {
        const inputArea = getActiveInputElement(eventTarget);
        if (inputArea) {
            const text = getActiveText(inputArea);
            chrome.runtime.sendMessage({ type: "MARK_FALSE_POSITIVE", text: text });
        }
        removeContainer();
    };

    shadow.querySelector('#ls-proceed').onclick = () => {
        removeContainer();

        // Trigger bypass and re-dispatch
        try {
            isBypassing = true;
            if (originalEvent.type === 'click') {
                eventTarget.click();
            } else if (originalEvent.type === 'keydown') {
                const sendButton = findSendButton();
                if (sendButton) {
                    sendButton.click();
                } else {
                    const form = eventTarget.closest('form');
                    if (form) {
                        form.requestSubmit();
                    } else {
                        const bypassEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        eventTarget.dispatchEvent(bypassEvent);
                    }
                }
            }
        } catch (e) {
            console.error("LeakShield AI: Error during bypass dispatch:", e);
        } finally {
            isBypassing = false;
        }
    };

    shadow.querySelector('#ls-redact').onclick = async () => {
        const finalInput = getActiveInputElement(eventTarget);
        if (!finalInput) {
            removeContainer();
            return;
        }

        const originalText = getActiveText(finalInput);
        let newText = originalText;

        const replaceWithToken = async (match) => {
            try {
                const response = await chrome.runtime.sendMessage({ type: "STORE_TOKEN", rawText: match });
                chrome.runtime.sendMessage({ type: "LOG_LEAK", violationType: "Auto-Redacted Data" });
                return response.token;
            } catch (e) {
                console.error("Token generation failed", e);
                return "[REDACTED]";
            }
        };

        const asyncReplace = async (str, regex) => {
            const promises = [];
            str.replace(regex, (match) => {
                promises.push(replaceWithToken(match));
                return match;
            });
            if (promises.length === 0) return str;
            const replacements = await Promise.all(promises);
            return str.replace(regex, () => replacements.shift());
        };

        // Redact standard categories
        newText = await asyncReplace(newText, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        newText = await asyncReplace(newText, /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g);
        newText = await asyncReplace(newText, /(?:sk-|key-|auth-)[a-zA-Z0-9]{24,}/gi);
        newText = await asyncReplace(newText, /\b(?:\d[ -]*?){13,16}\b/g);
        newText = await asyncReplace(newText, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g);

        // Redact custom keywords/secrets parsed from violations
        for (const v of violations) {
            const secretMatch = v.match(/Company Secret \(([^)]+)\)/) || v.match(/Internal Project: (.*)/);
            if (secretMatch) {
                const secretVal = secretMatch[1];
                const escaped = secretVal.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                newText = await asyncReplace(newText, new RegExp(escaped, 'gi'));
            }
        }

        // Redact AI-detected entity words
        for (const entity of aiEntities) {
            if (entity.word) {
                const escaped = entity.word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                newText = await asyncReplace(newText, new RegExp(escaped, 'gi'));
            }
        }

        // Remove the modal container first so focus can return to the main window cleanly
        removeContainer();

        // Inject cleaned text using document.execCommand to sync with React/Lexical editor state
        setElementText(finalInput, newText);

        // Trigger send button automatically with isBypassing = true after a short delay to let React/Lexical sync state
        setTimeout(() => {
            try {
                isBypassing = true;
                const sendButton = findSendButton();
                if (sendButton) {
                    sendButton.click();
                } else {
                    const form = finalInput.closest('form');
                    if (form) {
                        form.requestSubmit();
                    } else {
                        const bypassEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        finalInput.dispatchEvent(bypassEvent);
                    }
                }
            } catch (e) {
                console.error("LeakShield AI: Error during redacted submit:", e);
            } finally {
                isBypassing = false;
            }
        }, 100);
    };
}

// ==========================================
// REAL-TIME SCANNING, BADGE & HEATMAP (XAI)
// ==========================================
let debounceTimer;
let realtimeBadge = null;
let heatmapOverlay = null;

function updateRealtimeBadge(status, score = null) {
    if (!realtimeBadge) {
        realtimeBadge = document.createElement('div');
        realtimeBadge.id = 'ls-realtime-badge';
        realtimeBadge.style.position = 'absolute';
        realtimeBadge.style.zIndex = '9999';
        realtimeBadge.style.height = '20px';
        realtimeBadge.style.minWidth = '20px';
        realtimeBadge.style.borderRadius = '10px';
        realtimeBadge.style.transition = 'all 0.3s';
        realtimeBadge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
        realtimeBadge.style.display = 'flex';
        realtimeBadge.style.alignItems = 'center';
        realtimeBadge.style.justifyContent = 'center';
        realtimeBadge.style.color = '#fff';
        realtimeBadge.style.fontSize = '11px';
        realtimeBadge.style.fontWeight = 'bold';
        realtimeBadge.style.fontFamily = 'sans-serif';
        realtimeBadge.style.padding = '0 6px';
        realtimeBadge.style.boxSizing = 'border-box';
        document.body.appendChild(realtimeBadge);
    }

    const input = findInputElement();
    if (input) {
        const rect = input.getBoundingClientRect();
        realtimeBadge.style.top = `${rect.top + window.scrollY + 10}px`;
        realtimeBadge.style.left = `${rect.right + window.scrollX - 55}px`;
        realtimeBadge.style.display = 'flex';
    }

    if (status === 'intent-scanning') {
        realtimeBadge.style.backgroundColor = '#8b5cf6'; // Purple
        realtimeBadge.textContent = '🛡️';
    } else if (status === 'scanning') {
        realtimeBadge.style.backgroundColor = '#fbbf24'; // Yellow
        realtimeBadge.textContent = '...';
    } else {
        realtimeBadge.textContent = score !== null ? `${score}%` : '0%';
        if (score >= 75) {
            realtimeBadge.style.backgroundColor = '#ef4444'; // Red
            realtimeBadge.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.6)';
        } else if (score >= 30) {
            realtimeBadge.style.backgroundColor = '#fbbf24'; // Yellow
            realtimeBadge.style.boxShadow = '0 0 12px rgba(251, 191, 36, 0.6)';
        } else {
            realtimeBadge.style.backgroundColor = '#10b981'; // Green
            realtimeBadge.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.4)';
        }
    }
}

function renderHeatmap(inputEl, aiEntities) {
    if (!aiEntities || aiEntities.length === 0) {
        if (heatmapOverlay) heatmapOverlay.style.display = 'none';
        return;
    }

    if (!heatmapOverlay) {
        heatmapOverlay = document.createElement('div');
        heatmapOverlay.id = 'ls-heatmap-overlay';
        heatmapOverlay.style.position = 'absolute';
        heatmapOverlay.style.pointerEvents = 'none';
        heatmapOverlay.style.zIndex = '9998';
        heatmapOverlay.style.overflow = 'hidden';
        document.body.appendChild(heatmapOverlay);
    }

    heatmapOverlay.style.display = 'block';

    // Sync geometry
    const rect = inputEl.getBoundingClientRect();
    const style = window.getComputedStyle(inputEl);

    heatmapOverlay.style.top = `${rect.top + window.scrollY}px`;
    heatmapOverlay.style.left = `${rect.left + window.scrollX}px`;
    heatmapOverlay.style.width = `${rect.width}px`;
    heatmapOverlay.style.height = `${rect.height}px`;

    // Fallback/Typography syncing
    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        heatmapOverlay.style.padding = style.padding;
        heatmapOverlay.style.border = style.border;
        heatmapOverlay.style.fontFamily = style.fontFamily;
        heatmapOverlay.style.fontSize = style.fontSize;
        heatmapOverlay.style.fontWeight = style.fontWeight;
        heatmapOverlay.style.lineHeight = style.lineHeight;
        heatmapOverlay.style.letterSpacing = style.letterSpacing;
        heatmapOverlay.style.whiteSpace = 'pre-wrap';
        heatmapOverlay.style.wordWrap = 'break-word';
        heatmapOverlay.style.color = 'transparent';
        heatmapOverlay.style.backgroundColor = 'transparent';

        let text = inputEl.value;
        aiEntities.forEach(entity => {
            if (!entity.word) return;
            const escaped = entity.word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`(${escaped})`, 'gi');
            const alpha = Math.max(0.15, entity.score);
            text = text.replace(regex, `<mark style="background-color: transparent; color: transparent; background-image: linear-gradient(to right, rgba(239, 68, 68, ${alpha}) 50%, transparent 50%); background-position: bottom; background-size: 4px 2px; background-repeat: repeat-x;">$1</mark>`);
        });
        heatmapOverlay.innerHTML = text;
    } else {
        // For contenteditable, deep clone to preserve exact structure (like paragraphs in Lexical)
        const clone = inputEl.cloneNode(true);
        clone.style.position = 'static';
        clone.style.margin = '0';
        clone.style.backgroundColor = 'transparent';
        clone.style.color = 'transparent';
        clone.style.overflow = 'visible';

        const allNodes = clone.querySelectorAll('*');
        allNodes.forEach(n => {
            if (n.style) {
                n.style.color = 'transparent';
                n.style.backgroundColor = 'transparent';
                n.style.borderColor = 'transparent';
            }
        });

        const wrapTextNodes = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                let text = node.nodeValue;
                let hasMatch = false;

                aiEntities.forEach(entity => {
                    if (!entity.word) return;
                    const escaped = entity.word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(`(${escaped})`, 'gi');
                    if (regex.test(text)) {
                        hasMatch = true;
                        const alpha = Math.max(0.15, entity.score);
                        text = text.replace(regex, `%%MARK_START_${alpha}%%$1%%MARK_END%%`);
                    }
                });

                if (hasMatch) {
                    const span = document.createElement('span');
                    span.innerHTML = text
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        .replace(/%%MARK_START_([0-9.]+)%%/g, '<mark style="background-color: transparent; color: transparent; background-image: linear-gradient(to right, rgba(239, 68, 68, $1) 50%, transparent 50%); background-position: bottom; background-size: 4px 2px; background-repeat: repeat-x;">')
                        .replace(/%%MARK_END%%/g, '</mark>');
                    node.replaceWith(span);
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                Array.from(node.childNodes).forEach(wrapTextNodes);
            }
        };

        Array.from(clone.childNodes).forEach(wrapTextNodes);

        heatmapOverlay.innerHTML = '';
        heatmapOverlay.appendChild(clone);
    }

    heatmapOverlay.scrollTop = inputEl.scrollTop;
    heatmapOverlay.scrollLeft = inputEl.scrollLeft;
}

document.addEventListener('input', (event) => {
    if (isBypassing) return;
    const target = event.target;
    const inputEl = target.closest('[contenteditable="true"]') || target.closest('textarea') || (target.tagName === 'TEXTAREA' ? target : null);
    if (!inputEl) return;

    clearTimeout(debounceTimer);
    updateRealtimeBadge('intent-scanning');

    debounceTimer = setTimeout(async () => {
        const text = getActiveText(inputEl);
        if (text.length > 5) {
            try {
                // Pre-flight check
                const intentResponse = await chrome.runtime.sendMessage({ type: "CHECK_INTENT", text: text });
                if (intentResponse && intentResponse.isJailbreak) {
                    updateRealtimeBadge('unsafe', intentResponse.score * 100);
                    if (heatmapOverlay) heatmapOverlay.style.display = 'none';
                    return;
                }

                updateRealtimeBadge('scanning');
                const response = await chrome.runtime.sendMessage({ type: "CHECK_PROMPT", text: text });
                updateRealtimeBadge(response.isSafe ? 'safe' : 'unsafe', response.riskScore);
                renderHeatmap(inputEl, response.aiEntities);
            } catch (err) {
                updateRealtimeBadge('safe', 0);
                if (heatmapOverlay) heatmapOverlay.style.display = 'none';
            }
        } else {
            if (realtimeBadge) realtimeBadge.style.display = 'none';
            if (heatmapOverlay) heatmapOverlay.style.display = 'none';
        }
    }, 500);
}, true);

// Keep heatmap scrolled with input
document.addEventListener('scroll', (event) => {
    if (heatmapOverlay && event.target && event.target.tagName &&
        (event.target.tagName === 'TEXTAREA' || event.target.getAttribute('contenteditable') === 'true')) {
        heatmapOverlay.scrollTop = event.target.scrollTop;
        heatmapOverlay.scrollLeft = event.target.scrollLeft;
    }
}, true);

// ==========================================
// REVERSIBLE REDACTION: MUTATION OBSERVER
// ==========================================
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
            checkAndReplaceToken(mutation.target);
        } else if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    checkAndReplaceToken(node);
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    walkDOMAndReplaceTokens(node);
                }
            });
        }
    });
});

observer.observe(document.body, { childList: true, characterData: true, subtree: true });

function walkDOMAndReplaceTokens(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        checkAndReplaceToken(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        node.childNodes.forEach(walkDOMAndReplaceTokens);
    }
}

async function checkAndReplaceToken(textNode) {
    if (textNode.nodeValue && textNode.nodeValue.includes('{{L_VAULT_')) {
        // Skip un-redacting if the text node is inside the prompt input area
        const parent = textNode.parentElement;
        if (parent) {
            const isInput = parent.tagName === 'TEXTAREA' || 
                            parent.tagName === 'INPUT' || 
                            parent.isContentEditable || 
                            (typeof parent.closest === 'function' && parent.closest('[contenteditable="true"]'));
            if (isInput) return;
        }

        const regex = /\{\{L_VAULT_[A-Z0-9]+\}\}/g;
        let match;
        const matches = [];
        while ((match = regex.exec(textNode.nodeValue)) !== null) {
            matches.push(match[0]);
        }

        if (matches.length > 0) {
            let newValue = textNode.nodeValue;
            for (const token of matches) {
                try {
                    const response = await chrome.runtime.sendMessage({ type: "GET_TOKEN", token: token });
                    if (response && response.rawText) {
                        newValue = newValue.replace(token, response.rawText);
                    }
                } catch (e) {
                    console.error("Failed to un-redact token:", e);
                }
            }
            if (newValue !== textNode.nodeValue) {
                textNode.nodeValue = newValue;
            }
        }
    }
}