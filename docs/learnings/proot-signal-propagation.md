# Signals don't cross the proot boundary (why `sv restart` ships stale code)

**Last updated:** 2026-05-26 - first encountered in #57 (MCP filter feature) deploy, traced retroactively to every prior multi-service phone deploy

A process supervisor (runit) that sends SIGTERM to a `proot-distro login` wrapper does NOT stop the program running inside proot. The wrapper ignores or fails to forward the signal, the guest keeps running, and the supervisor's "restart" silently does nothing. On a deploy this means new code is copied to disk and never loaded - the old process keeps serving. The deploy reports success; a port check passes; everything looks fine; it's all stale.

## Mental model

```
runsv (runit supervisor)
  │  sends SIGTERM on `sv restart` / `sv down`
  ▼
proot-distro login ubuntu   ← signal lands HERE
  │  (does not forward TERM inward)
  ▼
proot --bind=... dotnet Tasklog.Api.dll   ← keeps running, holds the port
```

The supervisor only has a handle on the process it spawned directly - the proot wrapper. Everything the wrapper spawns lives in a translated process namespace. Unix signals do not automatically tunnel through that boundary the way they do through a normal parent/child `exec` chain.

## Why it happens

`proot` emulates a chroot+bind-mount environment in userspace by intercepting syscalls (`ptrace`). The guest process is a child of proot, not of the supervisor. When the supervisor signals the wrapper:

- If the wrapper is a shell still resident (not `exec`'d away), the shell may receive TERM and exit without forwarding it, orphaning proot + guest.
- If the wrapper is proot itself, proot does not reliably relay TERM to the traced guest.

Either way the guest survives. `sv restart` waits its timeout, gives up, and the old guest keeps the port. `sv status` then shows something like `run: tasklog-api: (pid NNNN) 41737s, got TERM` - "I asked it to stop 11 hours ago and it's still running."

## The fix that works: kill the guest, not the wrapper

`proot-distro login` runs with `--kill-on-exit` **by default** (the documented flag is `--no-kill-on-exit`, to disable it). That means: when the guest's main process dies, proot itself exits, and the supervisor - which keeps "up" services running - auto-restarts the service from its run script, loading fresh code.

So the reliable restart is to kill the **inner guest process** by a distinctive command-line pattern, and let the supervisor do the rest. No `sv restart`, no `sv down`/`sv up`:

```bash
# runit will auto-restart each service after its inner process dies,
# because proot --kill-on-exit makes proot exit when the guest dies.
pkill -9 -f 'Tasklog.Api.dll'      # the .NET guest
pkill -9 -f 'dist/server.js'       # the MCP node guest
pkill -9 -f 'node server.js'       # the frontend node guest (note: does NOT
                                   #   match 'node dist/server.js', so the MCP
                                   #   service is left alone)
pkill -9 -f 'cloudflared tunnel'   # the tunnel guest
```

Patterns must be mutually exclusive, or one kill takes down a service you didn't mean to touch. The web-vs-mcp case is the subtle one: `node server.js` is a substring of itself but not of `node dist/server.js`, so the web pattern is safe.

## Common misconceptions

- **"`sv restart` restarts the service."** Only for non-proot services. For a proot-wrapped service it SIGTERMs the wrapper and the guest ignores it.
- **"A passing port check means the deploy worked."** No. The old guest answers the port. You have to check the process *uptime* (`sv status` shows seconds since start) or assert a behavior that only the new code has (e.g. a new endpoint returning a new status code). A fresh deploy should show small uptimes.
- **"`--kill-on-exit` will kill the guest when I stop the service."** Only when *proot* exits. If proot never exits (because TERM didn't reach it and the guest is still alive), kill-on-exit never fires. It is "kill guest when proot exits", not "kill guest on TERM".
- **"`sv force-restart` / `sv -w` will force it."** It SIGKILLs the wrapper after a timeout, but the orphaned guest under the dead wrapper can still hold the port. You have to target the guest.

## Verifying a deploy actually took

Always assert a *behavioral* difference the new code introduces, not just a 200:

```bash
# after deploy, check uptime is small AND a new behavior is present
sv status tasklog-api                              # uptime should be seconds, not hours
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:5115/api/tasks?inbox=true&projectIds=1"   # new code returns 400
```

If uptime is large or the new behavior is missing, the guest is stale - kill it and let runit restart.

## When this matters in practice

- **Any supervisor + container/sandbox combo where the supervised process is a wrapper:** runit/systemd/s6 in front of `proot`, `chroot`, `nsenter`, `docker exec`, `flatpak run`, `ssh host cmd`. The supervisor's signals stop at the wrapper.
- **Deploys that "didn't take":** the #1 cause of "I deployed but the bug is still there" on these setups. Check process uptime first.
- **Designing run scripts:** if you control the wrapper invocation, prefer one that `exec`s the guest as PID-equivalent and forwards signals, or add an explicit `trap` that forwards TERM to the guest. When you can't (proot-distro), restart by killing the guest instead.

## Further reading

- [proot-on-android.md](proot-on-android.md) - the broader Termux + proot-distro architecture this sits inside.
- `proot-distro login --help` - shows `--no-kill-on-exit`, confirming kill-on-exit is the default.
- [runit documentation](http://smarden.org/runit/) - how `sv` signals and supervises (`./run` must not fork; the supervised process is the one runsv spawns directly).
