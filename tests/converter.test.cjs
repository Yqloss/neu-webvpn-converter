const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const CryptoJS = require('../extension/vendor/crypto-js.min.js');
const context = { URL, CryptoJS };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/converter.js'), 'utf8'), context);
const { convert, DEFAULTS } = context.WebVpnConverter;
const prefix = 'https://webvpn.neu.edu.cn/https/';
const ojHex = '62304135386136393339346365373340bfebea318fd008d8f60d257088';
const personalHex = '62304135386136393339346365373340a0e4b62c85cb47d1bc166e66c800d19283ef83';
const direct = { ...DEFAULTS, mode: 'to-direct' };

test('已知 OJ 地址向量，保留查询参数和锚点', () => {
    assert.equal(convert('https://oj.neu.edu.cn/contest/160/problems?a=1#x'), prefix + ojHex + '/contest/160/problems?a=1#x');
    assert.equal(convert(prefix + ojHex + '/contest/160/problems?a=1#x', direct), 'https://oj.neu.edu.cn/contest/160/problems?a=1#x');
});
test('长域名跨 AES 分组，匹配已知 portal 地址', () => {
    assert.equal(convert('https://personal.neu.edu.cn/portal/'), prefix + personalHex + '/portal/');
    assert.equal(convert(prefix + personalHex + '/portal/', direct), 'https://personal.neu.edu.cn/portal/');
});
test('默认范围与四个排除域名，以及伪装域名', () => {
    for (const host of ['ipgw.neu.edu.cn', 'webvpn.neu.edu.cn', 'neu.edu.cn', 'www.neu.edu.cn', 'evilneu.edu.cn', 'oj.neu.edu.cn.evil.com']) {
        assert.equal(convert('https://' + host + '/'), null, host);
        assert.equal(convert('http://' + host + ':8080/a'), null, host);
    }
    assert.ok(convert('https://a.b.neu.edu.cn/'));
    assert.ok(convert('HTTPS://OJ.NEU.EDU.CN/'));
    assert.ok(convert('http://www.oj.neu.edu.cn/a'));
});
test('自定义正则作用于完整 URL；无效正则不跳转；WebVPN 不被重复包装', () => {
    const settings = { ...DEFAULTS, regex: String.raw`^https://oj\.neu\.edu\.cn/contest/160(?:/|$)` };
    assert.ok(convert('https://oj.neu.edu.cn/contest/160/problems', settings));
    assert.equal(convert('https://oj.neu.edu.cn/contest/161/problems', settings), null);
    assert.equal(convert('https://oj.neu.edu.cn/', { ...DEFAULTS, regex: '[' }), null);
    assert.equal(convert(prefix + ojHex + '/', { ...DEFAULTS, regex: '.*' }), null);
    assert.equal(convert('https://oj.neu.edu.cn/', { ...DEFAULTS, enabled: false }), null);
});
test('普通网址模式忽略正则，可还原代理外部网站的链接', () => {
    const googleHex = '62304135386136393339346365373340a7f6b3718dca49dafe1d25708908';
    assert.equal(convert(prefix + googleHex + '/', { ...direct, regex: '[' }), 'https://www.google.com/');
    assert.equal(convert('https://oj.neu.edu.cn/', direct), null);
    assert.equal(convert('https://webvpn.neu.edu.cn/login', direct), null);
    assert.equal(convert('https://webvpn.neu.edu.cn/https/00/', direct), null);
});
test('HTTP 和非默认端口保留，与 Node 原生 AES-CFB 独立结果一致', () => {
    const key = Buffer.from('b0A58a69394ce73@');
    const cipher = crypto.createCipheriv('aes-128-cfb', key, key);
    const encrypted = Buffer.concat([cipher.update('oj.neu.edu.cn', 'utf8'), cipher.final()]);
    const expected = 'https://webvpn.neu.edu.cn/http-8080/' + key.toString('hex') + encrypted.toString('hex') + '/a?q=2#h';
    assert.equal(convert('http://oj.neu.edu.cn:8080/a?q=2#h'), expected);
    assert.equal(convert(expected, direct), 'http://oj.neu.edu.cn:8080/a?q=2#h');
});
test('嵌套十层可逐层还原；无效数据保持原样', () => {
    const outer = '62304135386136393339346365373340a7e4a6299acb08d3f70d257682109b84dc';
    let url = prefix + (outer + '/https/').repeat(10) + ojHex + '/';
    for (let i = 0; i < 11; i++) url = convert(url, direct);
    assert.equal(url, 'https://oj.neu.edu.cn/');
    assert.equal(convert(prefix + '00'.repeat(35) + '/', direct), null);
    assert.equal(convert('chrome://extensions/', DEFAULTS), null);
});
