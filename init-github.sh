#!/bin/bash

# This script helps you initialize and push the project to GitHub
# Usage: ./init-github.sh <your-github-username>

if [ $# -eq 0 ]; then
    echo "Usage: ./init-github.sh <your-github-username>"
    exit 1
fi

USERNAME=$1
REPO_NAME="client-channel-api-playground"

# Update package.json repository URL
sed -i "s|yourusername|$USERNAME|g" package.json

# Initialize git repository if not already initialized
if [ ! -d ".git" ]; then
    echo "Initializing git repository..."
    git init
else
    echo "Git repository already initialized."
fi

# Add all files to git
echo "Adding files to git..."
git add .

# Commit changes
echo "Committing changes..."
git commit -m "Initial commit"

# Add GitHub remote
echo "Adding GitHub remote..."
git remote add origin "https://github.com/$USERNAME/$REPO_NAME.git"

echo "Ready to push to GitHub!"
echo "Run the following command to push your code:"
echo "git push -u origin main"

echo ""
echo "Don't forget to create the repository on GitHub first at:"
echo "https://github.com/new"
echo "Repository name: $REPO_NAME" 