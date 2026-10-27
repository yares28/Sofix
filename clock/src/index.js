import timetable from "../timetable.json";
import { tick } from "./clock.js";

export default {
  async scheduled(controller, env) {
    // The lines show in the Worker's logs on Cloudflare's dashboard.
    for (const line of await tick(timetable, env, new Date(controller.scheduledTime))) console.log(line);
  },
};
