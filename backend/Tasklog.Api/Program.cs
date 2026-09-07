using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// Register controllers (TasksController and any future controllers).
builder.Services.AddControllers();

// Semantic embeddings via local Ollama (#87). Typed HttpClient: EmbeddingService gets
// its own client (base address + timeout set in its ctor from Ollama:Url config).
// Everything it does is best-effort - no Ollama on this host just means no vectors.
builder.Services.AddHttpClient<Tasklog.Api.Services.EmbeddingService>();

// In development, the DB is in the project root (working directory for dotnet run).
// In production/distributable, resolve relative to the exe's directory so it works
// regardless of where the exe is launched from (fixes issue #3).
var dbPath = builder.Environment.IsDevelopment()
    ? "TasklogDatabase.db"
    : Path.Combine(AppContext.BaseDirectory, "TasklogDatabase.db");
builder.Services.AddDbContext<TasklogDbContext>(opt =>
    opt.UseSqlite($"Data Source={dbPath}"));

builder.Services.AddCors(options =>
{
    // Development policy - allows any origin so LAN devices (phones, tablets) work
    // without needing to update config when the PC's IP changes.
    options.AddPolicy("FrontendDev", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });

    // Distributable policy - allows any origin.
    // Safe because Tasklog is a single-user local app with no authentication.
    options.AddPolicy("Distributable", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// Expose OpenAPI/Swagger in development for easy endpoint testing.
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors("FrontendDev");
}
else
{
    app.UseCors("Distributable");
}

// Only redirect to HTTPS in development (where the https profile is configured).
// The distributable runs over plain HTTP on the local network.
if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseAuthorization();
app.MapControllers();

// Apply any pending EF Core migrations on startup.
// Creates the SQLite file and schema on first run; no-op when already up to date.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TasklogDbContext>();
    db.Database.Migrate();

    // Upsert the code-defined journal templates by Key (#79). Editing a definition in
    // Services/JournalTemplates.cs updates the row on next start - no migration needed.
    foreach (var def in Tasklog.Api.Services.JournalTemplates.Definitions)
    {
        var row = db.JournalTemplates.FirstOrDefault(t => t.Key == def.Key);
        if (row == null)
        {
            db.JournalTemplates.Add(new Tasklog.Api.Models.JournalTemplate
            {
                Key = def.Key,
                Name = def.Name,
                Periodicity = def.Periodicity,
                SectionsJson = def.SectionsJson,
                SortOrder = def.SortOrder,
                CreatedAt = DateTime.Now
            });
        }
        else
        {
            row.Name = def.Name;
            row.Periodicity = def.Periodicity;
            row.SectionsJson = def.SectionsJson;
            row.SortOrder = def.SortOrder;
        }
    }
    db.SaveChanges();
}

// Embedding backfill (#87): catch up open tasks that have no vector yet (rows created
// while Ollama was down, plus the pre-#87 backlog). Fire-and-forget with its own scope
// so startup never blocks on a cold model load; it stops at the first failure, so a
// host without Ollama pays one refused connection and moves on.
_ = Task.Run(async () =>
{
    try
    {
        using var scope = app.Services.CreateScope();
        var embeddings = scope.ServiceProvider.GetRequiredService<Tasklog.Api.Services.EmbeddingService>();
        await embeddings.BackfillOpenTasksAsync();
    }
    catch (Exception ex)
    {
        // A discarded task swallows exceptions (e.g. the DB briefly locked right
        // after migration) - leave at least a trace instead of vanishing silently.
        app.Logger.LogWarning("Embedding backfill failed: {Reason}", ex.Message);
    }
});

app.Run();
