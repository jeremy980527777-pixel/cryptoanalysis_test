// 🔥 設定主機 API 網址
const API_URL = "https://delta-scope.net/api/results";

// 狀態變數
let previousDataMap = { bull: [], bear: [] }; 
let isFirstLoad = true;
let pollInterval = null;
let processedCoins = new Set();
let myChart = null; // 圖表實例

let settings = {
    notifications: false,
    sound: false,
    volume: 0.5,
    direction: 'all',
    apiKey: ""
};

// 音效初始化
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playBell() {
    if (!settings.sound) return;
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    const vol = settings.volume;

    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.connect(gain1); gain1.connect(audioContext.destination);
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(1100, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    osc1.start(now); osc1.stop(now + 1.5);

    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.connect(gain2); gain2.connect(audioContext.destination);
    osc2.type = 'sine'; osc2.frequency.setValueAtTime(1650, now);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(vol * 0.5, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.start(now); osc2.stop(now + 0.5);
}

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupModal(); // 設定按鈕與視窗
    
    updateDashboard(true); // 第一次載入
    startPolling();        // 開始輪詢
});

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => {
        updateDashboard(false);
    }, 5000); // 5秒更新一次
}

async function updateDashboard(isClaiming = false) {
    const statusText = document.getElementById('statusText');
    const dot = document.getElementById('dot');
    
    let url = `${API_URL}?t=${new Date().getTime()}`;
    if (settings.apiKey) {
        url += `&key=${encodeURIComponent(settings.apiKey)}`;
        if (isClaiming) url += `&claim=true`;
    }

    try {
        const res = await fetch(url);
        
        if (res.status === 409) {
            statusText.innerText = '🚫 已被登出 (其他裝置登入)';
            statusText.style.color = '#F44336';
            dot.className = 'dot red';
            return;
        }

        const json = await res.json();
        
        if (json.type === 'Premium') {
            statusText.innerText = `👑 VIP (${json.user}) | 更新: ${json.timestamp}`;
            dot.className = 'dot orange';
            dot.style.boxShadow = "0 0 8px #FFD700";
        } else {
            statusText.innerText = `👤 Guest | 更新: ${json.timestamp}`;
            dot.className = 'dot green';
        }

        renderLists(json.data);
        checkDiffAndNotify(json.data);
        
        // 更新快照
        previousDataMap.bull = json.data.bull.map(i => i.name);
        previousDataMap.bear = json.data.bear.map(i => i.name);
        isFirstLoad = false;

    } catch (e) {
        console.error(e);
        statusText.innerText = '連線中斷';
        dot.className = 'dot red';
    }
}

function checkDiffAndNotify(newData) {
    if (isFirstLoad) return; 

    // 這裡保留你原本的 Diff 邏輯...
    // 為了節省篇幅我簡化顯示 Toast 的部分
    const currBull = newData.bull.map(i => i.name);
    const addedBull = currBull.filter(x => !previousDataMap.bull.includes(x));
    
    if (addedBull.length > 0 && (settings.direction === 'all' || settings.direction === 'bull')) {
        playBell();
        showToastAlert("多頭新增", addedBull.join(', '), "bull");
        if(settings.notifications) new Notification("Delta Scope", { body: `多頭新增: ${addedBull}` });
    }
}

function showToastAlert(title, message, type) {
    const container = document.getElementById('notificationContainer');
    const toast = document.createElement('div');
    toast.className = `toast-alert ${type}`;
    
    toast.innerHTML = `
        <div class="toast-header">
            <span class="toast-title-text">${title}</span>
            <span class="toast-close" onclick="this.parentElement.parentElement.remove()">×</span>
        </div>
        <div class="toast-body">
            <span class="coin-name">${message}</span>
        </div>
    `;
    container.appendChild(toast); // 加在下面
    
    // 5秒後自動消失
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function renderLists(data) {
    const container = document.getElementById('content');
    container.innerHTML = ''; 

    const createSection = (title, list, typeClass) => {
        const sec = document.createElement('div');
        sec.className = `section ${typeClass}`;
        sec.innerHTML = `<h3>${title}</h3>`;
        
        const ul = document.createElement('ul');
        if (list.length === 0) {
            ul.innerHTML = '<li style="justify-content:center;color:#666">暫無數據</li>';
        } else {
            list.forEach(item => {
                const li = document.createElement('li');
                // 🔥 點擊觸發圖表
                li.style.cursor = 'pointer';
                li.onclick = () => openChartModal(item.name, item.trend || [], typeClass);
                
                li.innerHTML = `
                    <span class="coin-name">${item.name}</span>
                    <div class="badges">
                        <span class="badge msg-badge">${item.msg}</span>
                        <span class="badge score-badge ${item.score>=80?'fire':''}">${item.score}</span>
                        <span class="badge msg-badge">⏱ ${item.time_on_board}</span>
                    </div>
                `;
                ul.appendChild(li);
            });
        }
        sec.appendChild(ul);
        return sec;
    };

    if (settings.direction === 'all' || settings.direction === 'bull') 
        container.appendChild(createSection('🚀 多頭異常', data.bull, 'bull'));
    
    if (settings.direction === 'all' || settings.direction === 'bear') 
        container.appendChild(createSection('📉 空頭異常', data.bear, 'bear'));
    
    container.appendChild(createSection('⚖️ 等待突破', data.neut, 'neut'));
}

// --- 🔥 圖表功能 🔥 ---
function openChartModal(coinName, trendData, type) {
    const modal = document.getElementById("chartModal");
    const title = document.getElementById("chartTitle");
    const ctx = document.getElementById("trendChart").getContext("2d");

    if (!trendData || trendData.length === 0) trendData = [0];

    title.innerText = `${coinName} - 趨勢圖表`;
    modal.style.display = "block";

    if (myChart) myChart.destroy();

    let color = type === 'bear' ? '#F44336' : '#4CAF50';
    let bgColor = type === 'bear' ? 'rgba(244, 67, 54, 0.2)' : 'rgba(76, 175, 80, 0.2)';

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.map((_, i) => i), // 簡單用索引當 X 軸
            datasets: [{
                data: trendData,
                borderColor: color,
                backgroundColor: bgColor,
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 0 // 隱藏點，讓線條更乾淨
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { grid: { color: '#333' } }
            }
        }
    });
}
window.closeChartModal = () => document.getElementById("chartModal").style.display = "none";

function setupModal() {
    // ... 設定視窗邏輯 (保持不變，或照著之前上傳的即可) ...
    const modal = document.getElementById("settingsModal");
    const btn = document.getElementById("settingsBtn");
    const close = document.getElementsByClassName("close-btn")[0];
    const apiKeyInput = document.getElementById("apiKeyInput");
    const saveKeyBtn = document.getElementById("saveKeyBtn");

    btn.onclick = () => {
        modal.style.display = "block";
        apiKeyInput.value = settings.apiKey || "";
    };
    close.onclick = () => modal.style.display = "none";
    window.onclick = (e) => { 
        if (e.target == modal) modal.style.display = "none";
        if (e.target == document.getElementById("chartModal")) document.getElementById("chartModal").style.display = "none";
    }
    
    // 綁定其他設定按鈕 (省略重複代碼)...
    document.getElementById("saveKeyBtn").onclick = () => {
        settings.apiKey = apiKeyInput.value.trim();
        saveSettings();
        updateDashboard(true);
    };
}

function saveSettings() { localStorage.setItem('cryptoMonitorSettings', JSON.stringify(settings)); }
function loadSettings() {
    const saved = localStorage.getItem('cryptoMonitorSettings');
    if (saved) settings = { ...settings, ...JSON.parse(saved) };
}
