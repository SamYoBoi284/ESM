// ===========================================
// scripts/tag-release.js
// ===========================================
// Runs automatically before `npm run dist` (see package.json's "predist").
//
// electron-builder is configured with publish.releaseType: "release", i.e.
// it publishes a live (non-draft) GitHub Release in one shot. GitHub's API
// rejects that unless the git tag it's publishing against already exists —
// otherwise you get a 422 "Published releases must have a valid tag" error.
// This script makes sure the tag exists (and is pushed) before
// electron-builder ever talks to GitHub, so that error can't happen.
//
// Safe to run repeatedly: if the tag already exists locally and/or on the
// remote (e.g. you're rebuilding the same version), it just skips that step
// instead of failing the whole build.

const { execSync } = require("child_process");
const path = require("path");

const pkg = require(path.join(__dirname, "..", "package.json"));
const tag = `v${pkg.version}`;

function run(cmd) {
    return execSync(cmd, { stdio: "pipe" }).toString().trim();
}

function tagExistsLocally(tag) {
    try {
        run(`git rev-parse -q --verify refs/tags/${tag}`);
        return true;
    } catch {
        return false;
    }
}

function tagExistsOnRemote(tag) {
    try {
        const out = run(`git ls-remote --tags origin refs/tags/${tag}`);
        return out.length > 0;
    } catch {
        return false;
    }
}

try {
    if (!tagExistsLocally(tag)) {
        console.log(`[tag-release] Creating tag ${tag}...`);
        run(`git tag ${tag}`);
    } else {
        console.log(`[tag-release] Tag ${tag} already exists locally.`);
    }

    if (!tagExistsOnRemote(tag)) {
        console.log(`[tag-release] Pushing tag ${tag} to origin...`);
        run(`git push origin ${tag}`);
    } else {
        console.log(`[tag-release] Tag ${tag} already exists on origin.`);
    }

    console.log(`[tag-release] Ready — ${tag} exists locally and on origin.`);
} catch (err) {
    console.error("[tag-release] Failed to create/push tag:", err.message || err);
    console.error("[tag-release] Bump \"version\" in package.json if this version was already released.");
    process.exit(1);
}
