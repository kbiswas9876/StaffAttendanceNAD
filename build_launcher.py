import os
import sys
import subprocess
from PIL import Image

def convert_png_to_ico():
    png_path = "ChatGPT Image Jun 14, 2026, 10_42_04 PM.png"
    ico_path = "icon.ico"
    
    print(f"Checking for source image: {png_path}...")
    if not os.path.exists(png_path):
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
            
    print("Launching PyInstaller compilation...")
    pyinstaller_cmd = [
        "pyinstaller",
        "--onefile",
        "--noconsole",
        "--icon=icon.ico",
        "--name=MetroRailwayERP",
        "--add-data=frontend/out;out",
        "--add-data=backend/database.db;.",
        "launcher.py"
    ]
    
    print(f"Running command: {' '.join(pyinstaller_cmd)}")
    try:
        # Run PyInstaller
        result = subprocess.run(pyinstaller_cmd, capture_output=False, check=True)
        print("\n=======================================================")
        print("MetroRailwayERP Launcher Compiled Successfully!")
        print("You can find the standalone executable at: dist/MetroRailwayERP.exe")
        print("=======================================================")
    except subprocess.CalledProcessError as e:
        print(f"\nPyInstaller build failed with exit code: {e.returncode}")
    except FileNotFoundError:
        print("\nError: PyInstaller command not found. Please install it using: pip install pyinstaller")

if __name__ == "__main__":
    # If build script is run with --icon-only, just do conversion
    if len(sys.argv) > 1 and sys.argv[1] == "--icon-only":
        convert_png_to_ico()
    else:
        build_executable()
