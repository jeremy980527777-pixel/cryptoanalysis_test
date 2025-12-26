// 【重要】請確認這裡是你 Ngrok 的最新網址 (需與 Python 白名單一致)
const API_URL = "https://tunefully-abstemious-shu.ngrok-free.dev/api/results";

// 狀態變數
let previousDataMap = { bull: [], bear: [] }; 
let isFirstLoad = true;

let settings = {
    notifications: false,
    sound: false,
    volume: 0.5,
    direction: 'all',
    apiKey: "" // 新增金鑰欄位
};

// 初始化音效
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
    setupModal();
    updateDashboard();
    
    // 輪詢與時間更新
    setInterval(updateDashboard, 10000); // 10秒請求一次資料
    setInterval(updateToastTimes, 60000); // 1分鐘更新一次通知時間
});

async function updateDashboard() {
    const statusText = document.getElementById('statusText');
    const dot = document.getElementById('dot');
    
    // 組合 API URL (帶上 key)
    let url = `${API_URL}?t=${new Date().getTime()}`;
    if (settings.apiKey) {
        url += `&key=${encodeURIComponent(settings.apiKey)}`;
    }

    try {
        const res = await fetch(url, {
            headers: new Headers({ "ngrok-skip-browser-warning": "true" }),
        });

        // 處理 409 衝突 (重複登入)
        if (res.status === 409) {
            const errJson = await res.json();
            statusText.innerText = '⚠️ 金鑰多裝置衝突';
            dot.className = 'dot red';
            dot.style.boxShadow = "none";
            // 只有當不是第一次載入時才彈出警告，避免一打開就跳視窗
            if (!isFirstLoad) {
                showToastAlert("連線被拒", errJson.detail || "金鑰正在其他裝置使用中", "bear");
            }
            return;
        }

        const json = await res.json();
        
        // 顯示狀態
        if (json.status === 'success') {
            const isVIP = json.type === 'Premium';
            const userLabel = isVIP ? `👑 VIP (${json.user})` : 'Guest (30m延遲)';
            
            statusText.innerText = `${userLabel} | 更新: ${json.timestamp}`;
            
            // VIP 顯示金色，免費顯示綠色
            dot.className = isVIP ? 'dot orange' : 'dot green';
            dot.style.boxShadow = isVIP ? "0 0 8px #FFD700" : "0 0 5px #4CAF50";

            renderLists(json.data);
            checkDiffAndNotify(json.data);
            
            previousDataMap.bull = json.data.bull.map(i => i.name);
            previousDataMap.bear = json.data.bear.map(i => i.name);
            isFirstLoad = false;

            // 如果有 error (例如 key 無效)，更新一下 UI 狀態文字
            if (json.error) {
                const keyStatus = document.getElementById("keyStatus");
                if (keyStatus) {
                    keyStatus.innerText = "❌ 金鑰無效，已切換至免費版";
                    keyStatus.style.color = "#F44336";
                }
            }

        } else if (json.status === 'waiting') {
            statusText.innerText = '伺服器正在運算中...';
            dot.className = 'dot orange';
        } else {
            statusText.innerText = '伺服器錯誤';
            dot.className = 'dot red';
        }
    } catch (e) {
        console.error(e);
        statusText.innerText = '無法連線';
        dot.className = 'dot red';
    }
}

// --- 核心邏輯：比對變動 ---
function checkDiffAndNotify(newData) {
    if (isFirstLoad) return; 

    const currBull = newData.bull.map(i => i.name);
    const currBear = newData.bear.map(i => i.name);
    const bullDiff = getDiff(previousDataMap.bull, currBull);
    const bearDiff = getDiff(previousDataMap.bear, currBear);

    let shouldNotify = false;
    let notifyDetails = [];
    let alertType = 'mixed';

    const watchBull = settings.direction === 'all' || settings.direction === 'bull';
    const watchBear = settings.direction === 'all' || settings.direction === 'bear';

    if (watchBull && (bullDiff.added.length > 0 || bullDiff.removed.length > 0)) {
        shouldNotify = true;
        if (bullDiff.added.length > 0) notifyDetails.push(`<span class="added">🚀 多頭新增: ${bullDiff.added.join(', ')}</span>`);
        if (bullDiff.removed.length > 0) notifyDetails.push(`<span class="removed">💨 多頭移除: ${bullDiff.removed.join(', ')}</span>`);
        alertType = 'bull';
    }

    if (watchBear && (bearDiff.added.length > 0 || bearDiff.removed.length > 0)) {
        shouldNotify = true;
        if (bearDiff.added.length > 0) notifyDetails.push(`<span class="added">📉 空頭新增: ${bearDiff.added.join(', ')}</span>`);
        if (bearDiff.removed.length > 0) notifyDetails.push(`<span class="removed">💨 空頭移除: ${bearDiff.removed.join(', ')}</span>`);
        alertType = (watchBull && (bullDiff.added.length || bullDiff.removed.length)) ? 'mixed' : 'bear';
    }

    if (shouldNotify) {
        playBell();
        showToastAlert("市場名單變動", notifyDetails.join('<br>'), alertType);

        if (settings.notifications && Notification.permission === "granted") {
            const summary = notifyDetails.map(s => s.replace(/<[^>]*>/g, '')).join('\n');
            new Notification("Kynetic Alert", { body: summary });
        }
    }
}

function getDiff(prev, curr) {
    return {
        added: curr.filter(x => !prev.includes(x)),
        removed: prev.filter(x => !curr.includes(x))
    };
}

// --- 浮動通知 (永久顯示 + 時間標記) ---
function showToastAlert(title, htmlContent, type) {
    const container = document.getElementById('notificationContainer');
    const toast = document.createElement('div');
    const nowTimestamp = Date.now();
    
    toast.setAttribute('data-timestamp', nowTimestamp);
    toast.className = `toast-alert ${type}`;
    
    toast.innerHTML = `
        <div class="toast-header">
            <div class="toast-title-group">
                <span class="toast-title-text">${title}</span>
                <span class="toast-time">剛剛</span>
            </div>
            <span class="toast-close" onclick="this.closest('.toast-alert').remove()">✕</span>
        </div>
        <div class="toast-body">${htmlContent}</div>
    `;
    container.prepend(toast);
}

function getRelativeTime(timestamp) {
    const now = Date.now();
    const diffInSeconds = Math.floor((now - timestamp) / 1000);
    if (diffInSeconds < 60) return "剛剛";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} 小時前`;
    return "超過 1 天";
}

function updateToastTimes() {
    const toasts = document.querySelectorAll('.toast-alert');
    toasts.forEach(toast => {
        const timestamp = parseInt(toast.getAttribute('data-timestamp'));
        const timeLabel = toast.querySelector('.toast-time');
        if (timestamp && timeLabel) {
            timeLabel.innerText = getRelativeTime(timestamp);
        }
    });
}

function renderLists(data) {
    const container = document.getElementById('content');
    container.innerHTML = ''; 
    const createSection = (title, list, typeClass, icon) => {
        const sec = document.createElement('div');
        sec.className = `section ${typeClass}`;
        let listHtml = list.length === 0 ? '<div class="empty-msg">無</div>' : '<ul>' + list.map(item => `
            <li>
                <span class="coin-name">${item.name}</span>
                <div class="badges">
                    <span class="badge msg-badge">${item.msg.replace('爆量','<span class="fire">🔥爆量</span>')}</span>
                    <span class="badge score-badge">${item.score}</span>
                </div>
            </li>`).join('') + '</ul>';
        sec.innerHTML = `<h3>${icon} ${title}</h3>${listHtml}`;
        return sec;
    };
    container.appendChild(createSection('多頭異常', data.bull, 'bull', '🚀'));
    container.appendChild(createSection('空頭異常', data.bear, 'bear', '📉'));
    container.appendChild(createSection('等待突破', data.neut, 'neut', '⚖️'));
}

// --- 設定介面邏輯 ---
function setupModal() {
    const modal = document.getElementById("settingsModal");
    const btn = document.getElementById("settingsBtn");
    const close = document.getElementsByClassName("close-btn")[0];
    const apiKeyInput = document.getElementById("apiKeyInput");
    const saveKeyBtn = document.getElementById("saveKeyBtn");
    const keyStatus = document.getElementById("keyStatus");

    btn.onclick = () => {
        modal.style.display = "block";
        apiKeyInput.value = settings.apiKey || "";
        updateKeyStatusUI();
    };
    close.onclick = () => modal.style.display = "none";
    window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; }

    const notifyToggle = document.getElementById("notifyToggle");
    const soundToggle = document.getElementById("soundToggle");
    const directionSelect = document.getElementById("directionSelect");
    const volSlider = document.getElementById("volumeSlider");
    const volText = document.getElementById("volValue");
    const testBtn = document.getElementById("testNotifyBtn");

    notifyToggle.checked = settings.notifications;
    soundToggle.checked = settings.sound;
    directionSelect.value = settings.direction;
    volSlider.value = settings.volume * 100;
    volText.innerText = Math.round(settings.volume * 100) + "%";

    notifyToggle.onchange = () => {
        settings.notifications = notifyToggle.checked;
        if (settings.notifications && Notification.permission !== "granted") Notification.requestPermission();
        saveSettings();
    };
    soundToggle.onchange = () => { settings.sound = soundToggle.checked; saveSettings(); };
    directionSelect.onchange = () => { settings.direction = directionSelect.value; saveSettings(); };
    volSlider.oninput = () => {
        settings.volume = volSlider.value / 100;
        volText.innerText = volSlider.value + "%";
        saveSettings();
    };

    saveKeyBtn.onclick = () => {
        const val = apiKeyInput.value.trim();
        settings.apiKey = val;
        saveSettings();
        saveKeyBtn.innerText = "已儲存";
        setTimeout(() => saveKeyBtn.innerText = "驗證", 1000);
        updateKeyStatusUI();
        updateDashboard(); // 立即重新抓資料
    };

    testBtn.onclick = () => {
        playBell();
        showToastAlert("測試通知", "<span class='added'>🚀 多頭新增: BTC</span><br><span class='removed'>💨 空頭移除: ETH</span>", "mixed");
    };

    function updateKeyStatusUI() {
        if (!settings.apiKey) {
            keyStatus.innerText = "目前狀態: 免費版 (30分鐘延遲)";
            keyStatus.style.color = "#888";
        } else {
            keyStatus.innerText = "已設定金鑰 (連線驗證中...)";
            keyStatus.style.color = "#4CAF50";
        }
    }
}

function saveSettings() { localStorage.setItem('cryptoMonitorSettings', JSON.stringify(settings)); }
function loadSettings() {
    const saved = localStorage.getItem('cryptoMonitorSettings');
    if (saved) settings = { ...settings, ...JSON.parse(saved) };
}