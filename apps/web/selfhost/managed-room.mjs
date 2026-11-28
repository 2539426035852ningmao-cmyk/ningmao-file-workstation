import { once } from "node:events";
import { createRoomServer } from "./server.mjs";

const [directory, quotaArg, portArg] = process.argv.slice(2);
const quota = Number(quotaArg);
const port = Number(portArg);
if (!directory || !Number.isSafeInteger(quota) || quota < 1 || !Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("Invalid managed room arguments");
}

const station = createRoomServer(directory, undefined, quota, { managed: true });
station.listen(port, "127.0.0.1");
try {
  await once(station, "listening");
} catch (error) {
  if (error.code === "EADDRINUSE") process.stdout.write("PORT_IN_USE\n");
  throw error;
}
process.stdin.once("end", () => {
  station.close();
  station.closeAllConnections();
});
process.stdin.resume();
process.stdout.write(`READY ${station.address().port}\n`);
