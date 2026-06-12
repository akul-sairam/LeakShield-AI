# LeakShield AI 🛡️

LeakShield AI is an AI-powered privacy guardian Chrome extension designed to monitor, intercept, and secure prompt submissions on popular AI portals (ChatGPT, Claude, and Gemini). It prevents accidental leaks of sensitive personal information (PII) or corporate secrets before they reach LLM servers.

---

## Key Features

* **Real-time Interception**: Captures submit button clicks and Enter key triggers on ChatGPT, Claude, and Gemini.
* **Sensitive Data Scanner**: Scans prompts for:
  * Email Addresses
  * Phone Numbers
  * API Keys & Auth Tokens
  * Credit Cards
  * IP Addresses
  * Custom Keywords & Company Secrets
* **"Auto-Redact" Action**: Auto-masks sensitive terms in the prompt with redacted placeholders (e.g., `[EMAIL_REDACTED]`, `[CONFIDENTIAL_REDACTED]`) and submits the modified prompt securely.
* **Shadow DOM Encapsulation**: Warning modals are rendered in a closed Shadow DOM to avoid styling conflicts or injection attempts by the host AI site.
* **"Leaky Site" Scanner**: Displays a warning alert badge (`!`) on the extension icon if navigating to unverified AI tools.
* **Glassmorphic Settings Dashboard**: Control scanning toggles, custom keywords, and AI sensitivity slider values in a premium dark-mode dashboard interface.

---

## Project Structure

```
LeakShield AI/
├── manifest.json            # Extension configuration (Manifest V3)
├── content.js               # Capture listeners, Shadow DOM UI, and redact logic
├── background.js            # Message router, storage coordinator, and site scanner
├── styles.css               # Deprecated styles (moved inside Shadow DOM)
├── utils/
│   └── regex-detectors.js   # RegEx patterns and context scanning matcher
├── popup/
│   ├── popup.html           # Settings dashboard view
│   ├── popup.js             # Dashboard input handler & Chrome storage sync
│   └── popup.css            # Dark mode glassmorphic styling
├── lib/
│   ├── transformers.js      # Transformers.js ESM bundle
│   ├── ort-wasm.wasm        # Local ONNX runtime WASM binary
│   ├── ort-wasm-simd.wasm   # Local ONNX SIMD WASM binary
│   └── ort-wasm-simd-threaded.wasm # Local ONNX SIMD multi-threaded WASM binary
└── icons/
    └── icon128.png          # Extension toolbar action icon
```

---

## Installation Guide

To load the extension locally in developer mode:

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. In the top-right corner, toggle the **"Developer mode"** switch to **ON**.
4. In the top-left corner, click the **"Load unpacked"** button.
5. Select the project root folder (`LeakShield AI`).
6. Pin **LeakShield AI** to your Chrome toolbar for easy settings access.

---

## Architecture Overview

### Capture Phase
The `content.js` script attaches capture-phase keydown and click listeners to LLM input boxes and send buttons. By executing at the capture phase, it preempts site-native event handlers.

### Evaluation Phase
When a submission is intercepted, the prompt text is sent to the background worker (`background.js`). The background worker queries user-configured settings from `chrome.storage.local` and matches the prompt against regular expressions in `regex-detectors.js` and custom keywords via `checkContext()`.

### Action Phase
* **If safe**: The prompt is submitted normally.
* **If unsafe**: The content script blocks event propagation and triggers the Warning Modal inside the closed Shadow DOM overlay. The user can:
  * **Stop & Edit**: Closes the dialog to allow manual revisions.
  * **Auto-Redact & Send**: Replaces violations with redacted labels and automatically submits the prompt.
  * **I understand the risk, send anyway**: Bypasses the interceptor for a single submission.

---

## License

This project is licensed under the MIT License.
