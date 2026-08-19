const fs =
  require("node:fs");

const path =
  require("node:path");

const LOCAL_KUMA =
  process.env.LOCAL_KUMA || "http://uptime-kuma:3001";

const STATUS_PAGE =
  process.env.STATUS_PAGE || "cloud-sync";

const INTERVAL =
  Number(process.env.INTERVAL || 30000);

const CONFIG_FILE =
  process.env.CONFIG_FILE ||
  path.join(__dirname, "config.json");

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }

  const rawConfig =
    fs.readFileSync(CONFIG_FILE, "utf8").trim();

  if (!rawConfig) {
    return {};
  }

  return JSON.parse(rawConfig);
}

const config =
  readConfig();

const MONITORS =
  config.MONITORS || config.monitors || {};


async function getJSON(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  return res.json();
}


async function sync() {
  try {
    const [page, heartbeats] = await Promise.all([
      getJSON(
        `${LOCAL_KUMA}/api/status-page/${STATUS_PAGE}`
      ),

      getJSON(
        `${LOCAL_KUMA}/api/status-page/heartbeat/${STATUS_PAGE}`
      )
    ]);

    const monitors =
      page.publicGroupList
        .flatMap(group => group.monitorList);


    for (const monitor of monitors) {

      const cloudPushUrl =
        MONITORS[monitor.name];

      if (!cloudPushUrl) {
        console.log(
          `Skipping ${monitor.name}: no Cloud mapping`
        );
        continue;
      }


      const beats =
        heartbeats.heartbeatList[String(monitor.id)] || [];


      if (!beats.length) {
        console.log(
          `No heartbeat for ${monitor.name}`
        );
        continue;
      }


      // Find newest heartbeat
      const latest =
        beats.reduce((a, b) =>
          new Date(a.time) > new Date(b.time)
            ? a
            : b
        );


      /*
        Local Kuma status:

        0 = DOWN
        1 = UP
        2 = PENDING
        3 = MAINTENANCE
      */

      let status = "up";

      if (latest.status === 0) {
        status = "down";
      }


      let msg = latest.msg || "OK";

      if (latest.status === 2) {
        msg = `Local check pending: ${msg}`;
      }

      if (latest.status === 3) {
        msg = `Local maintenance: ${msg}`;
      }


      const url =
        new URL(cloudPushUrl);

      url.searchParams.set(
        "status",
        status
      );

      url.searchParams.set(
        "msg",
        msg.substring(0, 200)
      );

      if (latest.ping !== null &&
          latest.ping !== undefined) {
        url.searchParams.set(
          "ping",
          String(latest.ping)
        );
      }


      const res =
        await fetch(url, {
          method: "POST"
        });


      if (!res.ok) {
        throw new Error(
          `${monitor.name}: Cloud returned ${res.status}`
        );
      }


      console.log(
        `${monitor.name}: ${status}`
      );
    }

  } catch (err) {

    /*
      IMPORTANT:

      Do NOT send DOWN here.

      If Local Kuma or this whole server dies,
      heartbeats simply stop.

      Cloud Kuma will detect missing heartbeat.
    */

    console.error(
      "Sync failed:",
      err.message
    );
  }
}


sync();

setInterval(
  sync,
  INTERVAL
);
