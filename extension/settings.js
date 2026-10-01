'use strict';
const form = document.getElementById('settings');
const enabled = document.getElementById('enabled');
const mode = document.getElementById('mode');
const regex = document.getElementById('regex');
const status = document.getElementById('status');

function updateMode() {
    const direct = mode.value === 'to-direct';
    regex.disabled = direct;
    document.getElementById('regex-help').hidden = direct;
    document.getElementById('direct-help').hidden = !direct;
}
function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
}
chrome.storage.local.get(WebVpnConverter.DEFAULTS).then(settings => {
    enabled.checked = settings.enabled;
    mode.value = settings.mode;
    regex.value = settings.regex;
    updateMode();
}).catch(error => message(`读取失败：${error.message}`, true));
mode.addEventListener('change', updateMode);
document.getElementById('reset').addEventListener('click', () => {
    regex.value = WebVpnConverter.DEFAULT_REGEX;
    message('已恢复默认正则，点击“保存设置”生效。');
});
form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
        if (mode.value === 'to-vpn') new RegExp(regex.value, 'i');
        await chrome.storage.local.set({ enabled: enabled.checked, mode: mode.value, regex: regex.value });
        message('已保存，下次导航时生效。');
    } catch (error) { message(`保存失败：${error.message}`, true); }
});
