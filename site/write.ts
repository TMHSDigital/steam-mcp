import { writeFileSync } from "node:fs";
import { renderSite } from "./build.js";

// `npm run site`: regenerate the GitHub Pages files in docs/.
for (const [file, content] of Object.entries(renderSite())) {
  writeFileSync(new URL(`../docs/${file}`, import.meta.url), content, "utf8");
  console.log(`docs/${file}`);
}
