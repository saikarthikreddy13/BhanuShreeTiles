# First-time setup. Run from the project folder: .\setup.ps1
python -m venv backend\.venv
if (-not $?) { exit 1 }
& backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
& backend\.venv\Scripts\python.exe backend\scripts\migrate.py
& backend\.venv\Scripts\python.exe backend\scripts\seed.py
