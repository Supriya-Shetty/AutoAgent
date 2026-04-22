#!/bin/bash
cd "$(dirname "$0")"

echo "Checking for virtual environment..."
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt --use-deprecated=legacy-resolver

echo "Starting the application..."
python main.py
