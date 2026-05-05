# Network Bind Addresses (`0.0.0.0` vs `127.0.0.1` vs specific IP)

**Last updated:** 2026-05-05 - first encountered while deploying Tasklog to a phone home-server.

## Mental model

When a server process "listens", it picks which **network interface(s)** to accept connections on. Think of network interfaces as separate doors into a machine: each one corresponds to one way packets can reach the process. Binding picks which doors get a doorman.

## Why it exists

A typical machine has multiple network interfaces:
- **Loopback** (`127.0.0.1`, also called `localhost`): a software-only interface. Only processes on the same machine can use it.
- **Physical adapters** (wifi, ethernet, USB tethering): each has its own IP, possibly multiple if connected to multiple networks.
- **Virtual interfaces** (Docker bridges, VPN tunnels, etc.): same idea.

A server has to declare upfront which of these it will accept connections on. Picking too narrow means legitimate clients can't reach it. Picking too wide can expose the service unintentionally.

## How it actually works

Three common bind targets:

| Bind | Meaning | Reachable from |
|---|---|---|
| `127.0.0.1:5115` | Listen on loopback only | Same machine, same OS user namespace |
| `192.168.1.51:5115` | Listen on this exact interface only | Anyone who can route packets to that IP |
| `0.0.0.0:5115` | Listen on **all** current and future interfaces | Anyone who can route to **any** of the machine's IPs |

`0.0.0.0` is sometimes called the **wildcard address** or **"unspecified"** address. It's not a real address you can send packets *to*; it only means "any address you can reach me on."

## Common misconceptions

- **"`0.0.0.0` means the public internet."** No. It means "every interface this machine has." If the machine has only a LAN IP, `0.0.0.0` only exposes it on the LAN. Internet exposure is a separate decision (router port forwarding, public IP, firewall rules).
- **"`localhost` and `0.0.0.0` are the same thing."** No. `localhost` is `127.0.0.1`, which is loopback only. `0.0.0.0` includes loopback **plus** every other interface.
- **"Binding to `0.0.0.0` is automatically insecure."** It's a default that exposes the service to wherever the machine is reachable. On a LAN-only device with no port forwarding, it's fine. On a public cloud VM with a public IP, it exposes the service to the internet.

## When it matters in practice

### Local development

Default bind is usually `127.0.0.1` (e.g., .NET's `launchSettings.json`, Next.js dev server). This works because the browser is on the same machine. **Why this breaks when another device tries to connect:** that device hits the LAN IP, but the server is only listening on loopback. The packet arrives at the right port but no one's home.

### Multi-interface machines

A phone connected to wifi **and** USB tethering has two IPs. A laptop with wifi and ethernet both up has two IPs. Binding to one specific IP works until the user switches interfaces. `0.0.0.0` survives the switch.

### Multi-band wifi with separate MACs

Some devices register separate MAC addresses per band (2.4 GHz vs 5 GHz), which routers see as different clients and can give different DHCP reservations to. Result: same physical phone, two different LAN IPs depending on which band it's on. `0.0.0.0` listens on whichever IP is currently active.

### Server behind a reverse proxy

When nginx / Caddy / Traefik sits in front of your service, only the proxy needs to reach the service. Bind to `127.0.0.1`: the proxy on the same machine can still reach it, but nothing else can - the proxy becomes the only public-facing surface. This is the standard pattern for production. (See [`gcp-server-setup.md`](../../guides/gcp-server-setup.md) for an example.)

## Configuration in common stacks

### .NET / ASP.NET Core

Read at runtime, in priority order:
1. Command line: `dotnet App.dll --urls http://0.0.0.0:5115`
2. Env var: `ASPNETCORE_URLS=http://0.0.0.0:5115`
3. `appsettings.json`: `{ "Urls": "http://0.0.0.0:5115" }`
4. Default (`localhost:5000`)

### Next.js (production server)

Env var: `HOSTNAME=0.0.0.0` (or `HOST` depending on version). Default is `localhost`.

### Node `http.createServer().listen()`

`server.listen(port, host)`. Default host is `0.0.0.0` for plain `http`, `localhost` for some frameworks.

## Further reading

- IETF RFC 5735 (special-use IPv4 addresses): https://datatracker.ietf.org/doc/html/rfc5735
- Microsoft docs on `ASPNETCORE_URLS`: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/endpoints
- Why `0.0.0.0` is also called "INADDR_ANY" in BSD sockets: https://man7.org/linux/man-pages/man7/ip.7.html
