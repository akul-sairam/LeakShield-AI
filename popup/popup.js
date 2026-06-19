document.addEventListener('DOMContentLoaded', () => {
    const sensitivitySlider = document.getElementById('sensitivity');
    const sensitivityValue = document.getElementById('sensitivity-value');
    const keywordInput = document.getElementById('keyword-input');
    const addKeywordBtn = document.getElementById('add-keyword-btn');
    const keywordList = document.getElementById('keyword-list');
    const viewLogsBtn = document.getElementById('view-logs');

    const toggleIds = ['email', 'phone', 'api', 'card', 'ip', 'secrets'];
    const toggles = {};
    toggleIds.forEach(id => {
        toggles[id] = document.getElementById(`toggle-${id}`);
    });

    let activeKeywords = [];

    // Load saved settings
    chrome.storage.local.get(['sensitivity', 'customKeywords', 'toggles'], (data) => {
        // Sensitivity
        if (data.sensitivity !== undefined) {
            sensitivitySlider.value = data.sensitivity;
            sensitivityValue.textContent = `${data.sensitivity}%`;
        } else {
            sensitivityValue.textContent = `${sensitivitySlider.value}%`;
        }

        // Custom Keywords
        if (data.customKeywords) {
            activeKeywords = data.customKeywords;
            renderKeywords();
        }

        // Toggles
        if (data.toggles) {
            toggleIds.forEach(id => {
                if (data.toggles[id] !== undefined) {
                    toggles[id].checked = data.toggles[id];
                }
            });
        }
    });

    // Save sensitivity on change/input
    sensitivitySlider.addEventListener('input', (e) => {
        sensitivityValue.textContent = `${e.target.value}%`;
    });

    sensitivitySlider.addEventListener('change', (e) => {
        chrome.storage.local.set({ sensitivity: parseInt(e.target.value, 10) });
    });

    // Save toggles on change
    toggleIds.forEach(id => {
        toggles[id].addEventListener('change', () => {
            const togglesState = {};
            toggleIds.forEach(key => {
                togglesState[key] = toggles[key].checked;
            });
            chrome.storage.local.set({ toggles: togglesState });
        });
    });

    // Add keyword function
    function addKeyword() {
        const value = keywordInput.value.trim();
        if (value && !activeKeywords.includes(value)) {
            activeKeywords.push(value);
            chrome.storage.local.set({ customKeywords: activeKeywords }, () => {
                renderKeywords();
                keywordInput.value = '';
            });
        }
    }

    // Add keyword button click
    addKeywordBtn.addEventListener('click', addKeyword);

    // Add keyword enter keypress
    keywordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addKeyword();
        }
    });

    // Render keyword tag chips
    function renderKeywords() {
        keywordList.innerHTML = '';
        activeKeywords.forEach((kw) => {
            const li = document.createElement('li');
            li.className = 'keyword-tag';
            
            const span = document.createElement('span');
            span.textContent = kw;
            li.appendChild(span);

            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '&times;';
            removeBtn.addEventListener('click', () => {
                activeKeywords = activeKeywords.filter(k => k !== kw);
                chrome.storage.local.set({ customKeywords: activeKeywords }, renderKeywords);
            });
            li.appendChild(removeBtn);

            keywordList.appendChild(li);
        });
    }

    // Logic for "View Logs" button
    const analyticsSection = document.getElementById('analytics-section');
    viewLogsBtn.onclick = () => {
        if (analyticsSection.style.display === 'none') {
            analyticsSection.style.display = 'block';
            viewLogsBtn.textContent = 'Hide Analytics';
            
            // Load Analytics Data
            chrome.storage.local.get(['totalScans', 'leaksPrevented', 'leakHistory', 'averageRiskScore'], (data) => {
                document.getElementById('total-scans').textContent = data.totalScans || 0;
                document.getElementById('leaks-prevented').textContent = data.leaksPrevented || 0;
                
                const avgScore = data.averageRiskScore || 0;
                const scoreEl = document.getElementById('avg-risk-score');
                scoreEl.textContent = `${avgScore}%`;
                if (avgScore >= 75) scoreEl.style.color = '#ef4444';
                else if (avgScore >= 30) scoreEl.style.color = '#fbbf24';
                else scoreEl.style.color = '#10b981';
                
                const historyList = document.getElementById('leak-history-list');
                historyList.innerHTML = '';
                const history = data.leakHistory || [];
                if (history.length === 0) {
                    historyList.innerHTML = '<li class="history-item" style="background:transparent;border:none;color:#94a3b8">No leaks detected yet.</li>';
                } else {
                    history.forEach(item => {
                        const li = document.createElement('li');
                        li.className = 'history-item';
                        const timeStr = new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        li.innerHTML = `<span>${item.type}</span><span class="history-item-time">${timeStr}</span>`;
                        historyList.appendChild(li);
                    });
                }
            });
        } else {
            analyticsSection.style.display = 'none';
            viewLogsBtn.textContent = 'View Analytics';
        }
    };
});