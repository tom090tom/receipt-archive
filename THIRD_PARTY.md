# Third-party notices

Runtime dependency:

- [PDF.js](https://github.com/mozilla/pdf.js) 6.4.299, Mozilla Foundation, Apache License 2.0. It extracts text from the PDF. This repository does not vendor its source; `npm install` fetches `pdfjs-dist`.

Development-only, used to regenerate the synthetic examples:

- [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1, MIT.
- [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) 1.1.1, MIT.

The examples embed a subset of SimHei from the machine that generated them. Regenerating on Windows uses `C:\Windows\Fonts\simhei.ttf`. The committed PDFs contain no real invoices.
