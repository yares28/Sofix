import timetable from "../timetable.json";
import { tick } from "./clock.js";
import { watch } from "./watch.js";

export default {
  async scheduled(controller, env) {
    const now = new Date(controller.scheduledTime);
    // The lines show in the Worker's logs on Cloudflare's dashboard.
    for (const line of await tick(timetable, env, now)) console.log(line);
    for (const line of await watch(timetable, env, now)) console.log(line);
  },
};
