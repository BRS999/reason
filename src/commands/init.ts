import { initStore } from "../db/store.ts";

export async function init() {
  await initStore();
  console.log("Initialized reasoning repository in .reason/");
}
