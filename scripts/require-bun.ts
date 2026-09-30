// `preinstall` guard. A Bun older than `engines.bun` cannot read bun.lock: it prints "Ignoring lockfile",
// re-resolves every dependency to newer versions and rewrites bun.lock, all before this script runs.
// Fail the install and put the committed lockfile back, so nobody installs or commits a drifted tree.
import rootPackage from '../package.json' with { type: 'json' };

// The Bun running `bun install` (the one that touches bun.lock), not whichever `bun` PATH resolved for this script.
const installer = /^bun\/(\S+)/.exec(process.env.npm_config_user_agent ?? '')?.[1] ?? Bun.version;

if (!Bun.semver.satisfies(installer, rootPackage.engines.bun)) {
  const pinned = rootPackage.packageManager.replace(/^bun@/, '');
  const restored = Bun.spawnSync(['git', 'checkout', '--', 'bun.lock'], { cwd: `${import.meta.dir}/..` }).exitCode === 0;
  console.error(
    [
      '',
      `Bun ${rootPackage.engines.bun} is required (running ${installer}).`,
      `Install the pinned version, then run \`bun install\` again:`,
      `  curl -fsSL https://bun.sh/install | bash -s -- bun-v${pinned}`,
      restored ? 'bun.lock was restored to the committed version.' : 'Restore the committed lockfile with `git checkout -- bun.lock`.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
