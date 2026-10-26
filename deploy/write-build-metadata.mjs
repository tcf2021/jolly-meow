/* oxlint-disable no-console -- command-line utilities report results to the operator */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const config = JSON.parse(
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "--entrypoint",
      "node",
      "studio-jollymeow:local",
      "-e",
      "console.log(JSON.stringify(require('./star.json')))",
    ],
    { encoding: "utf8" },
  ),
);
config.gitCommitHash = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
writeFileSync(
  new URL("./meteor-star.json", import.meta.url),
  `${JSON.stringify(config, null, 2)}\n`,
);
console.log(`Build metadata written for ${config.gitCommitHash}`);
