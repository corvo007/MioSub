const fs = require('fs');
const path = require('path');

/**
 * electron-builder afterPack hook
 * Writes distribution mode to a JSON file in resources directory.
 * Default is "installed" - afterAllArtifactBuild will change ZIP to "portable".
 */
exports.default = async function (context) {
  const configPath = path.join(context.appOutDir, 'resources', 'distribution.json');

  const config = {
    mode: 'installed', // Default to installed, ZIP will be patched to portable
    buildTime: new Date().toISOString(),
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Distribution mode: ${config.mode} (written to resources/distribution.json)`);
};
