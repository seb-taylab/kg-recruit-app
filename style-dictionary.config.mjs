/**
 * Style Dictionary 4.x config — KG Recruit App
 *
 * Source: /lib/design/tokens.json (W3C Design Tokens spec)
 * Outputs:
 *   - /lib/design/tokens.css   (CSS custom properties scoped to [data-theme])
 *   - /lib/design/tokens.ts    (ES module exports for runtime imports)
 *   - /lib/design/tokens.d.ts  (TypeScript declarations for autocomplete)
 *
 * See `KG_DesignSystem_LibraryArchitecture.md` Section 1.
 */
const config = {
  source: ['lib/design/tokens.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'lib/design/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          options: { outputReferences: true, selector: ":root, [data-theme='light']" },
        },
      ],
    },
    ts: {
      transformGroup: 'js',
      buildPath: 'lib/design/',
      files: [
        { destination: 'tokens.ts', format: 'javascript/es6' },
        { destination: 'tokens.d.ts', format: 'typescript/es6-declarations' },
      ],
    },
  },
};

export default config;
