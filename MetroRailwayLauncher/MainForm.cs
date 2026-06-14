using System;
using System.IO;
using System.Net.Http;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Text.Json;
using Microsoft.Web.WebView2.WinForms;

namespace MetroRailwayLauncher;

public class MainForm : Form
{
    public const string APP_VERSION = "v1.2.0";
    private WebView2 webView = null!;
    private Process? backendProcess;
    private bool isClosing = false;

    public MainForm()
    {
        InitializeComponents();
    }

    private void InitializeComponents()
    {
        this.Text = "Metro Railway Kolkata S&T ERP";
        this.Size = new System.Drawing.Size(1280, 800);
        this.MinimumSize = new System.Drawing.Size(1024, 768);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.WindowState = FormWindowState.Normal;

        // Try setting form icon dynamically from the executable if it exists
        try
        {
            string? exePath = Environment.ProcessPath;
            if (!string.IsNullOrEmpty(exePath))
            {
                this.Icon = System.Drawing.Icon.ExtractAssociatedIcon(exePath);
            }
        }
        catch { }

        // Setup WebView2 control
        webView = new WebView2();
        webView.Dock = DockStyle.Fill;
        this.Controls.Add(webView);

        this.Load += MainForm_Load;
        this.FormClosing += MainForm_FormClosing;
    }

    private async void MainForm_Load(object? sender, EventArgs e)
    {
        try
        {
            // Set up webview runtime
            await webView.EnsureCoreWebView2Async(null);

            // Disable standard Edge context menu for a clean app presentation during loading
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

            // Load loading.html from embedded resources
            string htmlContent = LoadEmbeddedLoadingHtml();
            webView.NavigateToString(htmlContent);

            // Initialize extraction and launch background processes in another thread to keep UI interactive
            _ = Task.Run(() => InitializeApplication());
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to initialize Edge WebView2 engine:\n{ex.Message}\n\nPlease verify that Microsoft Edge WebView2 Runtime is installed on this PC.", 
                "Engine Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Application.Exit();
        }
    }

    private string LoadEmbeddedLoadingHtml()
    {
        var assembly = Assembly.GetExecutingAssembly();
        string resourceName = "MetroRailwayLauncher.loading.html";
        
        using (Stream? stream = assembly.GetManifestResourceStream(resourceName))
        {
            if (stream == null) 
            {
                return "<html><body style='background:#0d0e12;color:white;font-family:sans-serif;padding:30px;'>" +
                       "<h2>Metro Railway Kolkata S&T ERP</h2>" +
                       "<p>Failed to find loading.html resource. Initializing backend...</p></body></html>";
            }
            using (StreamReader reader = new StreamReader(stream))
            {
                return reader.ReadToEnd();
            }
        }
    }

    private string ExtractBackend()
    {
        string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MetroRailwayERP");
        string binDir = Path.Combine(appDir, "bin");
        Directory.CreateDirectory(binDir);
        string backendPath = Path.Combine(binDir, "backend.exe");

        var assembly = Assembly.GetExecutingAssembly();
        string resourceName = "MetroRailwayLauncher.Resources.backend.exe";

        using (Stream? stream = assembly.GetManifestResourceStream(resourceName))
        {
            if (stream == null)
            {
                throw new Exception($"Failed to locate embedded backend assembly resource: {resourceName}");
            }

            bool shouldWrite = true;
            if (File.Exists(backendPath))
            {
                try
                {
                    FileInfo fi = new FileInfo(backendPath);
                    // Avoid re-writing if size is unchanged
                    if (fi.Length == stream.Length)
                    {
                        shouldWrite = false;
                    }
                }
                catch { }
            }

            if (shouldWrite)
            {
                AppendLog("New executable or update detected. Terminating legacy processes...");
                KillProcessByName("backend");
                Thread.Sleep(500);

                AppendLog("Extracting embedded engine binary...");
                using (FileStream fs = new FileStream(backendPath, FileMode.Create, FileAccess.Write))
                {
                    stream.CopyTo(fs);
                }
                AppendLog("Extraction finished successfully.");
            }
        }

        return backendPath;
    }

    private void StartBackend(string exePath)
    {
        backendProcess = new Process();
        backendProcess.StartInfo.FileName = exePath;
        backendProcess.StartInfo.WorkingDirectory = Path.GetDirectoryName(exePath);
        backendProcess.StartInfo.CreateNoWindow = true;
        backendProcess.StartInfo.UseShellExecute = false;
        backendProcess.StartInfo.RedirectStandardOutput = true;
        backendProcess.StartInfo.RedirectStandardError = true;

        // Redirect console logs to launcher log box
        backendProcess.OutputDataReceived += (sender, e) => {
            if (!string.IsNullOrEmpty(e.Data))
            {
                AppendLog($"[Backend] {e.Data}");
            }
        };
        backendProcess.ErrorDataReceived += (sender, e) => {
            if (!string.IsNullOrEmpty(e.Data))
            {
                AppendLog($"[Backend Error] {e.Data}");
            }
        };

        backendProcess.Start();
        backendProcess.BeginOutputReadLine();
        backendProcess.BeginErrorReadLine();
    }

    private async Task InitializeApplication()
    {
        try
        {
            // Start checking for updates in the background in parallel
            _ = Task.Run(() => CheckForUpdates());

            // Step 1: Extraction
            SetStatus("extract", "running", "Extracting embedded application resources...");
            SetProgress(15);
            AppendLog("Checking binary folders in LocalAppData...");
            string backendPath = ExtractBackend();
            SetStatus("extract", "completed", "Resources extracted successfully.");
            SetProgress(40);
            AppendLog($"Backend located at: {backendPath}");

            // Step 2: Start backend uvicorn service
            SetStatus("backend", "running", "Starting API microservice...");
            SetProgress(60);
            AppendLog("Starting FastAPI web application server on port 8000...");
            StartBackend(backendPath);

            // Step 3: Wait for HTTP port binding
            AppendLog("Verifying HTTP listener status...");
            bool portReady = await PollPortReady(8000, 30);

            if (!portReady)
            {
                SetStatus("backend", "failed", "API service startup timeout!");
                SetProgress(100);
                AppendLog("[Error] FastAPI service failed to respond on port 8000 within 30 seconds.");
                return;
            }

            SetStatus("backend", "completed", "API microservice is active.");
            SetProgress(90);
            AppendLog("Backend initialization completed. Booting UI client...");

            // Give uvicorn a short buffer, then load the root URL
            await Task.Delay(800);
            SetProgress(100);

            webView.Invoke(new Action(() => {
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                webView.Source = new Uri("http://localhost:8000");
            }));
        }
        catch (Exception ex)
        {
            SetStatus("extract", "failed", "Startup crashed!");
            AppendLog($"[Fatal Error] {ex.Message}");
            MessageBox.Show($"Application failed to start:\n{ex.Message}", "Startup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task CheckForUpdates()
    {
        try
        {
            AppendLog("Checking for updates on GitHub...");
            using (var client = new HttpClient())
            {
                client.DefaultRequestHeaders.UserAgent.ParseAdd("MetroRailwayERPLauncher");
                client.Timeout = TimeSpan.FromSeconds(5);
                
                var response = await client.GetAsync("https://api.github.com/repos/kbiswas9876/StaffAttendanceNAD/releases/latest");
                if (response.IsSuccessStatusCode)
                {
                    var jsonContent = await response.Content.ReadAsStringAsync();
                    using (JsonDocument doc = JsonDocument.Parse(jsonContent))
                    {
                        if (doc.RootElement.TryGetProperty("tag_name", out JsonElement tagElement))
                        {
                            string latestVersion = tagElement.GetString() ?? "";
                            if (!string.IsNullOrEmpty(latestVersion) && latestVersion != APP_VERSION)
                            {
                                AppendLog($"[Updater] Found a newer version on GitHub: {latestVersion} (Current: {APP_VERSION})");
                                
                                // Prompt user on GUI thread
                                this.Invoke(new Action(() => {
                                    var result = MessageBox.Show(
                                        $"A new update ({latestVersion}) is available on GitHub!\nWould you like to open the release page to download it?",
                                        "Update Available",
                                        MessageBoxButtons.YesNo,
                                        MessageBoxIcon.Information
                                    );
                                    if (result == DialogResult.Yes)
                                    {
                                        try
                                        {
                                            Process.Start(new ProcessStartInfo
                                            {
                                                FileName = "https://github.com/kbiswas9876/StaffAttendanceNAD/releases/latest",
                                                UseShellExecute = true
                                            });
                                        }
                                        catch (Exception ex)
                                        {
                                            MessageBox.Show($"Failed to open URL: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                                        }
                                    }
                                }));
                            }
                            else
                            {
                                AppendLog($"[Updater] Application is up-to-date (Version: {APP_VERSION})");
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            AppendLog($"[Updater Error] Failed to check for updates: {ex.Message}");
        }
    }

    private async Task<bool> PollPortReady(int port, int timeoutSeconds)
    {
        using (var client = new HttpClient())
        {
            client.Timeout = TimeSpan.FromMilliseconds(800);
            DateTime startTime = DateTime.Now;
            
            while ((DateTime.Now - startTime).TotalSeconds < timeoutSeconds)
            {
                if (isClosing) return false;

                if (backendProcess != null && backendProcess.HasExited)
                {
                    AppendLog($"[Error] Backend process terminated unexpectedly. Code: {backendProcess.ExitCode}");
                    return false;
                }

                try
                {
                    var response = await client.GetAsync($"http://127.0.0.1:{port}/");
                    // Any valid HTTP response means port is open and application is serving requests
                    if (response.IsSuccessStatusCode || 
                        response.StatusCode == System.Net.HttpStatusCode.NotFound || 
                        response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        return true;
                    }
                }
                catch { }

                await Task.Delay(500);
            }
        }
        return false;
    }

    private void SetStatus(string stage, string state, string text)
    {
        string escapedText = text.Replace("'", "\\'");
        InvokeJS($"updateStatus('{stage}', '{state}', '{escapedText}')");
    }

    private void SetProgress(int percentage)
    {
        InvokeJS($"setProgress({percentage})");
    }

    private void AppendLog(string message)
    {
        string escapedMsg = message.Replace("\\", "\\\\").Replace("'", "\\'").Replace("\n", "\\n").Replace("\r", "");
        InvokeJS($"appendLog('{escapedMsg}')");
    }

    private void InvokeJS(string js)
    {
        if (isClosing) return;

        try
        {
            if (webView.InvokeRequired)
            {
                webView.Invoke(new Action(() => InvokeJS(js)));
            }
            else
            {
                if (webView != null && webView.CoreWebView2 != null)
                {
                    webView.CoreWebView2.ExecuteScriptAsync(js);
                }
            }
        }
        catch { }
    }

    private void KillProcessByName(string name)
    {
        foreach (var process in Process.GetProcessesByName(name))
        {
            try
            {
                process.Kill();
                process.WaitForExit(2000);
            }
            catch { }
        }
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        isClosing = true;
        
        // Clean termination of the backend tree
        if (backendProcess != null && !backendProcess.HasExited)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "taskkill",
                    Arguments = $"/F /T /PID {backendProcess.Id}",
                    CreateNoWindow = true,
                    UseShellExecute = false
                })?.WaitForExit(2000);
            }
            catch { }
        }
    }
}
