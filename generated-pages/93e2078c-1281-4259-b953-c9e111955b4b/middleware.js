/**
 * GEO Middleware - Serve optimized pages only to AI bots
 * 
 * Add this middleware to your server to serve AI-optimized content
 * only to AI bots (ChatGPT, Claude, Gemini, etc.)
 * 
 * Usage:
 *   const geoMiddleware = require('./middleware');
 *   app.use(geoMiddleware({
 *     workflowId: '93e2078c-1281-4259-b953-c9e111955b4b',
 *     generatedDir: './generated-pages/93e2078c-1281-4259-b953-c9e111955b4b'
 *   }));
 */

const fs = require('fs');
const path = require('path');

const AI_BOT_USER_AGENTS = [
  'ChatGPT-User',
  'GPTBot',
  'Claude-Web',
  'claudebot',
  'Google-Extended',
  'Bard-User',
  'Applebot-Extended',
  'OAI-SearchBot',
  'Bytespider',
  'Discordbot',
  'Slackbot',
  'Twitterbot'
];

const AI_BOT_HOSTNAMES = [
  'chatgpt.com',
  'claude.ai',
  'bard.google.com',
  'perplexity.ai',
  'you.com',
  'copilot.microsoft.com'
];

function isAI Bot(req) {
  const userAgent = req.headers['user-agent'] || '';
  const hostname = req.hostname || req.headers.host || '';
  
  // Check user agent
  for (const bot of AI_BOT_USER_AGENTS) {
    if (userAgent.includes(bot)) {
      return true;
    }
  }
  
  // Check hostname (for requests routed through AI services)
  for (const botHost of AI_BOT_HOSTNAMES) {
    if (hostname.includes(botHost)) {
      return true;
    }
  }
  
  // Check for AI-specific headers
  if (req.headers['x-ai-bot'] || req.headers['x-gpt-bot']) {
    return true;
  }
  
  return false;
}

function geoMiddleware(options) {
  const { workflowId, generatedDir } = options;
  
  return (req, res, next) => {
    // Only serve optimized content to AI bots
    if (!isAI Bot(req)) {
      return next();
    }
    
    // Get the requested path
    let requestPath = req.path;
    
    // Try to find a matching generated page
    const possibleFiles = [
      path.join(generatedDir, requestPath),
      path.join(generatedDir, requestPath + '.md'),
      path.join(generatedDir, requestPath, 'index.md')
    ];
    
    for (const filePath of possibleFiles) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Parse front matter if present
        const frontMatterMatch = content.match(/^---
([sS]*?)
---/);
        
        if (frontMatterMatch) {
          const frontMatter = frontMatterMatch[1];
          const titleMatch = frontMatter.match(/title: "([^"]+)"/);
          const descMatch = frontMatter.match(/description: "([^"]+)"/);
          
          // Set SEO headers
          if (titleMatch) {
            res.setHeader('X-GEO-Title', titleMatch[1]);
          }
          if (descMatch) {
            res.setHeader('X-GEO-Description', descMatch[1]);
          }
          
          // Serve the content
          res.setHeader('Content-Type', 'text/markdown');
          return res.send(content);
        }
        
        // No front matter, serve as-is
        res.setHeader('Content-Type', 'text/markdown');
        return res.send(content);
      }
    }
    
    // No matching page found, continue to normal routing
    next();
  };
}

module.exports = geoMiddleware;
