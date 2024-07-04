const { exit } = require('process');
const { Octokit } = require('@octokit/core');

// Get inputs from command line arguments
const actionType = process.argv[2]; // freeze or unfreeze
const targetBranchesInput = process.argv[3];
const timeZone = process.argv[4] || 'Europe/Paris';

async function fetchBranches() {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const { data: branches } = await octokit.request('GET /repos/{owner}/{repo}/branches', {
    owner,
    repo
  });

  return branches.map(branch => branch.name);
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

async function updatePRStatus(prs, status, description) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  for (const pr of prs) {
    const prNumber = pr.number;
    const sha = pr.head.sha;
    await octokit.request('POST /repos/{owner}/{repo}/statuses/{sha}', {
      owner,
      repo,
      sha,
      state: status,
      description: description,
      context: 'freeze-check'
    });
    console.log(`Updated PR #${prNumber} to status: ${status}`);
  }
}

async function main() {
  const targetBranches = targetBranchesInput.split(',');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  
  const prs = await getOpenPullRequests(octokit, targetBranches);
  
  if (actionType === 'freeze') {
    await updatePRStatus(prs, 'error', 'Code freeze in effect');
    console.log('All PRs have been marked as error due to code freeze.');
  } else if (actionType === 'unfreeze') {
    await updatePRStatus(prs, 'success', 'Code freeze lifted');
    console.log('All PRs have been marked as success due to code freeze being lifted.');
  } else {
    console.error(`Unknown action type: ${actionType}`);
    exit(1);
  }

  exit(0);
}

main();
