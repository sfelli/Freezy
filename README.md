# Freeze Code Based on Dates GitHub Action

This GitHub Action checks if the current date falls within specified freeze periods and blocks merges if it does. This is useful for enforcing code freeze policies during critical times, such as holiday seasons or major release periods.

## Features

- Checks the current date against user-defined freeze periods.
- Blocks merges by failing the action if the current date is within any freeze period.
- User-friendly input format for specifying freeze periods.

## Setup

1. **Create the Workflow File**

   Add the following YAML to your repository at `.github/workflows/freeze-code.yml`:

   ```yaml
   name: Freeze Code Based on Dates

   on:
     pull_request:
       types: [opened, synchronize, reopened]
     workflow_dispatch:
       inputs:
         freeze_periods:
           description: 'Comma-separated list of freeze periods in the format start1:end1,start2:end2,... (e.g., 2024-06-01:2024-06-15,2024-12-20:2025-01-05)'
           required: true

   jobs:
     check-freeze:
       runs-on: ubuntu-latest
       steps:
       - name: Check out the code
         uses: actions/checkout@v2

       - name: Setup Node.js
         uses: actions/setup-node@v2
         with:
           node-version: '14'

       - name: Check for freeze period
         run: |
           echo "Checking for freeze period..."
           node .github/scripts/check-freeze.js
         env:
           FREEZE_PERIODS: ${{ github.event.inputs.freeze_periods }}
