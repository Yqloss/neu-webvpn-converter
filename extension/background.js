'use strict';
importScripts('vendor/crypto-js.min.js', 'converter.js');

let settings = { ...WebVpnConverter.DEFAULTS };
const ready = chrome.storage.local.get(WebVpnConverter.DEFAULTS).then(saved => {
    settings = saved;
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(WebVpnConverter.DEFAULTS)) {
        if (changes[key]) settings[key] = changes[key].newValue ?? WebVpnConverter.DEFAULTS[key];
    }
});

const navigationVersions = new Map();
chrome.webNavigation.onBeforeNavigate.addListener(async details => {
    if (details.frameId !== 0 || details.tabId < 0) return;
    const version = (navigationVersions.get(details.tabId) || 0) + 1;
    navigationVersions.set(details.tabId, version);
    try {
        await ready;
        if (navigationVersions.get(details.tabId) !== version) return;
        const target = WebVpnConverter.convert(details.url, settings);
        if (!target || target === details.url) return;
        await chrome.tabs.update(details.tabId, { url: target });
    } catch (error) {
        console.warn('WebVPN 转换失败：', error);
    }
}, { url: [{ schemes: ['http', 'https'] }] });
chrome.tabs.onRemoved.addListener(tabId => navigationVersions.delete(tabId));
