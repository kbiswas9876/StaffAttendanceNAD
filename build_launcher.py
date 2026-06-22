import os
import sys
import shutil
import subprocess
from PIL import Image

def convert_png_to_ico():
    png_path = "ChatGPT Image Jun 14, 2026, 10_42_04 PM.png"
    ico_path = "icon.ico"
    
    print(f"Checking for source image: {png_path}...")
    if not os.path.exists(png_path):
        fallback_png = "app_logo.png"
        if os.path.exists(fallback_png):
            png_path = fallback_png
            print(f"Using fallback logo image: {png_path}")
        else:
            print(f"Error: {png_path} not found in the root directory!")
            return False
        
    try:
        print("Converting PNG to ICO...")
        img = Image.open(png_path)
        # Standard ICO sizes for high quality display on Windows
        ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        img.save(ico_path, format="ICO", sizes=ico_sizes)
        print(f"Success! Saved custom icon to: {ico_path}")
        return True
    except Exception as e:
        print(f"Error during image conversion: {e}")
        return False

def get_version():
    version_file = "version.txt"
    if not os.path.exists(version_file):
        with open(version_file, "w") as f:
            f.write("1.2.2")
        return "1.2.2"
    with open(version_file, "r") as f:
        return f.read().strip().replace("v", "")

def update_project_versions(version):
    # 1. Update version.py in backend
    version_file = os.path.join("backend", "version.py")
    print(f"Updating backend version file: {version_file} to '{version}'")
    with open(version_file, "w") as f:
        f.write(f'VERSION = "{version}"\n')
        
    # 2. Update MainForm.cs in C# Launcher
    main_form_path = os.path.join("MetroRailwayLauncher", "MainForm.cs")
    if os.path.exists(main_form_path):
        print(f"Updating C# MainForm.cs constant to 'v{version}'")
        with open(main_form_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        import re
        # Match public const string APP_VERSION = "...";
        pattern = r'(public\s+const\s+string\s+APP_VERSION\s*=\s*")[^"]*(";)'
        new_content = re.sub(pattern, rf'\g<1>v{version}\g<2>', content)
        
        with open(main_form_path, "w", encoding="utf-8") as f:
            f.write(new_content)
            
    # 3. Update MetroRailwayLauncher.csproj in C# Launcher
    csproj_path = os.path.join("MetroRailwayLauncher", "MetroRailwayLauncher.csproj")
    if os.path.exists(csproj_path):
        print(f"Updating .NET csproj file version metadata to '{version}'")
        with open(csproj_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        import re
        
        # Format a 4-part version for AssemblyVersion/FileVersion (e.g., 1.2.1.1 or 1.2.1.0)
        parts = version.split('.')
        while len(parts) < 4:
            parts.append('0')
        four_part_version = '.'.join(parts[:4])
        
        # Check if AssemblyVersion, FileVersion, Version tags exist
        has_assembly = "<AssemblyVersion>" in content
        has_file = "<FileVersion>" in content
        has_version = "<Version>" in content
        
        if has_assembly:
            content = re.sub(r'<AssemblyVersion>[^<]*</AssemblyVersion>', f'<AssemblyVersion>{four_part_version}</AssemblyVersion>', content)
        if has_file:
            content = re.sub(r'<FileVersion>[^<]*</FileVersion>', f'<FileVersion>{four_part_version}</FileVersion>', content)
        if has_version:
            content = re.sub(r'<Version>[^<]*</Version>', f'<Version>{version}</Version>', content)
            
        # If any are missing, insert them before </PropertyGroup>
        if not (has_assembly and has_file and has_version):
            extra_properties = []
            if not has_assembly:
                extra_properties.append(f"    <AssemblyVersion>{four_part_version}</AssemblyVersion>")
            if not has_file:
                extra_properties.append(f"    <FileVersion>{four_part_version}</FileVersion>")
            if not has_version:
                extra_properties.append(f"    <Version>{version}</Version>")
            
            injection = "\n" + "\n".join(extra_properties) + "\n  </PropertyGroup>"
            content = content.replace("  </PropertyGroup>", injection)
            
        with open(csproj_path, "w", encoding="utf-8") as f:
            f.write(content)

def ensure_frontend_built():
    frontend_dir = "frontend"
    out_dir = os.path.join(frontend_dir, "out")
    
    # If out directory doesn't exist or is empty, build Next.js frontend
    if not os.path.exists(out_dir) or not os.listdir(out_dir):
        print("\nFrontend build ('frontend/out') not found or empty. Starting frontend build...")
        
        # Check node_modules
        node_modules = os.path.join(frontend_dir, "node_modules")
        if not os.path.exists(node_modules):
            print("node_modules not found. Running npm install...")
            try:
                subprocess.run(["npm", "install"], cwd=frontend_dir, check=True, shell=True)
            except Exception as e:
                print(f"Error running npm install: {e}")
                return False
                
        print("Running npm run build...")
        try:
            subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True, shell=True)
            print("Frontend successfully built.")
            return True
        except Exception as e:
            print(f"Error running npm run build: {e}")
            return False
    else:
        print("Existing frontend build found at 'frontend/out'.")
        return True

def ensure_backend_db():
    db_path = os.path.join("backend", "database.db")
    if not os.path.exists(db_path):
        print(f"\nDefault template database ('{db_path}') not found. Generating a clean template database...")
        env = os.environ.copy()
        env["ERP_DB_PATH"] = db_path
        try:
            # Initialize template database using a separate python subprocess
            cmd = [sys.executable, "-c", "import sys; sys.path.append('backend'); import main"]
            subprocess.run(cmd, env=env, check=True)
            print(f"Successfully initialized default database structure at {db_path}.")
            return True
        except Exception as e:
            print(f"Error creating default database: {e}")
            return False
    else:
        print(f"Existing template database found at '{db_path}'.")
        return True

def build_executable():
    version = get_version()
    print(f"=======================================================")
    print(f"Building Metro Railway S&T ERP with Version: v{version}")
    print(f"=======================================================")
    
    # Pre-build checks to ensure frontend/out and backend/database.db exist
    if not ensure_frontend_built():
        print("Failed to ensure frontend build is present. Aborting...")
        return
        
    if not ensure_backend_db():
        print("Failed to ensure default database is present. Aborting...")
        return
        
    update_project_versions(version)
    
    # Make sure we have the icon
    if not os.path.exists("icon.ico"):
        if not convert_png_to_ico():
            print("Failed to prepare icon.ico. Exiting...")
            return
            
    print("\n[1/4] Compiling FastAPI Python backend with PyInstaller...")
    pyinstaller_cmd = [
        "pyinstaller",
        "--clean",
        "--noconfirm",
        "backend.spec"
    ]
    
    print(f"Running command: {' '.join(pyinstaller_cmd)}")
    try:
        subprocess.run(pyinstaller_cmd, check=True)
        print("Backend successfully compiled to: dist/backend.exe")
    except subprocess.CalledProcessError as e:
        print(f"\nPyInstaller backend build failed with exit code: {e.returncode}")
        return
    except FileNotFoundError:
        print("\nError: PyInstaller not found. Install it using: pip install pyinstaller")
        return

    # Check if backend.exe exists in dist/
    backend_dist_path = os.path.join("dist", "backend.exe")
    if not os.path.exists(backend_dist_path):
        print(f"Error: Compiled backend not found at {backend_dist_path}!")
        return

    print("\n[2/4] Copying backend.exe to C# launcher resources...")
    resources_dir = os.path.join("MetroRailwayLauncher", "Resources")
    os.makedirs(resources_dir, exist_ok=True)
    backend_resource_path = os.path.join(resources_dir, "backend.exe")
    
    try:
        # Copy backend.exe
        shutil.copy2(backend_dist_path, backend_resource_path)
        print(f"Copied backend.exe to launcher resource folder: {backend_resource_path}")
        
        # Delete temporary dist/backend.exe so only MetroRailwayERP.exe remains in final dist/
        if os.path.exists(backend_dist_path):
            os.remove(backend_dist_path)
            print("Removed temporary dist/backend.exe")
    except Exception as e:
        print(f"Error copying/cleaning backend: {e}")
        return

    print("\n[3/4] Compiling .NET 8 C# Launcher using dotnet publish...")
    # Compile as a single file, self-contained x64 executable for zero-dependency distribution
    dotnet_cmd = [
        "dotnet", "publish",
        os.path.join("MetroRailwayLauncher", "MetroRailwayLauncher.csproj"),
        "-c", "Release",
        "-r", "win-x64",
        "--self-contained", "true",
        "-p:PublishSingleFile=true",
        "-p:PublishReadyToRun=true",
        "-p:EnableCompressionInSingleFileBundle=true",
        "-p:UseSharedCompilation=false",
        "-p:NodeReuse=false",
        "-o", "dist"
    ]
    
    print(f"Running command: {' '.join(dotnet_cmd)}")
    try:
        subprocess.run(dotnet_cmd, check=True)
        print(".NET publish completed successfully.")
        
        # Shut down build server to guarantee all file locks are released immediately
        try:
            subprocess.run(["dotnet", "build-server", "shutdown"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
    except subprocess.CalledProcessError as e:
        print(f"\n.NET publish failed with exit code: {e.returncode}")
        return
    except FileNotFoundError:
        print("\nError: 'dotnet' command not found. Please verify .NET 8 SDK installation.")
        return

    print("\n[4/4] Finalizing application distribution...")
    final_output = os.path.join("dist", "MetroRailwayERP.exe")
    
    if os.path.exists(final_output):
        dest_filename = f"MetroRailwayERP_v{version}.exe"
        dest_path = os.path.join("dist", dest_filename)
        shutil.copy2(final_output, dest_path)
        print(f"\n=======================================================")
        print("Metro Railway Kolkata S&T ERP Standalone Launcher Built!")
        print(f"Your standalone executable is ready at: {dest_path}")
        print(f"File size: {os.path.getsize(dest_path) / (1024 * 1024):.2f} MB")
        print("=======================================================")
    else:
        print(f"Error: Launcher output not found at {final_output}!")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--icon-only":
        convert_png_to_ico()
    else:
        build_executable()
