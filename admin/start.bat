@echo off
REM Optional helper to install deps and run dev
if not exist node_modules (
  npm install
)
npm run dev
