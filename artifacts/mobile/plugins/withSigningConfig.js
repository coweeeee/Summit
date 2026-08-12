const { withXcodeProject } = require("@expo/config-plugins");

/**
 * Fixes the signing settings the Expo iOS template writes, at the config source.
 *
 * THE BUG THIS EXISTS FOR. The template writes, at PROJECT level, for BOTH
 * configurations including Release:
 *
 *   "CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Developer";
 *
 * and never writes CODE_SIGN_STYLE at all. "iPhone Developer" is the legacy
 * name for an Apple *Development* certificate. With that pinned on Release,
 * Product > Archive asks Apple to provision a DEVELOPMENT profile rather than a
 * distribution one -- and development profiles are tied to registered device
 * UDIDs, which is why an archive on a team with no registered devices fails
 * with "Your team has no devices from which to generate a provisioning
 * profile", followed by "No profiles for 'com.coweeeee.summit' were found".
 * Both errors are downstream of asking for the wrong profile type.
 *
 * Setting CODE_SIGN_STYLE explicitly also covers the other candidate cause: with
 * it unset, whether Xcode treats signing as Automatic is left to defaults, and
 * `xcodebuild` reported "Automatic signing is disabled" on the CLI attempt.
 * Writing both makes the fix correct regardless of which of the two it was.
 *
 * WHY A PLUGIN AND NOT THE XCODE UI. ios/ is gitignored and regenerated: every
 * `expo prebuild` rewrites project.pbxproj from the template, so anything set
 * in Signing & Capabilities is silently discarded on the next prebuild. That
 * already happened once on this project with DEVELOPMENT_TEAM, which is why
 * that value now lives in app.json as ios.appleTeamId. Expo has no first-class
 * app.json field for these two settings, so this is the durable equivalent.
 */
module.exports = function withSigningConfig(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const sections = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(sections)) {
      const entry = sections[key];
      // Comment keys (`<uuid>_comment`) sit alongside the real entries.
      if (!entry || typeof entry !== "object" || !entry.buildSettings) continue;

      const settings = entry.buildSettings;
      const isRelease = entry.name === "Release";

      // Automatic on both, so Xcode provisions rather than demanding a
      // hand-managed profile.
      settings.CODE_SIGN_STYLE = "Automatic";

      // Only rewrite the identity where the template actually pinned one --
      // adding it to configurations that never had it would be a change this
      // plugin has no reason to make.
      if ('"CODE_SIGN_IDENTITY[sdk=iphoneos*]"' in settings) {
        settings['"CODE_SIGN_IDENTITY[sdk=iphoneos*]"'] = isRelease
          ? '"Apple Distribution"'
          : '"Apple Development"';
      }
      if ("CODE_SIGN_IDENTITY[sdk=iphoneos*]" in settings) {
        settings["CODE_SIGN_IDENTITY[sdk=iphoneos*]"] = isRelease
          ? '"Apple Distribution"'
          : '"Apple Development"';
      }
    }

    return cfg;
  });
};
