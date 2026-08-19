const fs =
  require("node:fs");

const path =
  require("node:path");

const CONFIG_FILE =
  path.join(__dirname, "config.json");

function timestamp() {
  return new Date().toISOString().slice(0, 19);
}

function log(...args) {
  console.log(
    `[${timestamp()}]`,
    ...args
  );
}

function error(...args) {
  console.error(
    `[${timestamp()}]`,
    ...args
  );
}

function debug(...args) {
  if (!IS_DEBUG) {
    return;
  }

  log(
    "DEBUG",
    ...args
  );
}

function maskPushUrl(value) {
  try {
    const url =
      new URL(value);

    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";

    const pathParts =
      url.pathname.split("/");

    if (pathParts[pathParts.length - 1]) {
      pathParts[pathParts.length - 1] = "***";
    }

    url.pathname =
      pathParts.join("/");

    return url.toString();
  } catch {
    return "[invalid URL]";
  }
}

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

function getConfigValue(...keys) {
  for (const key of keys) {
    if (config[key] !== undefined) {
      return config[key];
    }
  }

  return undefined;
}

const LOCAL_KUMA =
  getConfigValue("LOCAL_KUMA", "localKuma") ||
  "http://uptime-kuma:3001";

const STATUS_PAGE =
  getConfigValue("STATUS_PAGE", "statusPage") ||
  "cloud-sync";

const INTERVAL =
  Number(
    getConfigValue("INTERVAL", "interval") ||
    30000
  );

const ENVIRONMENT =
  getConfigValue("ENVIRONMENT", "environment") ||
  "production";

const IS_DEBUG =
  String(ENVIRONMENT).toLowerCase() === "debug";

const MONITORS =
  config.MONITORS || config.monitors || {};

debug(
  `Loaded ${Object.keys(MONITORS).length} monitor mapping(s) from ${CONFIG_FILE}`
);


async function getJSON(url) {
  debug(
    `Fetching [${url}]`
  );

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  debug(
    `Fetched [${url}] with HTTP ${res.status}`
  );

  return res.json();
}


async function sync() {
  try {
    debug(
      `Starting relay sync for status page [${STATUS_PAGE}] from [${LOCAL_KUMA}]`
    );

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

    debug(
      `Found ${monitors.length} monitor(s) on status page [${STATUS_PAGE}]`
    );


    for (const monitor of monitors) {
      debug(
        `Checking monitor [${monitor.name}]`
      );

      const cloudPushUrl =
        MONITORS[monitor.name];

      if (!cloudPushUrl) {
        debug(
          `No cloud Push URL configured for [${monitor.name}]`
        );

        log(
          `Skipping ${monitor.name}: no Cloud mapping`
        );
        continue;
      }


      const beats =
        heartbeats.heartbeatList[String(monitor.id)] || [];


      if (!beats.length) {
        debug(
          `No local heartbeat found for [${monitor.name}]`
        );

        log(
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

      debug(
        `Sending heartbeat [${monitor.name}] to [${maskPushUrl(cloudPushUrl)}] with status [${status}]`
      );

      const res =
        await fetch(url, {
          method: "POST"
        });


      if (!res.ok) {
        throw new Error(
          `${monitor.name}: Cloud returned ${res.status}`
        );
      }

      debug(
        `Cloud accepted heartbeat [${monitor.name}] with HTTP ${res.status}`
      );

      log(
        `${monitor.name}: ${status}`
      );
    }

    debug(
      "Relay sync complete"
    );

  } catch (err) {

    /*
      IMPORTANT:

      Do NOT send DOWN here.

      If Local Kuma or this whole server dies,
      heartbeats simply stop.

      Cloud Kuma will detect missing heartbeat.
    */
    error(
      "Sync failed:",
      err
    );
  }
}


sync();

setInterval(
  sync,
  INTERVAL
);
