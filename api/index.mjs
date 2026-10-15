import { createApplication } from "../server/app.mjs";
import { nodeResponse } from "../server/node-adapter.mjs";
const handle = createApplication({
  log: (item) => console.info("partner_demo", JSON.stringify(item)),
});
export default async function handler(req, res) {
  await nodeResponse(req, res, handle);
}
