const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CryptoJS = require('../extension/vendor/crypto-js.min.js');
const extension = path.join(__dirname, '../extension');
const flush = () => new Promise(resolve => setImmediate(resolve));
const api = {
    runtime: { getURL: file => 'chrome-extension://test-extension/' + file },
    declarativeNetRequest: { isRegexSupported: async ({ regex }) => ({ isSupported: !regex.includes('(?=') && !regex.includes('(?!') }) },
};
const context = vm.createContext({ URL, CryptoJS });
for (const file of ['converter.js', 'request-rules.js']) vm.runInContext(fs.readFileSync(path.join(extension, file), 'utf8'), context);
const defaults = context.WebVpnConverter.DEFAULTS;
const build = settings => context.WebVpnRequestRules.build(settings, api);

function matchedRule(rules, href, resourceType = 'main_frame') {
    return [...rules].sort((a, b) => b.priority - a.priority).find(rule =>
        rule.condition.resourceTypes.includes(resourceType)
        && new RegExp(rule.condition.regexFilter, rule.condition.isUrlFilterCaseSensitive ? '' : 'i').test(href));
}

test('默认请求规则在原站请求前指向本地页，保留全部路径和查询参数', async () => {
    const rules = await build(defaults);
    const href = 'https://oj.neu.edu.cn/contest/160/problems?a=1&b=%E4%B8%AD';
    const rule = matchedRule(rules, href);
    assert.equal(rule.action.type, 'redirect');
    const capture = new RegExp(rule.condition.regexFilter, 'i').exec(href)[1];
    assert.equal(capture, href);
    assert.equal(rule.action.redirect.regexSubstitution.replace('\\1', capture), api.runtime.getURL('redirect.html') + '#' + href);
    assert.equal(matchedRule(rules, href, 'sub_frame'), undefined);
    assert.equal(matchedRule(rules, href, 'xmlhttprequest'), undefined);
});
test('默认排除域名不进入中转页，其他网站不匹配', async () => {
    const rules = await build(defaults);
    for (const host of ['ipgw.neu.edu.cn', 'webvpn.neu.edu.cn', 'www.neu.edu.cn']) {
        assert.equal(matchedRule(rules, 'https://' + host + '/').action.type, 'allow');
    }
    for (const host of ['neu.edu.cn', 'example.com', 'oj.neu.edu.cn.evil.com']) {
        assert.equal(matchedRule(rules, 'https://' + host + '/'), undefined);
    }
    assert.equal(matchedRule(rules, 'http://a.b.neu.edu.cn:8080/path').action.type, 'redirect');
});
test('反向模式只拦截编码 WebVPN 地址；关闭时没有拦截规则', async () => {
    const rules = await build({ ...defaults, mode: 'to-direct' });
    assert.equal(matchedRule(rules, 'https://webvpn.neu.edu.cn/https/62304135386136393339346365373340bfebea318fd008d8f60d257088/').action.type, 'redirect');
    assert.equal(matchedRule(rules, 'https://webvpn.neu.edu.cn/login'), undefined);
    assert.equal(matchedRule(rules, 'https://oj.neu.edu.cn/'), undefined);
    assert.equal((await build({ ...defaults, enabled: false })).length, 0);
});
test('浏览器拒绝编译时显式报告错误，避免静默跳过规则', async () => {
    const rejectingApi = {
        ...api,
        declarativeNetRequest: { isRegexSupported: async () => ({ isSupported: false, reason: 'memoryLimitExceeded' }) },
    };
    await assert.rejects(context.WebVpnRequestRules.build({ ...defaults, mode: 'to-direct' }, rejectingApi), /memoryLimitExceeded/);
});
test('自定义正则保留全 URL；不支持的前瞻在本地判断', async () => {
    const simple = await build({ ...defaults, regex: 'contest/160' });
    const href = 'https://oj.neu.edu.cn/contest/160/problems?x=1';
    const rule = matchedRule(simple, href);
    assert.equal(new RegExp(rule.condition.regexFilter).exec(href)[1], href);
    assert.equal(matchedRule(simple, 'https://oj.neu.edu.cn/contest/161/problems'), undefined);
    const complex = await build({ ...defaults, regex: '^https://(?!www)' });
    assert.equal(matchedRule(complex, 'https://oj.neu.edu.cn/').action.type, 'redirect');
    assert.equal(matchedRule(complex, 'https://webvpn.neu.edu.cn/').action.type, 'allow');
    const fragment = await build({ ...defaults, regex: '#section$' });
    assert.equal(matchedRule(fragment, 'https://oj.neu.edu.cn/').action.type, 'redirect');
});

test('后台不等待原站：发布 DNR 规则、本地转换、锚点恢复和未匹配地址防循环', async () => {
    let navigation;
    let message;
    let change;
    let dynamic = [];
    const sessions = new Map();
    const chrome = {
        runtime: { id: 'test-extension', getURL: api.runtime.getURL, onMessage: { addListener: fn => { message = fn; } } },
        storage: {
            local: { get: async value => ({ ...value }) },
            onChanged: { addListener: fn => { change = fn; } },
        },
        declarativeNetRequest: {
            isRegexSupported: api.declarativeNetRequest.isRegexSupported,
            updateDynamicRules: async ({ addRules }) => { dynamic = addRules; },
            getDynamicRules: async () => dynamic,
            getSessionRules: async () => [...sessions.values()],
            updateSessionRules: async ({ removeRuleIds = [], addRules = [] }) => {
                for (const id of removeRuleIds) sessions.delete(id);
                for (const rule of addRules) sessions.set(rule.id, rule);
            },
        },
        webNavigation: { onBeforeNavigate: { addListener: fn => { navigation = fn; } } },
        tabs: { onRemoved: { addListener() {} }, update() { throw new Error('不得等待导航事件再 tabs.update'); } },
    };
    const worker = vm.createContext({ URL, CryptoJS, console, chrome });
    worker.importScripts = (...files) => {
        for (const file of files) if (!file.startsWith('vendor/')) vm.runInContext(fs.readFileSync(path.join(extension, file), 'utf8'), worker);
    };
    vm.runInContext(fs.readFileSync(path.join(extension, 'background.js'), 'utf8'), worker);
    await flush();
    assert.equal(matchedRule(dynamic, 'https://oj.neu.edu.cn/').action.type, 'redirect');
    const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('redirect.html'), tab: { id: 7 } };
    const resolve = url => new Promise(response => {
        assert.equal(message({ type: 'resolve-navigation', url }, sender, response), true);
    });
    navigation({ tabId: 7, frameId: 0, url: 'https://oj.neu.edu.cn/a?x=1#section' });
    const converted = await resolve('https://oj.neu.edu.cn/a?x=1');
    assert.equal(converted.url, 'https://webvpn.neu.edu.cn/https/62304135386136393339346365373340bfebea318fd008d8f60d257088/a?x=1#section');
    change({ regex: { newValue: '^https://oj\\.neu\\.edu\\.cn/contest/' } }, 'local');
    await flush();
    const original = 'https://oj.neu.edu.cn/a?x=1&b=2';
    assert.equal((await resolve(original)).url, original);
    const bypass = sessions.get(100007);
    assert.equal(bypass.action.type, 'allow');
    assert.deepEqual(Array.from(bypass.condition.tabIds), [7]);
    assert.ok(new RegExp(bypass.condition.regexFilter).test(original));
    assert.ok(!new RegExp(bypass.condition.regexFilter).test(original + '0'));
    change({ enabled: { newValue: false } }, 'local');
    await flush();
    assert.equal(dynamic.length, 0);
    assert.equal(sessions.size, 0);
});
