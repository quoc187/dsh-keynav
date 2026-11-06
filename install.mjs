#!/usr/bin/env node
/**
 * Link dsh-keynav into a DSH profile and register it as a bundle.
 *
 *   node install.mjs            # install into the web profile
 *   node install.mjs --check    # verify the profile points at this package
 *   node install.mjs --revert   # restore the pre-install package.json
 *
 * Afterwards the profile must be restarted: the bundle list is read at launch,
 * so a page refresh alone does not mount a new plugin.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = process.env.DSH_PROFILE_DIR ?? join(process.env.HOME ?? "", ".dsh/profiles/web");
const MANIFEST = join(PROFILE, "package.json");
const BACKUP = join(HERE, "profile-package.json.bak");
const PACKAGE_NAME = "dsh-keynav";

const args = process.argv.slice(2);
const mode = args.includes("--revert")
  ? "revert"
  : args.includes("--check")
    ? "check"
    : args.includes("--bundle-only")
      ? "bundle"
      : "install";

if (!existsSync(MANIFEST)) {
  console.error(`no profile at ${PROFILE}`);
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const bundles = manifest?.dsh?.profile?.bundles ?? [];
const linked = manifest?.dependencies?.[PACKAGE_NAME];

if (mode === "check") {
  const present = bundles.includes(PACKAGE_NAME);
  console.log(`profile:    ${PROFILE}`);
  console.log(`dependency: ${linked ?? "(missing)"}`);
  console.log(`bundle:     ${present ? "registered" : "(missing)"}`);
  process.exit(linked !== undefined && present ? 0 : 1);
}

if (mode === "revert") {
  if (!existsSync(BACKUP)) {
    console.error(`no backup at ${BACKUP}`);
    process.exit(2);
  }
  copyFileSync(BACKUP, MANIFEST);
  console.log(`restored ${MANIFEST}`);
  console.log("restart the profile to unload the plugin.");
  process.exit(0);
}

if (!existsSync(BACKUP)) copyFileSync(MANIFEST, BACKUP);

if (mode === "install") {
  manifest.dependencies = manifest.dependencies ?? {};
  manifest.dependencies[PACKAGE_NAME] = `link:${HERE}`;
}

manifest.dsh = manifest.dsh ?? {};
manifest.dsh.profile = manifest.dsh.profile ?? {};
const next = manifest.dsh.profile.bundles ?? [];
if (!next.includes(PACKAGE_NAME)) next.push(PACKAGE_NAME);
manifest.dsh.profile.bundles = next;

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
if (mode === "install") console.log(`linked ${PACKAGE_NAME} -> ${HERE}`);
console.log(`registered bundle in ${MANIFEST}`);
console.log(`backup at ${BACKUP}`);
console.log("");
console.log(
  mode === "bundle" ? "next:  restart the profile" : "next:  dsh plugin --profile web install",
);
console.log("then restart the web profile (a page refresh is not enough).");
