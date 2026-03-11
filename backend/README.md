# Tasklog Backend

ASP.NET Core Web API for Tasklog. Part of the v2 architecture.

For full system documentation see [docs/architecture.md](../docs/architecture.md).

---

## Run

```bash
cd Tasklog.Api
dotnet run
```

Runs on `http://localhost:5115` (HTTP) and `https://localhost:7243` (HTTPS).

## Configuration

Connection string and logging are in `Tasklog.Api/appsettings.json`.
The SQLite database file is `Tasklog.Api/TasklogDatabase.db`.

## Stack

.NET 9 · ASP.NET Core Web API · Entity Framework Core 9 · SQLite
