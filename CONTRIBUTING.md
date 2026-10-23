# 贡献

问题先写清楚：哪一种发票、期望文件名、实际结果。不要附上真实发票、税号、金额或客户名称；用合成 PDF 即可。

- Node.js 22.13 或更新版本。
- 改行为前先加会失败的测试，再改 `src/`。
- `npm test` 和 `npm run check` 需要通过。
- 提交说明使用约定式提交。一个改动只解决一件事。
- 首版不做 OCR，也不要加入上传接口。

示例可用 `npm run examples` 在安装了 `pdf-lib` 的 Windows 上重生成。它读取 `C:\Windows\Fonts\simhei.ttf`。
