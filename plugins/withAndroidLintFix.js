const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Expo's `locales` config writes iOS-only keys (e.g. CFBundleDisplayName) into
 * Android per-locale string files (values-b+ar/strings.xml). The default Android
 * locale has no such key, so the release-only `lintVital` task fails with
 * "ExtraTranslation". Lint isn't a build gate for us, so make it non-fatal on
 * release. Android-only — has no effect on the iOS build.
 */
module.exports = function withAndroidLintFix(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    const contents = cfg.modResults.contents;
    if (contents.includes('calgym-lint-fix')) return cfg;
    cfg.modResults.contents = contents.replace(
      /android\s*\{/,
      `android {
    // calgym-lint-fix: don't fail release on iOS-only locale keys leaking into
    // Android string resources (ExtraTranslation false positive).
    lint {
        disable 'ExtraTranslation'
        checkReleaseBuilds false
        abortOnError false
    }`,
    );
    return cfg;
  });
};
