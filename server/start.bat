@echo off
REM Launch the Football Film Analyzer local CV server on Windows.
REM First run will create a venv and download deps (~1GB incl. torch).

cd /d "%~dp0"

if not exist ".venv" (
    echo ==^> creating virtualenv ^(.venv^)
    python -m venv .venv
    if errorlevel 1 (
        echo.
        echo ERROR: could not create virtualenv. Is Python 3.10+ installed?
        pause
        exit /b 1
    )
)

call .venv\Scripts\activate.bat

if not exist ".venv\.installed" (
    echo ==^> installing requirements ^(first run, may take a while^)
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo ERROR: pip install failed.
        pause
        exit /b 1
    )
    echo. > .venv\.installed
)

python app.py
pause
