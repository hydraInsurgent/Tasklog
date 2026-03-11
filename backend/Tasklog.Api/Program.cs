using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// Register controllers (TasksController and any future controllers).
builder.Services.AddControllers();

// Register the SQLite database context.
builder.Services.AddDbContext<TasklogDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

// Allow the Next.js dev server (localhost:3000) to call this API.
// In production, a reverse proxy on the same host removes the need for CORS.
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendDev", policy =>
    {
        policy
            .WithOrigins("http://localhost:3000")
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
