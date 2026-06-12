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
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        element.select();
        document.execCommand('insertText', false, text);
    } else {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertText', false, text);
    }
    
    // Dispatch input event as a fallback
    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
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
    let response;
    try {
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

    shadow.querySelector('#ls-redact').onclick = () => {
        const finalInput = getActiveInputElement(eventTarget);
        if (!finalInput) {
            removeContainer();
            return;
        }

        const originalText = getActiveText(finalInput);
        let newText = originalText;

        // Redact standard categories
        newText = newText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]");
        newText = newText.replace(/(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[PHONE_REDACTED]");
        newText = newText.replace(/(?:sk-|key-|auth-)[a-zA-Z0-9]{24,}/gi, "[API_KEY_REDACTED]");
        newText = newText.replace(/\b(?:\d[ -]*?){13,16}\b/g, "[CREDIT_CARD_REDACTED]");
        newText = newText.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP_REDACTED]");

        // Redact custom keywords/secrets parsed from violations
        violations.forEach(v => {
            const secretMatch = v.match(/Company Secret \(([^)]+)\)/) || v.match(/Internal Project: (.*)/);
            if (secretMatch) {
                const secretVal = secretMatch[1];
                const escaped = secretVal.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                newText = newText.replace(new RegExp(escaped, 'gi'), "[CONFIDENTIAL_REDACTED]");
            }
        });

        // Redact AI-detected entity words (from token classification)
        aiEntities.forEach(entity => {
            if (entity.word) {
                const escaped = entity.word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const cleanLabel = entity.type.toUpperCase() + "_REDACTED";
                newText = newText.replace(new RegExp(escaped, 'gi'), `[${cleanLabel}]`);
            }
        });

        // Inject cleaned text using document.execCommand to sync with React/Lexical editor state
        setElementText(finalInput, newText);

        removeContainer();

        // Trigger send button automatically with isBypassing = true
        try {
            isBypassing = true;
            const sendButton = findSendButton();
            if (sendButton) {
                sendButton.click();
            } else {
                const form = finalInput.closest('form');
                if (form) {
                    form.requestSubmit();
                }
            }
        } catch (e) {
            console.error("LeakShield AI: Error during redacted submit:", e);
        } finally {
            isBypassing = false;
        }
    };
}