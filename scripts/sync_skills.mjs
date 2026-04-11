#!/usr/bin/env node
/**
 * Copy every skill directory from `.skills/` into each agent toolchain `skills/` folder.
 * Each agent `skills/.gitignore` (ignore all except itself) should be created once by hand;
 * this script does not modify it. Run after clone or when `.skills/` changes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const SOURCE = path.join(REPO_ROOT, ".skills");

const DEST_ROOTS = [
  ".agent/skills",
  ".claude/skills",
  ".codex/skills",
  ".cursor/skills",
  ".opencode/skills",
  ".trae/skills",
].map((p) => path.join(REPO_ROOT, p));

function listSkillDirs() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing source directory: ${SOURCE}`);
    process.exit(1);
  }
  return fs
    .readdirSync(SOURCE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
}

/** Remove everything in `dir` except `.gitignore`. */
function clearDirExceptGitignore(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === ".gitignore") continue;
    fs.rmSync(path.join(dir, ent.name), { recursive: true, force: true });
  }
}

function copySkill(skillName, destRoot) {
  const from = path.join(SOURCE, skillName);
  const to = path.join(destRoot, skillName);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

function main() {
  const skills = listSkillDirs();
  if (skills.length === 0) {
    console.warn("No skill directories under .skills");
  }

  for (const dest of DEST_ROOTS) {
    fs.mkdirSync(dest, { recursive: true });
    clearDirExceptGitignore(dest);
    for (const name of skills) {
      copySkill(name, dest);
    }
  }

  console.log(
    `Synced ${skills.length} skill(s) from .skills/ to ${DEST_ROOTS.length} destinations.`,
  );
}

main();
