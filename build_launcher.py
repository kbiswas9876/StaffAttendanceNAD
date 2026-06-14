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

def build_executable():
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
        print(f"\n=======================================================")
        print("Metro Railway Kolkata S&T ERP Standalone Launcher Built!")
        print(f"Your standalone executable is ready at: {final_output}")
        print(f"File size: {os.path.getsize(final_output) / (1024 * 1024):.2f} MB")
        print("=======================================================")
    else:
        print(f"Error: Launcher output not found at {final_output}!")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--icon-only":
        convert_png_to_ico()
    else:
        build_executable()
