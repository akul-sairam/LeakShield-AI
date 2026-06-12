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
    viewLogsBtn.onclick = () => {
        alert("View Blocked Leaks: No privacy leaks blocked in this session yet.");
    };
});