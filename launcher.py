import os
import sys
import time
import socket
import threading
import subprocess
import urllib.request
import urllib.error
import json
import ctypes
import webview

# Set AppUserModelID to ensure the custom icon shows on the taskbar natively in Windows
try:
    myappid = 'metro.railway.kolkata.erp.launcher.v2'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception as e:
    print(f"Failed to set AppUserModelID: {e}")

# Constants
VERSION = "v1.1.0"
LOCK_PORT = 29999
BACKEND_PORT = 8000
FRONTEND_PORT = 3000
REPO_URL = "https://github.com/kbiswas9876/StaffAttendanceNAD"
API_RELEASE_URL = "https://api.github.com/repos/kbiswas9876/StaffAttendanceNAD/releases/latest"

def get_app_root():
    """Detects application root directory by checking current, parent, grandparent, and fallback paths."""
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    else:
        exe_dir = os.path.dirname(os.path.abspath(__file__))
    
    if os.path.exists(os.path.join(exe_dir, "backend")) and os.path.exists(os.path.join(exe_dir, "frontend")):
        return exe_dir
    parent_dir = os.path.dirname(exe_dir)
    if os.path.exists(os.path.join(parent_dir, "backend")) and os.path.exists(os.path.join(parent_dir, "frontend")):
        return parent_dir
    grandparent_dir = os.path.dirname(parent_dir)
    if os.path.exists(os.path.join(grandparent_dir, "backend")) and os.path.exists(os.path.join(grandparent_dir, "frontend")):
        return grandparent_dir
    fallback_path = r"c:\Users\koush\OneDrive\Documents\KKVS"
    if os.path.exists(os.path.join(fallback_path, "backend")) and os.path.exists(os.path.join(fallback_path, "frontend")):
        return fallback_path
    return exe_dir

# Compute APP_ROOT globally
APP_ROOT = get_app_root()

# Premium loading HTML rendered locally by webview
LOADING_HTML = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Metro Railway Kolkata S&T ERP</title>
    <style>
        body {
            background-color: #121212;
            color: #e0e0e0;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            overflow: hidden;
            user-select: none;
        }
        .card {
            background-color: #1e1e1e;
            border: 2px solid #1a237e;
            border-radius: 12px;
            width: 580px;
            padding: 35px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }
        h1 {
            color: #ffffff;
            font-size: 24px;
            margin-top: 0;
            margin-bottom: 5px;
            text-align: center;
            letter-spacing: 1px;
            font-weight: bold;
        }
        h2 {
            color: #9fa8da;
            font-size: 13px;
            font-weight: normal;
            margin-top: 0;
            margin-bottom: 30px;
            text-align: center;
            font-style: italic;
        }
        .status-item {
            display: flex;
            align-items: center;
            margin-bottom: 14px;
            font-size: 14px;
        }
        .status-icon {
            font-size: 16px;
            width: 25px;
            margin-right: 12px;
            text-align: center;
            font-weight: bold;
        }
        .pending { color: #757575; }
        .checking { color: #2979ff; animation: pulse 1s infinite alternate; }
        .ok { color: #00e676; }
        .fail { color: #ff1744; }
        
        @keyframes pulse {
            from { opacity: 0.5; }
            to { opacity: 1; }
        }
        
        .progress-container {
            background-color: #2c2c2c;
            border-radius: 4px;
            height: 8px;
            width: 100%;
            margin-top: 25px;
            margin-bottom: 25px;
            overflow: hidden;
        }
        .progress-bar {
            background-color: #2979ff;
            height: 100%;
            width: 5%;
            transition: width 0.4s ease;
        }
        .log-container {
            background-color: #0d0d0d;
            border-radius: 6px;
            height: 160px;
            overflow-y: auto;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 11px;
            padding: 12px;
            color: #00e676;
            margin-top: 15px;
            white-space: pre-wrap;
            border: 1px solid #333333;
            box-sizing: border-box;
        }
        .button-container {
            display: flex;
            justify-content: flex-end;
            margin-top: 25px;
        }
        .btn {
            border: none;
            padding: 10px 22px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            color: #ffffff;
            transition: background-color 0.2s;
        }
        .btn-stop {
            background-color: #ff1744;
        }
        .btn-stop:hover {
            background-color: #d50000;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>METRO RAILWAY KOLKATA S&T ERP</h1>
        <h2>Staff Attendance System Startup Manager</h2>
        
        <div id="status-list">
            <div class="status-item" id="node-item">
                <span class="status-icon pending" id="node-icon">○</span>
                <span id="node-text">Checking Node.js & NPM installation...</span>
            </div>
            <div class="status-item" id="venv-item">
                <span class="status-icon pending" id="venv-icon">○</span>
                <span id="venv-text">Checking Python backend virtual environment...</span>
            </div>
            <div class="status-item" id="deps-item">
                <span class="status-icon pending" id="deps-icon">○</span>
                <span id="deps-text">Checking frontend node_modules...</span>
            </div>
            <div class="status-item" id="backend-item">
                <span class="status-icon pending" id="backend-icon">○</span>
                <span id="backend-text">Starting FastAPI backend microservice...</span>
            </div>
            <div class="status-item" id="frontend-item">
                <span class="status-icon pending" id="frontend-icon">○</span>
                <span id="frontend-text">Starting Next.js frontend dev server...</span>
            </div>
        </div>
        
        <div class="progress-container">
            <div class="progress-bar" id="progress-bar"></div>
        </div>
        
        <div class="log-container" id="log-container">Initializing startup checks...</div>
        
        <div class="button-container">
            <button class="btn btn-stop" onclick="pywebview.api.stop_erp()">Stop ERP & Exit</button>
        </div>
    </div>

    <script>
        function updateStatus(key, state, text) {
            var icon = document.getElementById(key + "-icon");
            var txt = document.getElementById(key + "-text");
            if (text) {
                txt.innerText = text;
            }
            icon.className = "status-icon " + state;
            if (state === "checking") {
                icon.innerText = "▶";
            } else if (state === "ok") {
                icon.innerText = "✔";
            } else if (state === "fail") {
                icon.innerText = "✘";
            } else {
                icon.innerText = "○";
            }
        }
        
        function updateProgress(value) {
            document.getElementById("progress-bar").style.width = value + "%";
        }
        
        function addLog(msg) {
            var container = document.getElementById("log-container");
            container.innerText += "\\n" + msg;
            container.scrollTop = container.scrollHeight;
        }

        function setFrozenMode() {
            document.getElementById("node-item").style.display = "none";
            document.getElementById("venv-item").style.display = "none";
            document.getElementById("deps-item").style.display = "none";
            document.getElementById("frontend-item").style.display = "none";
            var backendText = document.getElementById("backend-text");
            if (backendText) {
                backendText.innerText = "Initializing database & starting ERP microservice...";
            }
        }
    </script>
</body>
</html>
"""

class LauncherService:
    def __init__(self):
        self.backend_proc = None
        self.frontend_proc = None
        self.shutdown_triggered = False
        self.single_instance_socket = None
        self.window = None

    def check_single_instance(self):
        """Uses a local socket to verify single instance lock."""
        try:
            self.single_instance_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.single_instance_socket.bind(('127.0.0.1', LOCK_PORT))
            self.single_instance_socket.listen(1)
            return True
        except socket.error:
            return False

    def check_command_installed(self, command):
        """Checks if command is present on the PATH."""
        try:
            cmd = "where" if os.name == "nt" else "which"
            result = subprocess.run([cmd, command], capture_output=True, text=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
            return result.stdout.strip().split('\n')[0]
        except subprocess.CalledProcessError:
            return None

    def check_port_active(self, port):
        """Attempts to connect to localhost port to confirm binding."""
        for host in ('127.0.0.1', 'localhost'):
            try:
                with socket.create_connection((host, port), timeout=0.5):
                    return True
            except OSError:
                continue
        return False

    def check_http_ready(self, url):
        """Checks if HTTP service is fully ready and responding to requests."""
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "StaffAttendanceLauncher"})
            with urllib.request.urlopen(req, timeout=0.8) as response:
                if response.status in (200, 301, 302, 307, 308, 404):
                    return True
        except Exception:
            pass
        return False

    def stream_process_logs(self, pipe, prefix):
        """Reads process pipes line by line and outputs to webview log box."""
        try:
            with pipe:
                for line in iter(pipe.readline, ''):
                    if self.shutdown_triggered:
                        break
                    clean_line = line.strip()
                    if clean_line and self.window:
                        # Escape backslashes and quotes for safe JS execution
                        escaped = clean_line.replace('\\', '\\\\').replace('"', '\\"').replace("'", "\\'")
                        self.window.evaluate_js(f"addLog('{prefix}{escaped}')")
        except Exception:
            pass

    def run_startup(self, window):
        """Main startup checker sequence executing on background thread."""
        self.window = window
        time.sleep(1) # Let window render fully first
        
        is_frozen = getattr(sys, 'frozen', False)
        
        if is_frozen:
            # Standalone Frozen Mode: serve static frontend via embedded FastAPI/Uvicorn
            window.evaluate_js("setFrozenMode()")
            window.evaluate_js("updateStatus('backend', 'checking')")
            window.evaluate_js("updateProgress(30)")
            window.evaluate_js("addLog('[System] Standalone frozen mode detected.')")
            window.evaluate_js("addLog('[System] Initializing database in Documents folder...')")
            
            try:
                import uvicorn
                from backend.main import app as fastapi_app
                
                window.evaluate_js("addLog('[Backend] Starting FastAPI web server on port 8000...')")
                
                def start_uvicorn():
                    try:
                        uvicorn.run(fastapi_app, host="127.0.0.1", port=8000, log_level="warning")
                    except Exception as ex:
                        if self.window:
                            self.window.evaluate_js(f"addLog('[Error] Uvicorn failed to start: {ex}')")
                            
                uvicorn_thread = threading.Thread(target=start_uvicorn, daemon=True)
                uvicorn_thread.start()
                
            except Exception as e:
                window.evaluate_js("updateStatus('backend', 'fail', 'Failed to start backend database service!')")
                window.evaluate_js(f"addLog('[Error] Backend import or start failed: {e}')")
                return
                
            window.evaluate_js("updateProgress(60)")
            window.evaluate_js("addLog('[System] Waiting for backend port 8000 to respond...')")
            
            # Wait for backend port 8000 to become active
            start_time = time.time()
            timeout = 15
            backend_ready = False
            while time.time() - start_time < timeout:
                if self.shutdown_triggered:
                    return
                backend_ready = self.check_http_ready("http://127.0.0.1:8000/")
                if not backend_ready:
                    backend_ready = self.check_port_active(BACKEND_PORT)
                if backend_ready:
                    break
                time.sleep(0.5)
                
            if not backend_ready:
                window.evaluate_js("updateStatus('backend', 'fail', 'Backend service failed to start on port 8000!')")
                window.evaluate_js("addLog('[Error] Port 8000 timeout exceeded!')")
                return
                
            window.evaluate_js("updateStatus('backend', 'ok', 'ERP microservice is running.')")
            window.evaluate_js("updateProgress(100)")
            window.evaluate_js("addLog('[System] Handing over execution to the Web client...')")
            time.sleep(1.0)
            
            try:
                window.evaluate_js("window.location.href = 'http://127.0.0.1:8000'")
            except Exception:
                pass
            try:
                window.load_url("http://127.0.0.1:8000")
            except Exception:
                pass
                
        else:
            # --- Development Mode (Existing flow) ---
            # Absolute paths setup
            backend_dir = os.path.join(APP_ROOT, "backend")
            frontend_dir = os.path.join(APP_ROOT, "frontend")
            node_modules_dir = os.path.join(frontend_dir, "node_modules")
            requirements_path = os.path.join(backend_dir, "requirements.txt")
            
            venv_python = os.path.join(backend_dir, ".venv", "Scripts", "python.exe")
            venv_pip = os.path.join(backend_dir, ".venv", "Scripts", "pip.exe")
            
            # Step 1: Check Node.js
            window.evaluate_js("updateStatus('node', 'checking')")
            node_path = self.check_command_installed("node")
            npm_path = self.check_command_installed("npm")
            
            if not node_path or not npm_path:
                window.evaluate_js("updateStatus('node', 'fail', 'Node.js & NPM not found on System PATH!')")
                window.evaluate_js("addLog('[Error] Node.js or NPM is not installed globally on this computer.')")
                window.evaluate_js("addLog('        Please download and install Node.js from https://nodejs.org/')")
                return
                
            window.evaluate_js("updateStatus('node', 'ok', 'Node.js & NPM found successfully.')")
            window.evaluate_js("updateProgress(20)")
    
            # Step 2: Check Python venv (.venv)
            window.evaluate_js("updateStatus('venv', 'checking')")
            
            if not os.path.exists(venv_python):
                window.evaluate_js("addLog('[Venv] Virtual environment \'.venv\' not found. Creating virtual environment...')")
                window.evaluate_js("updateStatus('venv', 'checking', 'Creating Python backend virtual environment (.venv)...')")
                
                # Find system python
                sys_python = self.check_command_installed("python")
                if not sys_python:
                    window.evaluate_js("updateStatus('venv', 'fail', 'Python not found on System PATH!')")
                    window.evaluate_js("addLog('[Error] Local Python environment is required to set up the backend.')")
                    return
                    
                try:
                    # Create venv with 3-minute timeout and absolute paths
                    window.evaluate_js(f"addLog('[Venv] Running: {sys_python} -m venv .venv in backend/')")
                    proc = subprocess.Popen([sys_python, "-m", "venv", ".venv"], cwd=backend_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                    proc.wait(timeout=180)
                    if proc.returncode != 0:
                        raise Exception(f"Venv command failed with exit code: {proc.returncode}")
                    window.evaluate_js("addLog('[Venv] Virtual environment successfully created.')")
                except Exception as e:
                    window.evaluate_js("updateStatus('venv', 'fail', 'Failed to create Python virtual environment!')")
                    window.evaluate_js(f"addLog('[Error] Failed venv creation: {e}')")
                    return
            
            # Venv exists, install requirements if needed
            window.evaluate_js("updateStatus('venv', 'checking', 'Checking backend dependencies...')")
            try:
                window.evaluate_js("addLog('[Venv] Installing requirements in virtualenv (pip install)...')")
                proc = subprocess.Popen([venv_pip, "install", "-r", requirements_path], cwd=backend_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                proc.wait(timeout=300) # 5 minutes timeout
                if proc.returncode != 0:
                    raise Exception(f"Pip install requirements failed with exit code: {proc.returncode}")
                window.evaluate_js("addLog('[Venv] Backend dependencies up to date.')")
            except Exception as e:
                window.evaluate_js("updateStatus('venv', 'fail', 'Failed to install backend packages!')")
                window.evaluate_js(f"addLog('[Error] Pip install failed: {e}')")
                return
    
            window.evaluate_js("updateStatus('venv', 'ok', 'Python virtual environment & dependencies ready.')")
            window.evaluate_js("updateProgress(40)")
    
            # Step 3: Check frontend dependencies (node_modules)
            window.evaluate_js("updateStatus('deps', 'checking')")
            if not os.path.exists(node_modules_dir):
                window.evaluate_js("addLog('[Frontend] node_modules not found. Installing frontend dependencies (npm install)...')")
                window.evaluate_js("updateStatus('deps', 'checking', 'Installing frontend dependencies (npm install)...')")
                try:
                    # Use npm.cmd on Windows to resolve properly
                    proc = subprocess.Popen(["npm.cmd", "install"], cwd=frontend_dir, creationflags=subprocess.CREATE_NO_WINDOW)
                    proc.wait(timeout=300) # 5 minutes timeout
                    if proc.returncode != 0:
                        raise Exception(f"npm install failed with exit code: {proc.returncode}")
                    window.evaluate_js("addLog('[Frontend] Frontend packages successfully installed.')")
                except Exception as e:
                    window.evaluate_js("updateStatus('deps', 'fail', 'Failed to install frontend dependencies!')")
                    window.evaluate_js(f"addLog('[Error] NPM install failed: {e}')")
                    return
                    
            window.evaluate_js("updateStatus('deps', 'ok', 'Frontend dependencies ready.')")
            window.evaluate_js("updateProgress(60)")
    
            # Step 4: Launch backend
            window.evaluate_js("updateStatus('backend', 'checking')")
            try:
                window.evaluate_js("addLog('[Backend] Starting FastAPI backend (main.py)...')")
                self.backend_proc = subprocess.Popen(
                    [venv_python, "main.py"],
                    cwd=backend_dir,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
                # Read stdout/stderr logs in separate threads to avoid freezing
                t1 = threading.Thread(target=self.stream_process_logs, args=(self.backend_proc.stdout, "[Backend] "), daemon=True)
                t2 = threading.Thread(target=self.stream_process_logs, args=(self.backend_proc.stderr, "[Backend Error] "), daemon=True)
                t1.start()
                t2.start()
            except Exception as e:
                window.evaluate_js("updateStatus('backend', 'fail', 'Failed to start backend process!')")
                window.evaluate_js(f"addLog('[Error] Backend startup failure: {e}')")
                self.cleanup_processes()
                return
    
            # Step 5: Launch frontend
            window.evaluate_js("updateStatus('frontend', 'checking')")
            try:
                window.evaluate_js("addLog('[Frontend] Starting Next.js server (npm run dev)...')")
                self.frontend_proc = subprocess.Popen(
                    ["npm.cmd", "run", "dev"],
                    cwd=frontend_dir,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
                t3 = threading.Thread(target=self.stream_process_logs, args=(self.frontend_proc.stdout, "[Frontend] "), daemon=True)
                t4 = threading.Thread(target=self.stream_process_logs, args=(self.frontend_proc.stderr, "[Frontend Error] "), daemon=True)
                t3.start()
                t4.start()
            except Exception as e:
                window.evaluate_js("updateStatus('frontend', 'fail', 'Failed to start frontend process!')")
                window.evaluate_js(f"addLog('[Error] Frontend startup failure: {e}')")
                self.cleanup_processes()
                return
    
            # Step 6: Wait for ports (Socket checking)
            window.evaluate_js("addLog('[System] Waiting for backend and frontend services to bind to ports...')")
            window.evaluate_js("updateProgress(80)")
            
            start_time = time.time()
            timeout = 45 # 45 seconds total timeout
            backend_ready = False
            frontend_ready = False
            
            while time.time() - start_time < timeout:
                if self.shutdown_triggered:
                    return
                    
                # Verify if process is still alive
                if self.backend_proc.poll() is not None:
                    window.evaluate_js(f"updateStatus('backend', 'fail', 'Backend process crashed! Code: {self.backend_proc.returncode}')")
                    self.cleanup_processes()
                    return
                    
                if self.frontend_proc.poll() is not None:
                    window.evaluate_js(f"updateStatus('frontend', 'fail', 'Frontend process crashed! Code: {self.frontend_proc.returncode}')")
                    self.cleanup_processes()
                    return
                    
                if not backend_ready:
                    backend_ready = self.check_http_ready("http://127.0.0.1:8000/")
                    if not backend_ready:
                        backend_ready = self.check_port_active(BACKEND_PORT)
                    if backend_ready:
                        window.evaluate_js("updateStatus('backend', 'ok', 'FastAPI backend is running.')")
                        window.evaluate_js("addLog('[System] Port 8000 (Backend) responded. Backend ready!')")
                        
                if not frontend_ready:
                    frontend_ready = self.check_http_ready("http://127.0.0.1:3000/")
                    if not frontend_ready:
                        frontend_ready = self.check_port_active(FRONTEND_PORT)
                    if frontend_ready:
                        window.evaluate_js("updateStatus('frontend', 'ok', 'Next.js frontend is running.')")
                        window.evaluate_js("addLog('[System] Port 3000 (Frontend) responded. Frontend ready!')")
                        
                if backend_ready and frontend_ready:
                    break
                    
                time.sleep(1)
                
            if not (backend_ready and frontend_ready):
                window.evaluate_js("addLog('[Error] Startup timeout exceeded! Port response verification failed.')")
                if not backend_ready:
                    window.evaluate_js("updateStatus('backend', 'fail', 'Backend port 8000 timeout!')")
                if not frontend_ready:
                    window.evaluate_js("updateStatus('frontend', 'fail', 'Frontend port 3000 timeout!')")
                self.cleanup_processes()
                return
    
            # Startup complete!
            window.evaluate_js("updateProgress(100)")
            window.evaluate_js("addLog('[System] Setup initialization complete. Services are fully active!')")
            time.sleep(2.0) # Safe buffer to ensure Next.js dev server has compiled and is serving requests
            
            # Handover: Redirect webview window directly to http://localhost:3000 using both JS and native load_url
            window.evaluate_js("addLog('[System] Handing over execution to the Web Roster Client...')")
            try:
                window.evaluate_js("window.location.href = 'http://localhost:3000'")
            except Exception:
                pass
            try:
                window.load_url("http://localhost:3000")
            except Exception:
                pass


    def check_for_updates(self):
        """Queries Github releases to see if updates are available."""
        try:
            req = urllib.request.Request(API_RELEASE_URL, headers={"User-Agent": "StaffAttendanceLauncher"})
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                latest_tag = data.get("tag_name", "")
                if latest_tag and latest_tag != VERSION:
                    if self.window:
                        self.window.evaluate_js(f"addLog('[Updater] Found a newer version on GitHub: {latest_tag} (Current: {VERSION})')")
        except urllib.error.HTTPError as e:
            if e.code != 404:
                print(f"Update check failed with HTTP Error {e.code}: {e.reason}")
        except Exception:
            pass

    def cleanup_processes(self):
        """Terminates processes cleanly by recursively killing the tree."""
        self.shutdown_triggered = True
        
        # Kill backend tree
        if self.backend_proc:
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(self.backend_proc.pid)],
                    capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            except Exception:
                pass
                
        # Kill frontend tree
        if self.frontend_proc:
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(self.frontend_proc.pid)],
                    capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            except Exception:
                pass

        # Release lock socket
        if self.single_instance_socket:
            try:
                self.single_instance_socket.close()
            except Exception:
                pass

class WebviewAPI:
    def __init__(self, launcher_service):
        self.service = launcher_service

    def stop_erp(self):
        self.service.cleanup_processes()
        if self.service.window:
            self.service.window.destroy()
        sys.exit(0)

def main():
    service = LauncherService()
    
    # 1. Single instance lock check
    if not service.check_single_instance():
        try:
            ctypes.windll.user32.MessageBoxW(0, "An instance of Metro Railway S&T ERP Launcher is already running!", "Instance Running", 0x10)
        except Exception:
            print("An instance of Metro Railway S&T ERP Launcher is already running!")
        sys.exit(0)

    # 2. Expose JS API
    api = WebviewAPI(service)

    # 3. Create native window
    icon_path = os.path.join(APP_ROOT, "icon.ico")
    window = webview.create_window(
        title="Metro Railway Kolkata S&T ERP",
        html=LOADING_HTML,
        width=1280,
        height=800,
        min_size=(1024, 768),
        background_color='#121212',
        js_api=api
    )

    # 4. Handle clean termination on direct window close (X button click)
    def on_closed():
        service.cleanup_processes()
        sys.exit(0)
    window.events.closed += on_closed

    # 5. Start pywebview loop with startup checker callback running in background
    webview.start(service.run_startup, window)

if __name__ == "__main__":
    main()
