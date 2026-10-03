// Fills the LOCAL dev store (.data/dev-store.json) with ~75 days of made-up
// check-ins so you can see the charts and insights working. It only ever writes
// to that local file, never to a real database.
//
//   npm run seed

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEV_STORE_PATH } from "../lib/store";
import { addDays, logicalToday } from "../lib/dates";
import { generateDemoEntries } from "./demo-data";

async function main() {
  const entries = generateDemoEntries(addDays(logicalToday(), -1), 75);
  await mkdir(path.dirname(DEV_STORE_PATH), { recursive: true });
  await writeFile(DEV_STORE_PATH, JSON.stringify({ entries, failures: [] }, null, 2));
  console.log(`Wrote ${entries.length} demo check-ins to ${path.relative(process.cwd(), DEV_STORE_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
