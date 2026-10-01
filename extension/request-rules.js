(function (root) {
    'use strict';
    async function build(settings, chromeApi) {
        if (!settings.enabled) return [];
        let pattern;
        const allowRules = [];
        if (settings.mode === 'to-direct') {
            // DNR 的编译内存只有 2KB；不要在请求层展开长密文的计数重复。
            // 此处仅识别代理协议路径，密文长度、字符和端口由 converter.js 校验。
            pattern = String.raw`^(https?://webvpn\.neu\.edu\.cn(?::[0-9]+)?/https?[/-].*)$`;
        } else if (settings.mode === 'to-vpn') {
            // 默认范围无需使用 RE2 不支持的负向前瞻：通过独立 allow 规则排除域名。
            if (settings.regex === WebVpnConverter.DEFAULT_REGEX) {
                pattern = String.raw`^(https?://(?:[a-z0-9-]+\.)+neu\.edu\.cn(?::[0-9]+)?(?:/.*)?)$`;
                allowRules.push({ id: 3, priority: 100, action: { type: 'allow' }, condition: {
                    regexFilter: String.raw`^https?://(?:ipgw|www)\.neu\.edu\.cn(?::[0-9]+)?(?:/|$)`,
                    resourceTypes: ['main_frame'],
                } });
            } else {
                // 外层捕获整个 URL，使 regexSubstitution 保留全部路径与查询参数。
                pattern = `^(.*(?:${settings.regex}).*)$`;
                const supported = await chromeApi.declarativeNetRequest.isRegexSupported({
                    regex: pattern, isCaseSensitive: false, requireCapturing: true,
                });
                // 自定义 JS 正则含前瞻等 RE2 不支持的语法时，在本地中转页判断。
                // 网络请求 URL 不包含页面锚点；含锚点的匹配也交给本地完整 URL 判断。
                if (!supported.isSupported || /#|\\x23|\\u0023/i.test(settings.regex)) pattern = String.raw`^(https?://.*)$`;
            }
            // 即使自定义正则包含 WebVPN，也不对 WebVPN 再次包装。
            allowRules.push({ id: 2, priority: 100, action: { type: 'allow' }, condition: {
                regexFilter: String.raw`^https?://webvpn\.neu\.edu\.cn(?::[0-9]+)?(?:/|$)`,
                resourceTypes: ['main_frame'],
            } });
        } else return [];
        const supported = await chromeApi.declarativeNetRequest.isRegexSupported({
            regex: pattern, isCaseSensitive: false, requireCapturing: true,
        });
        if (!supported.isSupported) throw new Error(`浏览器不支持请求规则：${supported.reason || '正则无法编译'}`);
        return [{
            id: 1, priority: 1,
            action: { type: 'redirect', redirect: { regexSubstitution: chromeApi.runtime.getURL('redirect.html') + '#\\1' } },
            condition: { regexFilter: pattern, isUrlFilterCaseSensitive: false, resourceTypes: ['main_frame'] },
        }, ...allowRules];
    }
    root.WebVpnRequestRules = Object.freeze({ build });
})(globalThis);
