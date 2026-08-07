export type PackageInstallationStrategy = "standard-npm-install" | "custom-install-packages";

/**
 * npm loads its configuration before running the root preinstall hook, so credentials created
 * or refreshed by that hook are not visible to the active install. Keep the implementation
 * available in case npm starts reloading configuration after preinstall in a future release.
 * See https://github.com/npm/cli/issues/9853.
 */
export const STANDARD_NPM_INSTALL_STRATEGY_ENABLED: boolean = false;

export const DEFAULT_PACKAGE_INSTALLATION_STRATEGY: PackageInstallationStrategy =
  "standard-npm-install";
