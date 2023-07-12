#!/usr/local/bin/zx
//
// CD script for performing atomic deployments.
//
$.verbose = false;

const timestamp = Date.now();
const newReleaseDir = `releases/${timestamp}`;
const appName = __dirname.split("/").at(-1);

const useMigrations = false;
const useBlueGreen = false;

/**
 * @param {"blue"|"green"} color
 */
async function reloadNginx(color) {
  const inverseColor = color === "green" ? "blue" : "green";

  await $`cd /etc/nginx/${appName}/switch && mv ${color} ${inverseColor}`;
  await $`systemctl reload nginx`;
}

/**
 * @param {'start'|'delete'|'restart'|'save'|'id'} action
 * @param {"blue"|"green"} [color]
 */
async function pm2(action, color) {
  const suffix = color ? `-${color}` : "";
  const startArgs =
    action === "start" ? "--wait-ready --listen-timeout 10000" : "";

  return $`sudo -u www-data pm2 ${action} ${appName}${suffix}${startArgs}`;
}

async function blueExists() {
  const blueIds = JSON.parse(`${await pm2("id", "blue")}`);
  return !!blueIds.length;
}

async function switch2Green() {
  await pm2("start", "green");
  await reloadNginx("green");
  await pm2("delete", "blue");
  await pm2("save");
}

async function switch2Blue() {
  await pm2("start", "blue");
  await reloadNginx("blue");
  await pm2("delete", "green");
  await pm2("save");
}

async function cleanUpReleases({ keep = 1 }) {
  const clean = `ls -1 | sort -r | tail -n +${keep + 1} | xargs rm -rf`;
  await $`cd releases && ${clean}`;
}

// Start

echo`Creating release ${timestamp}...`;
await fs.ensureDir(newReleaseDir);
await fs.ensureSymlink("shared/*", newReleaseDir);
await fs.copy("deploy-cache/*", newReleaseDir);

if (useMigrations) {
  echo`Running migrations...`;
  await $`yarn --cwd ${newReleaseDir} migrate:prod`;
}

echo`Updating current symlink...`;
await $`ln -sfrn ${newReleaseDir} current`;

echo`Restating application...`;
if (useBlueGreen) {
  if (blueExists()) {
    await switch2Green();
  } else {
    await switch2Blue();
  }
} else {
  await pm2("restart");
}

echo`Rolling off old releases...`;
cleanUpReleases({ keep: 10 });

echo(chalk.green`Deployment completed successfully`);
