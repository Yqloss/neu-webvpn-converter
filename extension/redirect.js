'use strict';
(async () => {
    try {
        const source = window.location.hash.slice(1);
        if (!source) throw new Error('缺少原始地址');
        const result = await chrome.runtime.sendMessage({ type: 'resolve-navigation', url: source });
        if (!result || result.error) throw new Error(result?.error || '转换未完成');
        const target = new URL(result.url);
        if (!['http:', 'https:'].includes(target.protocol)) throw new Error('不支持的地址协议');
        window.location.replace(target.href);
    } catch (error) {
        document.querySelector('h1').textContent = '地址转换失败';
        const status = document.getElementById('status');
        status.textContent = error.message;
        status.classList.add('error');
    }
})();
