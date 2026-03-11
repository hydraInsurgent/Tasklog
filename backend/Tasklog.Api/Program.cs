using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// Register controllers (TasksController and any future controllers).
builder.Services.AddControllers();

// Register the SQLite database context.
builder.Services.AddDbContext<TasklogDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

// Read allowed origins from config - defined in appsettings.Development.json.
// Supports both localhost (PC browser) and the PC's LAN IP (phone/other devices).
// If the PC's IP changes, update CorsAllowedOrigins in appsettings.Development.json.
var allowedOrigins = builder.Configuration
    .GetSection("CorsAllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendDev", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
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

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
