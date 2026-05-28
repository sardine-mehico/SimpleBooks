// Jest stub for @react-pdf/renderer — the package ships ESM-only and cannot
// be required in Jest's CommonJS runtime. Specs that don't exercise PDF
// rendering import this stub instead via moduleNameMapper in jest.config.cjs.
module.exports = {
  renderToBuffer: jest.fn(async () => Buffer.alloc(0)),
  Document: () => null,
  Page: () => null,
  View: () => null,
  Text: () => null,
  Image: () => null,
  StyleSheet: { create: (s) => s },
  Font: { register: () => {} },
};
