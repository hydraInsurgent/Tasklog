// Tasklog Launcher
// Starts both the .NET backend and Next.js frontend, displays access URLs,
// and shuts down both processes cleanly when the user presses any key.

using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Net.Sockets;

const int BackendPort = 5115;
const int FrontendPort = 3000;

var appDir = AppContext.BaseDirectory;

// Resolve paths to the backend exe and Node.js + frontend server.
var isWindows = OperatingSystem.IsWindows();
var backendExe = Path.Combine(appDir, "backend", isWindows ? "Tasklog.Api.exe" : "Tasklog.Api");
var nodeExe = Path.Combine(appDir, "node", isWindows ? "node.exe" : "node");
var frontendServer = Path.Combine(appDir, "frontend", "server.js");

// Validate that required files exist before starting.
var missing = new List<string>();
if (!File.Exists(backendExe)) missing.Add($"Backend: {backendExe}");
if (!File.Exists(nodeExe)) missing.Add($"Node.js: {nodeExe}");
if (!File.Exists(frontendServer)) missing.Add($"Frontend: {frontendServer}");

if (missing.Count > 0)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine("Missing required files:");
    foreach (var m in missing) Console.WriteLine($"  {m}");
    Console.ResetColor();
    Console.WriteLine("\nMake sure you extracted the full zip before running.");
    Console.WriteLine("Press any key to exit.");
    Console.ReadKey(true);
    return 1;
}

Process? backendProcess = null;
Process? frontendProcess = null;

// Handle Ctrl+C gracefully - shut down both processes.
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    StopProcesses();
};

try
{
    PrintHeader();

    // Start the backend (.NET API on port 5115).
    Console.Write("Starting backend...  ");
    backendProcess = StartProcess(
        backendExe,
        $"--urls http://0.0.0.0:{BackendPort}",
        Path.Combine(appDir, "backend"));

    // Give the backend a moment to initialize.
    await Task.Delay(2000);

    if (backendProcess.HasExited)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine("FAILED");
        Console.ResetColor();
        Console.WriteLine("Backend failed to start. Check the output above.");
        Console.WriteLine("Press any key to exit.");
        Console.ReadKey(true);
        return 1;
    }
    PrintOk(BackendPort);

    // Start the frontend (Node.js + Next.js standalone server on port 3000).
    Console.Write("Starting frontend... ");
    frontendProcess = StartProcess(
        nodeExe,
        $"\"{frontendServer}\"",
        Path.Combine(appDir, "frontend"),
        new Dictionary<string, string>
        {
            ["PORT"] = FrontendPort.ToString(),
            ["HOSTNAME"] = "0.0.0.0"
        });

    // Give the frontend a moment to initialize.
    await Task.Delay(2000);

    if (frontendProcess.HasExited)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine("FAILED");
        Console.ResetColor();
        Console.WriteLine("Frontend failed to start. Check the output above.");
        StopProcesses();
        Console.WriteLine("Press any key to exit.");
        Console.ReadKey(true);
        return 1;
    }
    PrintOk(FrontendPort);

    // Show access URLs.
    Console.WriteLine();
    var lanIp = GetLanIpAddress();

    Console.ForegroundColor = ConsoleColor.Cyan;
    Console.WriteLine("  Open in your browser:");
    Console.ResetColor();
    Console.WriteLine($"    http://localhost:{FrontendPort}");

    if (lanIp != null)
    {
        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("  Use on your phone (same Wi-Fi):");
        Console.ResetColor();
        Console.WriteLine($"    http://{lanIp}:{FrontendPort}");
    }

    Console.WriteLine();
    Console.ForegroundColor = ConsoleColor.DarkGray;
    Console.WriteLine("  Press any key to stop Tasklog.");
    Console.ResetColor();
    Console.WriteLine();

    // Wait for the user to press a key.
    Console.ReadKey(true);
}
finally
{
    StopProcesses();
}

return 0;

// --- Helper methods ---

void PrintHeader()
{
    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine("========================================");
    Console.WriteLine("  Tasklog");
    Console.WriteLine("========================================");
    Console.ResetColor();
    Console.WriteLine();
}

void PrintOk(int port)
{
    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine($"OK (port {port})");
    Console.ResetColor();
}

/// <summary>
/// Starts a process with the given executable and arguments.
/// Stdout/stderr are redirected and discarded to keep the launcher console clean.
/// </summary>
Process StartProcess(
    string fileName,
    string arguments,
    string workingDirectory,
    Dictionary<string, string>? envVars = null)
{
    var startInfo = new ProcessStartInfo
    {
        FileName = fileName,
        Arguments = arguments,
        WorkingDirectory = workingDirectory,
        UseShellExecute = false,
        CreateNoWindow = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
    };

    if (envVars != null)
    {
        foreach (var (key, value) in envVars)
        {
            startInfo.EnvironmentVariables[key] = value;
        }
    }

    var process = new Process { StartInfo = startInfo };
    process.Start();

    // Drain stdout/stderr asynchronously to prevent the child process
    // from blocking when its output buffer fills up.
    process.BeginOutputReadLine();
    process.BeginErrorReadLine();

    return process;
}

/// <summary>
/// Detects the first IPv4 LAN address (e.g. 192.168.x.x) for phone access.
/// Returns null if no suitable address is found.
/// </summary>
string? GetLanIpAddress()
{
    try
    {
        foreach (var iface in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (iface.OperationalStatus != OperationalStatus.Up) continue;
            if (iface.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

            var props = iface.GetIPProperties();
            foreach (var addr in props.UnicastAddresses)
            {
                if (addr.Address.AddressFamily != AddressFamily.InterNetwork) continue;

                var ip = addr.Address.ToString();
                // Return the first private network address.
                if (ip.StartsWith("192.168.") || ip.StartsWith("10.") || ip.StartsWith("172."))
                {
                    return ip;
                }
            }
        }
    }
    catch
    {
        // If network detection fails, phone access URL just won't be shown.
    }

    return null;
}

/// <summary>
/// Stops both backend and frontend processes if they are still running.
/// </summary>
void StopProcesses()
{
    Console.WriteLine("Shutting down...");

    KillProcess(frontendProcess, "Frontend");
    KillProcess(backendProcess, "Backend");

    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine("Tasklog stopped.");
    Console.ResetColor();
}

/// <summary>
/// Kills a process and its child processes.
/// </summary>
void KillProcess(Process? process, string name)
{
    if (process == null || process.HasExited) return;

    try
    {
        // Kill the entire process tree (important for Node.js which spawns children).
        process.Kill(entireProcessTree: true);
        process.WaitForExit(5000);
    }
    catch (Exception ex)
    {
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine($"  Warning: could not stop {name}: {ex.Message}");
        Console.ResetColor();
    }
}
