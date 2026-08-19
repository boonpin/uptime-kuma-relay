# Uptime Kuma Relay

Relay local Uptime Kuma status-page heartbeats to Uptime Kuma Push monitors in a
cloud instance.

This is useful when a private/local Uptime Kuma instance can see internal
services, but you want an external Uptime Kuma instance to alert if those local
checks fail or stop reporting.

## How It Works

The relay polls a local Uptime Kuma status page and reads the latest heartbeat
for each monitor on that page. For monitors configured in `config.json`, it
sends a `POST` request to the matching cloud Push monitor URL with:

- `status=up` or `status=down`
- `msg` from the latest local heartbeat
- `ping` when the local heartbeat includes one

If the relay cannot reach local Uptime Kuma, it does not send `down`. Heartbeats
simply stop, allowing the cloud Push monitor to detect the missing heartbeat.

## Requirements

- Node.js 22 or newer for the built-in `fetch` API
- A local Uptime Kuma instance
- A local Uptime Kuma status page that includes the monitors you want to relay
- A cloud Uptime Kuma Push monitor for each relayed monitor

## Configuration

Create a `config.json` file in the project root:

```json
{
  "MONITORS": {
    "Local Monitor Name": "https://cloud-kuma.example.com/api/push/YOUR_PUSH_TOKEN",
    "Another Monitor": "https://cloud-kuma.example.com/api/push/ANOTHER_PUSH_TOKEN"
  }
}
```

The keys must exactly match the monitor names shown on the local Uptime Kuma
status page. The values are the Push URLs from the cloud Uptime Kuma instance.

`config.json` is gitignored because Push URLs contain secret tokens.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `LOCAL_KUMA` | `http://uptime-kuma:3001` | Base URL for the local Uptime Kuma instance. |
| `STATUS_PAGE` | `cloud-sync` | Local status-page slug to poll. |
| `INTERVAL` | `30000` | Poll interval in milliseconds. |
| `CONFIG_FILE` | `./config.json` | Path to the monitor mapping file. |

## Run With Docker Compose

Create `config.json`, then start both Uptime Kuma and the relay:

```sh
docker compose up -d --build
```

The included compose file starts:

- `uptime-kuma` on `http://localhost:3001`
- `kuma-relay`, connected to Uptime Kuma over the Docker network

The relay uses the `cloud-sync` status-page slug by default. If your status page
uses a different slug, update `STATUS_PAGE` in `docker-compose.yml`.

## Run Locally

```sh
LOCAL_KUMA=http://localhost:3001 \
STATUS_PAGE=cloud-sync \
INTERVAL=30000 \
CONFIG_FILE=./config.json \
node index.js
```

No npm dependencies are required.

## Status Mapping

Local Uptime Kuma statuses are handled as follows:

| Local status | Relay status | Message |
| --- | --- | --- |
| `0` DOWN | `down` | Local heartbeat message |
| `1` UP | `up` | Local heartbeat message |
| `2` PENDING | `up` | Prefixed with `Local check pending:` |
| `3` MAINTENANCE | `up` | Prefixed with `Local maintenance:` |

## Setup Checklist

1. Create Push monitors in the cloud Uptime Kuma instance.
2. Create or choose a status page in the local Uptime Kuma instance.
3. Add the local monitors you want to relay to that status page.
4. Add each local monitor name and cloud Push URL to `config.json`.
5. Start the relay.
6. Check the relay logs for lines like `Monitor Name: up`.

## Troubleshooting

- `Skipping <name>: no Cloud mapping`: add that exact monitor name to
  `config.json`, or leave it unmapped if you do not want to relay it.
- `No heartbeat for <name>`: wait for the local monitor to produce a heartbeat,
  and confirm it appears on the configured status page.
- `Sync failed: 404 Not Found`: confirm `LOCAL_KUMA` and `STATUS_PAGE`.
- Cloud monitor shows down even though local is up: confirm the cloud Push URL is
  correct and that the cloud Push monitor heartbeat interval is longer than
  `INTERVAL`.
