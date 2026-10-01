(function (root) {
    'use strict';
    const VPN_ORIGIN = 'https://webvpn.neu.edu.cn';
    const KEY = 'b0A58a69394ce73@';
    const DEFAULT_REGEX = String.raw`^https?://(?!(?:ipgw|webvpn|www)\.neu\.edu\.cn(?::\d+)?(?:[/?#]|$))(?:[a-z0-9-]+\.)+neu\.edu\.cn(?::\d+)?(?:[/?#]|$)`;
    const DEFAULTS = Object.freeze({ enabled: true, mode: 'to-vpn', regex: DEFAULT_REGEX });

    function isWebVpn(url) {
        return url.hostname.toLowerCase() === 'webvpn.neu.edu.cn';
    }

    function toWebVpn(url) {
        const key = CryptoJS.enc.Utf8.parse(KEY);
        const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(url.hostname), key, {
            iv: key.clone(), mode: CryptoJS.mode.CFB, padding: CryptoJS.pad.NoPadding,
        });
        const host = key.toString(CryptoJS.enc.Hex) + encrypted.ciphertext.toString(CryptoJS.enc.Hex);
        const protocol = url.protocol.slice(0, -1);
        const route = url.port ? `${protocol}-${url.port}` : protocol;
        return `${VPN_ORIGIN}/${route}/${host}${url.pathname}${url.search}${url.hash}`;
    }

    function fromWebVpn(url) {
        // 只识别东北大学 WebVPN 的地址路径；登录页、设置页不转换。
        const match = /^\/(https?)(?:-(\d{1,5}))?\/([a-f0-9]{34,})(\/.*)?$/i.exec(url.pathname);
        if (!match || match[3].length % 2 !== 0) return null;
        const port = match[2];
        if (port && (Number(port) < 1 || Number(port) > 65535)) return null;
        const iv = CryptoJS.enc.Hex.parse(match[3].slice(0, 32));
        const ciphertext = CryptoJS.enc.Hex.parse(match[3].slice(32));
        const key = CryptoJS.enc.Utf8.parse(KEY);
        let hostname;
        try {
            hostname = CryptoJS.AES.decrypt({ ciphertext }, key, {
                iv, mode: CryptoJS.mode.CFB, padding: CryptoJS.pad.NoPadding,
            }).toString(CryptoJS.enc.Utf8);
        } catch { return null; }
        // 拒绝解密失败的数据，避免把错误内容解释成 URL 的其他部分。
        if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*\.?$/i.test(hostname)) return null;
        try {
            return new URL(`${match[1].toLowerCase()}://${hostname}${port ? ':' + port : ''}${match[4] || '/'}${url.search}${url.hash}`).href;
        } catch { return null; }
    }

    function convert(href, settings = DEFAULTS) {
        if (!settings.enabled) return null;
        let url;
        try { url = new URL(href); } catch { return null; }
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        if (settings.mode === 'to-direct') {
            return isWebVpn(url) ? fromWebVpn(url) : null;
        }
        if (settings.mode !== 'to-vpn' || isWebVpn(url)) return null;
        // 正则针对整个 URL，不仅是域名；大小写不敏感。
        try {
            if (!new RegExp(settings.regex, 'i').test(url.href)) return null;
        } catch { return null; }
        return toWebVpn(url);
    }

    root.WebVpnConverter = Object.freeze({ DEFAULTS, DEFAULT_REGEX, convert });
})(globalThis);
