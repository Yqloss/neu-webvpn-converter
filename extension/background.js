'use strict';
importScripts('vendor/crypto-js.min.js', 'converter.js', 'request-rules.js');

let settings = { ...WebVpnConverter.DEFAULTS };
let updateQueue = Promise.resolve();
const originalUrls = new Map();
const ready = chrome.storage.local.get(WebVpnConverter.DEFAULTS).then(saved => {
    settings = saved;
});

function updateRules() {
    const snapshot = { ...settings };
    updateQueue = updateQueue.catch(() => {}).then(async () => {
        const rules = await WebVpnRequestRules.build(snapshot, chrome);
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1, 2, 3], addRules: rules });
        const installed = await chrome.declarativeNetRequest.getDynamicRules();
        if (rules.some(rule => !installed.some(item => item.id === rule.id))) throw new Error('浏览器未安装全部请求规则');
        const bypassRules = await chrome.declarativeNetRequest.getSessionRules();
        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: bypassRules.map(rule => rule.id) });
    });
    return updateQueue;
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let changed = false;
    for (const key of Object.keys(WebVpnConverter.DEFAULTS)) {
        if (!changes[key]) continue;
        changed = true;
        settings[key] = changes[key].newValue ?? WebVpnConverter.DEFAULTS[key];
    }
    if (changed) updateRules().catch(error => console.error('更新请求规则失败：', error));
});

// 这里只记录完整原地址（含锚点），不再通过 tabs.update 发起跳转。
// 真正的跳转由浏览器持久化的 DNR 规则在请求阶段执行。
chrome.webNavigation.onBeforeNavigate.addListener(details => {
    if (details.frameId === 0 && details.tabId >= 0) originalUrls.set(details.tabId, details.url);
}, { url: [{ schemes: ['http', 'https'] }] });

function withoutHash(href) {
    const url = new URL(href);
    url.hash = '';
    return url.href;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'settings-status' && sender.id === chrome.runtime.id) {
        (async () => {
            await ready;
            settings = await chrome.storage.local.get(WebVpnConverter.DEFAULTS);
            await updateRules();
            respond({ ok: true });
        })().catch(error => respond({ error: error.message }));
        return true;
    }
    if (message?.type !== 'resolve-navigation') return;
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('redirect.html')) || !Number.isInteger(sender.tab?.id)) return;
    (async () => {
        await ready;
        await updateQueue;
        let source = new URL(message.url);
        if (!['http:', 'https:'].includes(source.protocol)) throw new Error('不支持的地址协议');
        const recorded = originalUrls.get(sender.tab.id);
        if (recorded && withoutHash(recorded) === withoutHash(source.href)) source = new URL(recorded);
        const target = WebVpnConverter.convert(source.href, settings);
        if (target && target !== source.href) {
            respond({ url: target });
            return;
        }
        // 不符合自定义正则或无法解码：先为此标签页的此地址放行，防止本地中转循环。
        const id = 100000 + sender.tab.id;
        const escaped = withoutHash(source.href).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [id],
            addRules: [{ id, priority: 1000, action: { type: 'allow' }, condition: {
                regexFilter: `^${escaped}$`, isUrlFilterCaseSensitive: true,
                resourceTypes: ['main_frame'], tabIds: [sender.tab.id],
            } }],
        });
        respond({ url: source.href });
    })().catch(error => respond({ error: error.message }));
    return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
    originalUrls.delete(tabId);
    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [100000 + tabId] }).catch(() => {});
});
ready.then(updateRules).catch(error => console.error('初始化请求规则失败：', error));
