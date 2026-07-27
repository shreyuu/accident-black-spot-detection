/**
 * Jest stand-in for `@firebase/util/dist/postinstall.mjs`.
 *
 * That file is ESM (`export { ... }`) and Jest's CommonJS runtime cannot parse
 * it, which makes any `import` from `firebase/*` fail in a test with
 * "Unexpected token 'export'". It is reached from
 * `@firebase/util/dist/index.esm.js`, so it affects every Firebase import.
 *
 * The real implementation, in full, is:
 *
 *     const getDefaultsFromPostinstall = () => (undefined);
 *
 * It exists so a build step can inject Firebase config discovered at install
 * time; nothing injects anything here, so `undefined` is also the production
 * behaviour. This stub is therefore faithful rather than a convenient fiction.
 *
 * Redirecting to the package's own `postinstall.js` CJS sibling would be
 * marginally more direct, but `@firebase/util`'s `exports` map does not expose
 * that path, so Jest cannot resolve it.
 *
 * Wired up by the `moduleNameMapper` entry in jest.config.js.
 */
exports.getDefaultsFromPostinstall = () => undefined;
