const { withAppBuildGradle } = require('expo/config-plugins');
const START = '// BEGIN UNISAFE RELEASE SIGNING';
const END = '// END UNISAFE RELEASE SIGNING';
const block = `${START}
// EAS may supply its own signing config. Local releases require the existing
// production key through environment variables; never fall back to debug.
def unisafeSigning = ['STORE_FILE', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']
    .collectEntries { name -> [(name): System.getenv('UNISAFE_RELEASE_' + name)] }
if (unisafeSigning.values().every { it }) {
    android.signingConfigs.create('unisafeRelease') {
        storeFile file(unisafeSigning.STORE_FILE)
        storePassword unisafeSigning.STORE_PASSWORD
        keyAlias unisafeSigning.KEY_ALIAS
        keyPassword unisafeSigning.KEY_PASSWORD
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.unisafeRelease
}
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.project == project && it.name.toLowerCase().contains('release') }) {
        def signing = android.buildTypes.release.signingConfig
        if (!signing || signing == android.signingConfigs.debug ||
            signing.keyAlias?.toLowerCase() == 'androiddebugkey' ||
            !signing.storeFile?.isFile()) {
            throw new GradleException('Release signing required. Configure an EAS production key or all four UNISAFE_RELEASE_* environment variables. Debug signing is forbidden.')
        }
    }
}
${END}`;
function configureReleaseSigning(contents) {
  const start = contents.indexOf(START);
  if (start !== -1) {
    const end = contents.indexOf(END, start);
    if (end === -1) throw new Error('Incomplete UniSafe release signing block');
    contents = contents.slice(0, start) + contents.slice(end + END.length);
  }
  return contents.trimEnd() + '\n\n' + block + '\n';
}
module.exports = config => withAppBuildGradle(config, mod => {
  if (mod.modResults.language !== 'groovy') throw new Error('UniSafe signing requires a Groovy app build.gradle');
  mod.modResults.contents = configureReleaseSigning(mod.modResults.contents);
  return mod;
});
module.exports.configureReleaseSigning = configureReleaseSigning;
