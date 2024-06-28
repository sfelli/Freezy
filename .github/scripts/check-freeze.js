const { exit } = require('process');
const { Octokit } = require("@octokit/core");

const freezePeriodsInput = process.argv[2];

function parseFreezePeriods(input) {
  const periods = input.split(',').map(period => {
    const [start, end] = period.split(':');
    return { start, end };
  });
  return periods;
}

const freezePeriods = parseFreezePeriods(freezePeriodsInput);
const currentDate = new Date().toISOString().split('T')[0];

function isWithinFreezePeriod(date) {
  for (const period of freezePeriods) {
    if (date >= period.start && date <= period.end) {
      return true;
    }
  }
  return false;
}

async function getOpenPullRequests(octokit) {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const { data: pullRequests } = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    state: 'open'
  });
  return pullRequests;
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

if (isWithinFreezePeriod(currentDate)) {
  console.log(`Code freeze in effect! Current date ${currentDate} is within a freeze period.`);

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  getOpenPullRequests(octokit).then(prs => {
    failOpenPullRequests(prs).then(() => {
      exit(1); // Exit with a non-zero code to fail the action
    }).catch(error => {
      console.error(`Failed to update PR statuses: ${error}`);
      exit(1);
    });
  }).catch(error => {
    console.error(`Failed to fetch open PRs: ${error}`);
    exit(1);
  });
} else {
  console.log(`No code freeze. Current date ${currentDate} is outside of freeze periods.`);
  exit(0);
}
