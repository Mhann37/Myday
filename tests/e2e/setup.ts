import { rm } from "node:fs/promises";
import path from "node:path";

export default async function setup() {
  // This fixed path belongs exclusively to the local browser test server.
  await rm(path.resolve(".data/e2e-store.json"), { force: true });
}
