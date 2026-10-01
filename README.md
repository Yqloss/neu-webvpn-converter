# 东北大学 WebVPN 地址转换

Chrome / Edge Manifest V3 扩展。使用浏览器持久化的 `declarativeNetRequest` 规则，在顶层网页请求发往原站前重定向到扩展本地中转页。中转页完成地址转换后打开目标地址，避免等待原站连接超时。加密库随扩展打包，不从 CDN 加载。

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

## 检查与打包

```powershell
npm test
npm run build
```

产物：`dist/neu-webvpn-converter.zip`。这是可加载的扩展 ZIP，不是签名 CRX。

## 第三方依赖

CryptoJS 4.2.0，MIT 许可证，许可证随扩展保存在 `extension/vendor/LICENSE.crypto-js`。
