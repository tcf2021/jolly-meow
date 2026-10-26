import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

// Meteor wraps npm modules in functions rather than native ES modules. Excalidraw
// uses import.meta.url only to detect its optional font-export worker; disable
// that worker and keep its built-in main-thread fallback for Meteor bundles.
for (const mode of ["prod", "dev"]) {
  const directory = new URL(
    `../node_modules/@excalidraw/excalidraw/dist/${mode}/`,
    import.meta.url,
  );
  for (const name of readdirSync(directory).filter((file) =>
    file.endsWith(".js"),
  )) {
    const file = new URL(name, directory);
    const source = readFileSync(file, "utf8");
    if (source.includes("import.meta.url"))
      writeFileSync(file, source.replaceAll("import.meta.url", "undefined"));
  }
}
const source = new URL(
  "../node_modules/@excalidraw/excalidraw/dist/prod/fonts/",
  import.meta.url,
);
const target = new URL("../public/excalidraw/fonts/", import.meta.url);
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
