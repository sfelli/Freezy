const { exit } = require('process');
const { Octokit } = require("@octokit/core");
const { existsSync } = require('fs');

const freezePeriodsInput = process.argv[2];
const targetBranchesInput = process.argv[3];

function parseFreezePeriods(input) {
  const periods = input.split(',').map(period => {
    const [start, end] = period.split(':');
    return { start, end };
  });
  return periods;
}

const freezePeriods = parseFreezePeriods(freezePeriodsInput);
const currentDateTime = new Date().toISOString();

function isWithinFreezePeriod(dateTime) {
  for (const period of freezePeriods) {
    if (dateTime >= period.start && dateTime <= period.end) {
      return true;
    }
  }
  return false;
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
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const workflowId = 'main.yml'; // Adjust this to the filename of your main workflow
  
  if (!existsSync(`.github/workflows/${workflowId}`)) {
    console.error(`Workflow file ${workflowId} does not exist.`);
    exit(1);
  }

  console.log(`Scheduling next run at: ${nextRunTime}`);
  
  // Calculate the delay until the next run
  const delay = new Date(nextRunTime).getTime() - new Date().getTime();
  setTimeout(async () => {
    try {
      await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
        owner,
        repo,
        workflow_id: workflowId,
        ref: 'main' // Adjust this to the branch you want to use
      });
      console.log('Main workflow triggered successfully for the next check.');
    } catch (error) {
      console.error(`Failed to trigger main workflow: ${error}`);
      exit(1);
    }
  }, delay);
}

let nextRunTime = null;
for (const period of freezePeriods) {
  if (new Date(period.end).getTime() > new Date().getTime()) {
    nextRunTime = period.end;
    break;
  }
}

if (isWithinFreezePeriod(currentDateTime)) {
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
