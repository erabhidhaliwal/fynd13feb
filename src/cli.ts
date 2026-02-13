import { WorkflowManager } from './services/workflow-manager.js';
import * as readline from 'readline';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
GEO Workflow CLI

Usage:
  npm run crawl -- <url> [apiKey]

Arguments:
  url     - Website URL to analyze
  apiKey  - OpenAI API key (optional, enables real LLM queries)

Examples:
  npm run crawl -- https://example.com
  npm run crawl -- https://example.com sk-xxxxxxxxxxxxxxxx
    `);
    process.exit(0);
  }

  const url = args[0];
  const apiKey = args[1];

  if (!url) {
    console.error('Error: URL is required');
    process.exit(1);
  }

  console.log(`Starting GEO workflow for: ${url}\n`);

  const workflowManager = new WorkflowManager();
  
  if (apiKey) {
    workflowManager.setOpenAIApiKey(apiKey);
    console.log('OpenAI API key configured - real LLM queries enabled\n');
  } else {
    console.log('No API key - running in simulation mode\n');
  }

  const workflowId = await workflowManager.startWorkflow(url);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  workflowManager.addListener(workflowId, (event, data) => {
    switch (event) {
      case 'workflowStarted':
        console.log(`✅ Workflow started: ${data.workflowId}`);
        console.log(`   URL: ${data.url}\n`);
        break;
        
      case 'crawlComplete':
        console.log(`✅ Step 1 Complete: Crawl`);
        console.log(`   Pages scraped: ${data.pagesCount}`);
        console.log(`   Content length: ${data.contentLength} chars\n`);
        break;
        
      case 'queriesComplete':
        console.log(`✅ Step 2 Complete: Query`);
        console.log(`   Total queries: ${data.totalQueries}`);
        console.log(`   Site mentioned: ${data.mentions} (${data.percentage.toFixed(1)}%)\n`);
        break;
        
      case 'gapsAnalyzed':
        console.log(`✅ Step 3 Complete: Gap Analysis`);
        console.log(`   Citation gaps found: ${data.gapsCount}`);
        console.log(`   Top competitors: ${data.summary.topCompetitors.slice(0, 3).join(', ')}\n`);
        break;
        
      case 'workflowComplete':
        console.log(`✅ Workflow Complete!`);
        console.log(`   Pages generated: ${data.pagesGenerated}`);
        console.log(`   Middleware: ${data.middlewarePath}\n`);
        console.log(`   Generated pages saved to: generated-pages/${workflowId}/`);
        rl.close();
        process.exit(0);
        break;
        
      case 'error':
        console.log(`❌ Error: ${data.error}\n`);
        rl.close();
        process.exit(1);
        break;
    }
  });

  process.on('SIGINT', () => {
    console.log('\n\nWorkflow interrupted by user');
    rl.close();
    process.exit(1);
  });
}

main().catch(console.error);
