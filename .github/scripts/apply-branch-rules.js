const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

// Initialize Octokit with GitHub token
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Get repositories and organization from environment
const org = process.env.ORGANIZATION;
const repos = JSON.parse(process.env.REPOSITORIES);

// Color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
};

// Counters for summary reporting
const counters = {
  totalRepos: repos.length,
  rulesApplied: 0,
  rulesFailed: 0
};

// Load ruleset configurations from JSON files
const branchNamingRulePath = path.join(__dirname, '../configs/branch-naming-rule.json');
const preventDeleteRulePath = path.join(__dirname, '../configs/prevent-delete-rule.json');

const branchNamingRule = JSON.parse(fs.readFileSync(branchNamingRulePath, 'utf8'));
const preventDeleteRule = JSON.parse(fs.readFileSync(preventDeleteRulePath, 'utf8'));

/**
 * Create or update a ruleset in a repository
 * @param {string} repo Repository name
 * @param {object} ruleConfig Ruleset configuration
 * @returns {Promise<boolean>} Success status
 */
async function applyRuleset(repo, ruleConfig) {
  console.log(`${colors.blue}Applying ruleset '${ruleConfig.name}' to ${org}/${repo}${colors.reset}`);
  
  try {
    // Check if rule already exists
    const existingRules = await octokit.request('GET /repos/{owner}/{repo}/rulesets', {
      owner: org,
      repo: repo
    });
    
    const existingRule = existingRules.data.find(rule => rule.name === ruleConfig.name);
    
    if (existingRule) {
      console.log(`${colors.yellow}Rule '${ruleConfig.name}' already exists (ID: ${existingRule.id}). Updating...${colors.reset}`);
      
      const response = await octokit.request('PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}', {
        owner: org,
        repo: repo,
        ruleset_id: existingRule.id,
        ...ruleConfig
      });
      
      if (response.status >= 200 && response.status < 300) {
        console.log(`${colors.green}✅ Updated ruleset '${ruleConfig.name}' successfully${colors.reset}`);
        return true;
      } else {
        console.error(`${colors.red}❌ Failed to update ruleset '${ruleConfig.name}'${colors.reset}`);
        return false;
      }
    } else {
      const response = await octokit.request('POST /repos/{owner}/{repo}/rulesets', {
        owner: org,
        repo: repo,
        ...ruleConfig
      });
      
      if (response.status >= 200 && response.status < 300) {
        console.log(`${colors.green}✅ Created ruleset '${ruleConfig.name}' successfully${colors.reset}`);
        return true;
      } else {
        console.error(`${colors.red}❌ Failed to create ruleset '${ruleConfig.name}'${colors.reset}`);
        return false;
      }
    }
  } catch (error) {
    console.error(`${colors.red}❌ Error applying ruleset '${ruleConfig.name}': ${error.message}${colors.reset}`);
    if (error.response && error.response.data) {
      console.error(`${colors.red}Details: ${JSON.stringify(error.response.data, null, 2)}${colors.reset}`);
    }
    return false;
  }
}

/**
 * Process a single repository
 * @param {string} repo Repository name
 */
async function processRepository(repo) {
  console.log(`\n${colors.magenta}🔄 PROCESSING: ${org}/${repo}${colors.reset}`);
  
  let success = 0;
  
  // Apply branch naming rule
  if (await applyRuleset(repo, branchNamingRule)) {
    success++;
  }
  
  // Apply prevent deletion rule
  if (await applyRuleset(repo, preventDeleteRule)) {
    success++;
  }
  
  // Count this repository as successfully processed if at least one rule was applied
  if (success > 0) {
    counters.rulesApplied++;
    console.log(`${colors.green}✅ Successfully applied ${success}/2 rules to ${org}/${repo}${colors.reset}`);
  } else {
    counters.rulesFailed++;
    console.log(`${colors.red}❌ Failed to apply any rules to ${org}/${repo}${colors.reset}`);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log(`${colors.blue}Starting branch protection rules application for ${repos.length} repositories${colors.reset}`);
    
    // Process each repository
    for (const repo of repos) {
      await processRepository(repo);
    }
    
    // Print summary
    console.log(`\n${colors.blue}ℹ️ SUMMARY${colors.reset}`);
    console.log(`${colors.blue}ℹ️ Total repositories processed: ${counters.totalRepos}${colors.reset}`);
    console.log(`${colors.green}✅ Repositories with rules applied successfully: ${counters.rulesApplied}${colors.reset}`);
    console.log(`${colors.red}❌ Repositories with failed rule application: ${counters.rulesFailed}${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}❌ Error in main function: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the main function
main();