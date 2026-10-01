'use strict';
const form = document.getElementById('settings');
const enabled = document.getElementById('enabled');
const mode = document.getElementById('mode');
const regex = document.getElementById('regex');
const status = document.getElementById('status');
let loaded = false;
let lastValidRegex = WebVpnConverter.DEFAULT_REGEX;
let saveQueue = Promise.resolve();
let revision = 0;

// 读取完成前不允许修改，避免旧设置覆盖用户刚输入的内容。
for (const control of [enabled, mode, regex, document.getElementById('reset')]) control.disabled = true;

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
    lastValidRegex = settings.regex;
    loaded = true;
    for (const control of [enabled, mode, document.getElementById('reset')]) control.disabled = false;
    updateMode();
}).catch(error => message(`读取失败：${error.message}`, true));

function saveSettings(requireValidRegex = false) {
    if (!loaded) return;
    let regexError = null;
    try {
        if (!regex.value.trim()) throw new Error('正则不能为空');
        new RegExp(regex.value, 'i');
        lastValidRegex = regex.value;
    } catch (error) { regexError = error; }
    if (regexError && requireValidRegex) {
        revision++;
        message('正则无效，保留上一次有效设置。', true);
        return;
    }
    const snapshot = { enabled: enabled.checked, mode: mode.value, regex: lastValidRegex };
    const currentRevision = ++revision;
    message('正在自动保存…');
    // 顺序写入，确保快速连续修改时最终保存的是最新设置。
    saveQueue = saveQueue.then(async () => {
        await chrome.storage.local.set(snapshot);
        const result = await chrome.runtime.sendMessage({ type: 'settings-status' });
        if (!result?.ok) throw new Error(result?.error || '请求规则未生效');
    }).then(() => {
        if (currentRevision !== revision) return;
        message(regexError ? '开关和模式已生效；无效正则保留上一次有效设置。' : '已自动保存并生效。', !!regexError);
    }).catch(error => {
        if (currentRevision === revision) message(`设置未生效：${error.message}`, true);
    });
}
mode.addEventListener('change', () => {
    updateMode();
    saveSettings();
});
enabled.addEventListener('change', () => saveSettings());
regex.addEventListener('input', () => saveSettings(true));
document.getElementById('reset').addEventListener('click', () => {
    regex.value = WebVpnConverter.DEFAULT_REGEX;
    saveSettings(true);
});
form.addEventListener('submit', event => event.preventDefault());
