# 报销归档

**哪天、付给谁、多少钱。**

把可复制文字的数电发票放进来，核对销售方和价税合计，再按原文件复制进一个 ZIP。面向会计、自由职业者和小团队行政；规则保存在浏览器里，下次直接套用。

发票在本机处理，不上传。识别使用 [PDF.js](https://github.com/mozilla/pdf.js) 6.4.299（Apache-2.0）。MIT 开源。

## 快速开始

需要 Node.js **22.13+**。

```sh
git clone https://github.com/tom090tom/receipt-archive.git
cd receipt-archive
npm install
npm start
```

打开 <http://127.0.0.1:4176>，点击 **加载示例**。示例是合成票据，不能查验，也不能报销。端口占用时使用 `npm start -- --port 4177`。

命令行只打印命名结果，或把原文件复制到目录：

```sh
node bin/receipt-archive.js examples/stationery.pdf examples/coffee.pdf --json
node bin/receipt-archive.js examples/stationery.pdf --out ./out
```

`--out` 不会覆盖已有文件，也不会修改原件。

## 命名

默认规则是 `{date}_{seller}_{amount}`，例如 `2026-03-18_星河文具有限公司_128.50.pdf`。

| 字段 | 含义 |
| --- | --- |
| `{date}` | 开票日期，`YYYY-MM-DD` |
| `{seller}` | 销售方名称。报销时要区分的是付给谁，不是购买方 |
| `{amount}` | 价税合计的小写金额，固定两位小数 |
| `{number}` | 20 位发票号码 |

同一批里文件名撞车时，会自动加上发票号码，并在页面上标明。同一个发票号码不会归档两次。规则可以插在光标处，并只把规则字符串存在这台浏览器。

字段依据是《国家税务总局关于推广应用全面数字化电子发票的公告》（国家税务总局公告 2024 年第 11 号，2024-12-01 起施行）：票面包含发票号码、开票日期、购买方、销售方和价税合计；号码为 20 位，前两位是公历年度后两位。公告原文见 [中国政府网](https://www.gov.cn/zhengce/zhengceku/202411/content_6989164.htm)。这里只核对该结构，不向税务平台查验。

## 边界

- **支持：** 文字层能复制出来的电子发票（普通发票）、电子发票（增值税专用发票）。只读第 1 页。
- **不支持：** 扫描件和拍照件、旧版 8 位发票号码、航空客票、铁路客票、机动车销售统一发票。首版不做 OCR。
- **认不出就停：** 缺销售方、缺价税合计、号码不是 20 位、号码年份和开票日期不一致，或合计附近有两个不同金额时，不生成文件名。
- **规模：** 最多 20 个文件，单个 8 MiB，合计 40 MiB。
- **文件：** ZIP 使用 STORE，里面是原字节。重新编码不在范围内。
- **浏览器文件夹：** 只有提供目录写入接口的浏览器才能“保存到文件夹”；其他浏览器使用 ZIP。

销售方和购买方靠票面左右位置区分。文字层如果把两栏挤成无法分开的一段，这张票会被拒绝或需要你核对预览。不同开票软件的文字顺序并不统一，预览是归档前的必要步骤。

## 开发

```sh
npm test
npm run check
```

| 文件 | 职责 |
| --- | --- |
| `src/invoice.js` | 从文字坐标读取号码、日期、销售方和价税合计 |
| `src/filename.js` | 校验命名规则并生成安全文件名 |
| `src/plan.js` | 处理重名和重复发票号码 |
| `src/zip.js` | UTF-8 ZIP STORE |
| `src/pdf-text.js` | 命令行使用 PDF.js 读取第 1 页 |
| `web/` | 本机预览、规则保存、ZIP 和文件夹复制 |
| `bin/server.js` | 只在回环地址提供固定资源 |

`npm run examples` 会用本机的 `C:\Windows\Fonts\simhei.ttf` 重写合成示例，只在 Windows 上验证过。

CI 尚未启用。模板在 [docs/ci-template.yml](docs/ci-template.yml)，现有推送凭据没有 GitHub `workflow` 权限，本地测试不算 CI 通过。

## 安全与许可

版本 `0.1.0`。请阅读 [安全边界](SECURITY.md)、[使用与免责说明](DISCLAIMER.md)、[贡献规范](CONTRIBUTING.md)、[变更记录](CHANGELOG.md) 和 [第三方许可](THIRD_PARTY.md)。`package.json` 的 `private: true` 只阻止误发布到 npm。

请勿把真实发票放进 Issue、PR 或示例目录。
