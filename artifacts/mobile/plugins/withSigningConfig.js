const { withXcodeProject } = require("@expo/config-plugins");

/**
 * Fixes the signing settings the Expo iOS template writes, at the config source.
 *
 * WHAT THIS DOES. The Expo iOS template writes, at PROJECT level, for BOTH
 * configurations including Release:
 *
 *   "CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Developer";
 *
 * and never writes CODE_SIGN_STYLE at all. This plugin sets the style to
 * Automatic and removes the pinned identity, which is the combination Xcode
 * expects: with automatic signing it resolves the identity itself from the
 * build action, and any explicitly specified value is treated as a manual
 * override that conflicts with that resolution.
 *
 * WHAT THIS DOES NOT FIX, so nobody re-litigates it here. Archiving also failed
 * with "Your team has no devices from which to generate a provisioning
 * profile". That is not a build-settings problem: an automatic archive is
 * signed for DEVELOPMENT (the distribution certificate is applied later, when
 * the archive is exported via Distribute App), and Apple would not mint a
 * development profile for a team with zero registered devices. The fix for that
 * is registering one device on the team, not anything in this file. An earlier
 * revision of this plugin tried to route around it by pinning the Release
 * identity to "Apple Distribution", which produced the conflicting-settings
 * error instead -- masking the real blocker rather than removing it.
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

      // Automatic on both, so Xcode provisions rather than demanding a
      // hand-managed profile.
      settings.CODE_SIGN_STYLE = "Automatic";

      // REMOVE the pinned identity rather than replace it. Under automatic
      // signing Xcode decides the identity itself from the build action, and an
      // explicitly specified one is treated as a MANUAL override that
      // contradicts it -- "Summit is automatically signed for development, but a
      // conflicting code signing identity Apple Distribution has been manually
      // specified."
      //
      // Setting it to "Apple Distribution" for Release looks right and is not:
      // an automatic archive is signed for DEVELOPMENT, and the distribution
      // certificate is applied later, when the archive is exported through
      // Distribute App. There is no point in the flow where the build itself
      // should carry a distribution identity.
      delete settings['"CODE_SIGN_IDENTITY[sdk=iphoneos*]"'];
      delete settings["CODE_SIGN_IDENTITY[sdk=iphoneos*]"];
      delete settings.CODE_SIGN_IDENTITY;
    }

    return cfg;
  });
};
