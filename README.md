# 东北大学 WebVPN 地址转换

Chrome / Edge Manifest V3 扩展。监听顶层页面的 `webNavigation.onBeforeNavigate`，不依赖目标网站返回网页，因此原站连接失败时也能触发转换。加密库随扩展打包，不从 CDN 加载。

## 安装

1. 将 `dist/neu-webvpn-converter.zip` 解压到一个长期保留的文件夹。
2. Chrome 打开 `chrome://extensions/`；Edge 打开 `edge://extensions/`。
3. 开启“开发者模式”，点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的文件夹。
4. 停用此前的油猴自动转换脚本，避免两种模式之间来回跳转。
5. 点击扩展图标修改设置。修改后自动保存，下次导航或刷新生效。正则无效时显示提示，保留上一次有效正则；恢复默认正则也会自动保存。

开发时也可以直接加载本项目的 `extension` 文件夹。扩展无须联网下载依赖，无须 npm install。

## 设置

- **符合正则的网址 → WebVPN**：正则匹配整个 URL，忽略大小写，不填写 `/.../` 分隔符。默认匹配 `*.neu.edu.cn`，排除 `ipgw.neu.edu.cn`、`webvpn.neu.edu.cn`、`neu.edu.cn`、`www.neu.edu.cn`。无论自定义正则如何，都不会再次包装 WebVPN 域名，以免循环。
- **所有东北大学 WebVPN 链接 → 普通网址**：不使用正则。还原 `webvpn.neu.edu.cn` 上可识别的编码链接，包括代理外部网站的链接；登录页等没有编码地址的页面保持原样。嵌套链接逐层还原。
- **启用自动转换**：可暂时关闭扩展的转换功能。

保留协议、端口、路径、查询参数和锚点；非默认端口按 `/https-端口/` 或 `/http-端口/` 编码。采用此学校已验证的 AES-128-CFB 地址规则，密钥为 `b0A58a69394ce73@`，编码时 IV 相同。

导航事件比页面脚本更早，不必等待页面加载。不过 `onBeforeNavigate` 不是阻断式网络拦截 API，不能保证原站绝对不会发出任何初始请求。转换只处理顶层页面，不改写 iframe、图片、XHR 等资源请求。已经打开的页面不会仅因保存设置而立即跳转。

## 检查与打包

```powershell
npm test
npm run build
```

产物：`dist/neu-webvpn-converter.zip`。这是可加载的扩展 ZIP，不是签名 CRX。

## 第三方依赖

CryptoJS 4.2.0，MIT 许可证，许可证随扩展保存在 `extension/vendor/LICENSE.crypto-js`。
