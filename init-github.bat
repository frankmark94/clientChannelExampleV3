@echo off
SETLOCAL

REM This script helps you initialize and push the project to GitHub
REM Usage: init-github.bat your-github-username

IF "%~1"=="" (
    echo Usage: init-github.bat your-github-username
    exit /b 1
)

SET USERNAME=%~1
SET REPO_NAME=client-channel-api-playground

REM Initialize git repository if not already initialized
if not exist .git (
    echo Initializing git repository...
    git init
) else (
    echo Git repository already initialized.
)

REM Add all files to git
echo Adding files to git...
git add .

REM Commit changes
echo Committing changes...
git commit -m "Initial commit"

REM Add GitHub remote
echo Adding GitHub remote...
git remote add origin "https://github.com/%USERNAME%/%REPO_NAME%.git"

echo.
echo Ready to push to GitHub!
echo Run the following command to push your code:
echo git push -u origin main
echo.
echo Don't forget to create the repository on GitHub first at:
echo https://github.com/new
echo Repository name: %REPO_NAME%

ENDLOCAL 