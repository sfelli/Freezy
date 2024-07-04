const { exit } = require('process');
const { Octokit } = require('@octokit/core');
const { existsSync } = require('fs');
const moment = require('moment-timezone');

// Get inputs from command line arguments
const startDate = process.argv[2];
const endDate = process.argv[3];
const targetBranchesInput = process.argv[4];
const timeZone = process.argv[5] || 'Europe/Paris';

async function fetchBranches() {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const { data: branches } = await octokit.request('GET /repos/{owner}/{repo}/branches', {
    owner,
    repo
  });

  return branches.map(branch => branch.name);
}

function validateDateTime(dateTime) {
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  return dateTimeRegex.test(dateTime);
}

function isWithinFreezePeriod(dateTime, start, end) {
  return dateTime >= start && dateTime <= end;
}

async function getOpenPullRequests(octokit, targetBranches) {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  let allPullRequests = [];

  for (const branch of targetBranches) {
    const { data: pullRequests } = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      state: 'open',
      base: branch
    });
    allPullRequests = allPullRequests.concat(pullRequests);
  }
  
  return allPullRequests;
}

async function failOpenPullRequests(prs) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  for (const pr of prs) {
    const prNumber = pr.number;
    const sha = pr.head.sha;
    await octokit.request('POST /repos/{owner}/{repo}/statuses/{sha}', {
      owner,
      repo,
      sha,
      state: 'error',
      description: 'Code freeze in effect',
      context: 'freeze-check'
    });
    console.log(`Failed PR #${prNumber}`);
  }
}

async function scheduleNextRun(nextRunTime) {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const workflowId = 'main.yml'; // Adjust this to the filename of your main workflow

  if (!existsSync(`.github/workflows/${workflowId}`)) {
    console.error(`Workflow file ${workflowId} does not exist.`);
    exit(1);
  }

  console.log(`Scheduling next run at: ${nextRunTime}`);

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const delay = new Date(nextRunTime).getTime() - new Date().getTime();

  setTimeout(async () => {
    try {
      await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
        owner,
        repo,
        workflow_id,
        ref: 'main' // Adjust this to the branch you want to use
      });
      console.log('Main workflow triggered successfully for the next check.');
    } catch (error) {
      console.error(`Failed to trigger main workflow: ${error}`);
      exit(1);
    }
  }, delay);
}

async function main() {
  if (!targetBranchesInput) {
    const branches = await fetchBranches();
    const branchesList = branches.join(',');
    console.log(`Fetched branches: ${branchesList}`);
    console.log('Please use the fetched branches in the next step for target_branches input.');
    return;
  }

  // Validate date-time format
  if (!validateDateTime(startDate) || !validateDateTime(endDate)) {
    console.error(`Invalid date-time format: ${startDate} or ${endDate}. Please use the format YYYY-MM-DDTHH:MM.`);
    exit(1);
  }

  const freezePeriod = { start: startDate, end: endDate };
  const currentDateTime = moment().tz(timeZone).format('YYYY-MM-DDTHH:mm');
  console.log(`Current date and time in ${timeZone}: ${currentDateTime}`);

  let nextRunTime = null;
  if (new Date(freezePeriod.end).getTime() > new Date().getTime()) {
    nextRunTime = freezePeriod.end;
  }

  if (isWithinFreezePeriod(currentDateTime, freezePeriod.start, freezePeriod.end)) {
    console.log(`Code freeze in effect! Current date and time ${currentDateTime} is within a freeze period.`);

    const targetBranches = targetBranchesInput.split(',');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    getOpenPullRequests(octokit, targetBranches).then(prs => {
      failOpenPullRequests(prs).then(() => {
        if (nextRunTime) {
          scheduleNextRun(nextRunTime).then(() => {
            exit(1); // Exit with a non-zero code to fail the action
          }).catch(error => {
            console.error(`Failed to schedule next run: ${error}`);
            exit(1);
          });
        } else {
          exit(1);
        }
      }).catch(error => {
        console.error(`Failed to update PR statuses: ${error}`);
        exit(1);
      });
    }).catch(error => {
      console.error(`Failed to fetch open PRs: ${error}`);
      exit(1);
    });
  } else {
    console.log(`No code freeze. Current date and time ${currentDateTime} is outside of freeze periods.`);
    if (nextRunTime) {
      scheduleNextRun(nextRunTime).then(() => {
        exit(0);
      }).catch(error => {
        console.error(`Failed to schedule next run: ${error}`);
        exit(1);
      });
    } else {
      exit(0);
    }
  }
}

main();
