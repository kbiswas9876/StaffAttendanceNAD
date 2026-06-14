# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['backend/main.py'],
    pathex=[],
    binaries=[],
    datas=[('frontend/out', 'out'), ('backend/database.db', '.')],
    hiddenimports=[
        'uvicorn', 
        'sqlite3', 
        'pandas', 
        'xlsxwriter', 
        'reportlab',
        'reportlab.lib.pagesizes',
        'reportlab.lib.colors',
        'reportlab.platypus',
        'reportlab.lib.styles',
        'reportlab.pdfgen.canvas'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
