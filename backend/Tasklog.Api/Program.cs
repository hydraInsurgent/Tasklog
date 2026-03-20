using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// Register controllers (TasksController and any future controllers).
builder.Services.AddControllers();

// In development, the DB is in the project root (working directory for dotnet run).
// In production/distributable, resolve relative to the exe's directory so it works
// regardless of where the exe is launched from (fixes issue #3).
var dbPath = builder.Environment.IsDevelopment()
    ? "TasklogDatabase.db"
    : Path.Combine(AppContext.BaseDirectory, "TasklogDatabase.db");
builder.Services.AddDbContext<TasklogDbContext>(opt =>
    opt.UseSqlite($"Data Source={dbPath}"));

// Read allowed origins from config - defined in appsettings.Development.json.
// Supports both localhost (PC browser) and the PC's LAN IP (phone/other devices).
// If the PC's IP changes, update CorsAllowedOrigins in appsettings.Development.json.
var allowedOrigins = builder.Configuration
    .GetSection("CorsAllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    // Development policy - uses config-based origins from appsettings.Development.json.
    options.AddPolicy("FrontendDev", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
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

app.Run();
