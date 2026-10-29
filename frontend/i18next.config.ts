import { defineConfig } from 'i18next-cli'

// i18next-cli auto-detects this file (i18next.config.{ts,js,mjs,cjs} at the frontend root).
// Mapping from the retired JSON config: locales, input globs + !src/i18n/** -> extract.ignore,
// $LOCALE/$NAMESPACE -> {{language}}/{{namespace}}, defaultNamespace -> extract.defaultNS,
// namespaceSeparator -> nsSeparator, sort, indentation, defaultValue, keySeparator,
// pluralSeparator. lexers are gone (SWC parses TS/TSX natively).
export default defineConfig({
  locales: ['en', 'uk', 'pl'],
  extract: {
    input: [
      'src/pages/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/contexts/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
      'src/utils/**/*.{ts,tsx}',
    ],
    ignore: ['src/i18n/**'],
    output: 'src/i18n/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'common',
    defaultValue: '',
    indentation: 2,
    sort: true,
    keySeparator: '.',
    nsSeparator: ':',
    pluralSeparator: '_',
    // keepRemoved:true in the retired config inverted: the tool default (true) would DELETE keys
    // the extractor cannot see. Catalogs are hand-authored (docs/i18n.md); extraction is an
    // append-only assist, never a remover.
    removeUnusedKeys: false,
    // the old extractor never extracted from comments; the tool default (true) would inject
    // phantom keys from docblock t() examples.
    extractFromComments: false,
  },
})
