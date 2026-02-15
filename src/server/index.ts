import express from 'express';
import { WorkflowManager } from '../services/workflow-manager.js';
import { Phase1Orchestrator } from '../multi-agent/services/phase1-orchestrator.js';
import { Phase2Orchestrator } from '../multi-agent/services/phase2-orchestrator.js';
import { Phase3Orchestrator } from '../multi-agent/services/phase3-orchestrator.js';
import { Phase4Orchestrator } from '../multi-agent/services/phase4-orchestrator.js';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3000;

const workflowManager = new WorkflowManager();
const phase1Orchestrator = new Phase1Orchestrator();
const phase2Orchestrator = new Phase2Orchestrator();
const phase3Orchestrator = new Phase3Orchestrator();
const phase4Orchestrator = new Phase4Orchestrator();
const outputDir = process.env.OUTPUT_DIR || './generated-pages';
workflowManager.setOutputDirectory(outputDir);

if (process.env.OPENAI_API_KEY) {
  workflowManager.setOpenAIApiKey(process.env.OPENAI_API_KEY);
}

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.post('/api/workflow/start', async (req, res) => {
  try {
    const { url, apiKey } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    if (apiKey) {
      workflowManager.setOpenAIApiKey(apiKey);
    }
    
    const workflowId = await workflowManager.startWorkflow(url);
    
    workflowManager.addListener(workflowId, (event, data) => {
      console.log(`[API] Workflow ${workflowId}: ${event}`, data);
    });
    
    res.json({ workflowId, message: 'Workflow started' });
    
  } catch (error: any) {
    console.error('[API] Error starting workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/workflow/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await workflowManager.getWorkflowStatus(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    res.json(workflow);
    
  } catch (error: any) {
    console.error('[API] Error getting workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/workflow/:id/pages', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await workflowManager.getWorkflowStatus(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const pagesDir = path.join(outputDir, id);
    
    if (!fs.existsSync(pagesDir)) {
      return res.json({ pages: [] });
    }
    
    const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.md'));
    const pages = files.map(file => {
      const content = fs.readFileSync(path.join(pagesDir, file), 'utf-8');
      const titleMatch = content.match(/title: "([^"]+)"/);
      const descMatch = content.match(/description: "([^"]+)"/);
      const scoreMatch = content.match(/opportunityScore: ([\d.]+)/);
      
      return {
        fileName: file,
        title: titleMatch ? titleMatch[1] : file,
        description: descMatch ? descMatch[1] : '',
        opportunityScore: scoreMatch ? parseFloat(scoreMatch[1]) : 0
      };
    });
    
    res.json({ pages });
    
  } catch (error: any) {
    console.error('[API] Error getting pages:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/workflow/:id/page/:fileName', async (req, res) => {
  try {
    const { id, fileName } = req.params;
    const filePath = path.join(outputDir, id, fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    res.type('text/markdown').send(content);
    
  } catch (error: any) {
    console.error('[API] Error getting page:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/workflow/:id/middleware', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await workflowManager.getWorkflowStatus(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const middlewarePath = path.join(outputDir, id, 'middleware.js');
    
    if (!fs.existsSync(middlewarePath)) {
      return res.status(404).json({ error: 'Middleware not found' });
    }
    
    const content = fs.readFileSync(middlewarePath, 'utf-8');
    res.type('application/javascript').send(content);
    
  } catch (error: any) {
    console.error('[API] Error getting middleware:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/workflows', async (req, res) => {
  try {
    const workflows = workflowManager.getAllWorkflows();
    res.json({ workflows });
  } catch (error: any) {
    console.error('[API] Error getting workflows:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/phase1', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'phase1.html'));
});

app.post('/api/phase1/start', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }
    
    const workflowId = await phase1Orchestrator.startCrawl(url);
    res.json({ workflowId, message: 'Phase 1 workflow started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase1/:id', (req, res) => {
  const workflow = phase1Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json(workflow);
});

app.get('/api/phase1/:id/knowledge-base', (req, res) => {
  const workflow = phase1Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  if (!workflow.data.knowledgeBase) return res.status(404).json({ error: 'Knowledge base not yet generated' });
  res.json(workflow.data.knowledgeBase);
});

app.get('/api/phase1/:id/summary', (req, res) => {
  const kbPath = path.join(process.cwd(), 'knowledge-bases', req.params.id, 'summary.json');
  if (!fs.existsSync(kbPath)) return res.status(404).json({ error: 'Summary not found' });
  res.json(JSON.parse(fs.readFileSync(kbPath, 'utf-8')));
});

app.get('/api/phase1/:id/crawl-result', (req, res) => {
  const workflow = phase1Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  if (!workflow.data.crawlResult) return res.status(404).json({ error: 'Crawl result not yet available' });
  res.json(workflow.data.crawlResult);
});

app.get('/api/phase1/:id/extracted-content', (req, res) => {
  const workflow = phase1Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  if (!workflow.data.extractedContent) return res.status(404).json({ error: 'Content not yet available' });
  const { limit = 10, offset = 0 } = req.query;
  const content = workflow.data.extractedContent;
  res.json({ total: content.length, limit: Number(limit), offset: Number(offset), pages: content.slice(Number(offset), Number(offset) + Number(limit)) });
});

app.get('/api/phase1/:id/link-map', (req, res) => {
  const workflow = phase1Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  if (!workflow.data.linkMap) return res.status(404).json({ error: 'Link map not yet available' });
  res.json(workflow.data.linkMap);
});

app.get('/api/phase1/:id/schema-analysis', (req, res) => {
  const workflow = phase1Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  if (!workflow.data.schemaAnalysis) return res.status(404).json({ error: 'Schema analysis not yet available' });
  res.json(workflow.data.schemaAnalysis);
});

app.get('/api/phase1', (req, res) => {
  res.json({ workflows: phase1Orchestrator.getAllWorkflows() });
});

app.get('/phase2', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'phase2.html'));
});

app.get('/api/phase2/knowledge-bases', (req, res) => {
  const kbDir = path.join(process.cwd(), 'knowledge-bases');
  if (!fs.existsSync(kbDir)) return res.json({ knowledgeBases: [] });
  
  const dirs = fs.readdirSync(kbDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const summaryPath = path.join(kbDir, dirent.name, 'summary.json');
      let summary = null;
      if (fs.existsSync(summaryPath)) {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      }
      const phase2Path = path.join(kbDir, dirent.name, 'phase2-results.json');
      return { id: dirent.name, summary, hasPhase2: fs.existsSync(phase2Path) };
    });
  res.json({ knowledgeBases: dirs });
});

app.post('/api/phase2/start', async (req, res) => {
  try {
    const { knowledgeBaseId, apiKey } = req.body;
    if (!knowledgeBaseId) return res.status(400).json({ error: 'Knowledge base ID is required' });
    
    const workflowId = await phase2Orchestrator.startQueryAnalysis(knowledgeBaseId, apiKey);
    phase2Orchestrator.addListener(workflowId, (event, data) => {
      console.log(`[Phase2 API] ${event}:`, data);
    });
    res.json({ workflowId, message: 'Phase 2 workflow started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase2/:id', (req, res) => {
  const workflow = phase2Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json(workflow);
});

app.get('/api/phase2/:id/results', (req, res) => {
  const workflow = phase2Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json({ queries: workflow.queries, stats: workflow.stats });
});

app.get('/api/phase2/:id/export', (req, res) => {
  const workflow = phase2Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="phase2-results-${req.params.id}.json"`);
  res.send(JSON.stringify({
    workflowId: workflow.id,
    knowledgeBaseId: workflow.knowledgeBaseId,
    queries: workflow.queries,
    stats: workflow.stats,
    completedAt: workflow.completedAt
  }, null, 2));
});

app.get('/api/phase2/knowledge-bases/:id', (req, res) => {
  const kbPath = path.join(process.cwd(), 'knowledge-bases', req.params.id, 'knowledge-base.json');
  if (!fs.existsSync(kbPath)) return res.status(404).json({ error: 'Knowledge base not found' });
  res.json(JSON.parse(fs.readFileSync(kbPath, 'utf-8')));
});

app.get('/api/phase2/knowledge-bases/:id/phase2-results', (req, res) => {
  const resultsPath = path.join(process.cwd(), 'knowledge-bases', req.params.id, 'phase2-results.json');
  if (!fs.existsSync(resultsPath)) return res.status(404).json({ error: 'Phase 2 results not found' });
  res.json(JSON.parse(fs.readFileSync(resultsPath, 'utf-8')));
});

// Phase 3 API Endpoints
app.get('/api/phase3/knowledge-bases', (req, res) => {
  const kbDir = path.join(process.cwd(), 'knowledge-bases');
  if (!fs.existsSync(kbDir)) return res.json({ knowledgeBases: [] });
  
  const dirs = fs.readdirSync(kbDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const summaryPath = path.join(kbDir, dirent.name, 'summary.json');
      let summary = null;
      if (fs.existsSync(summaryPath)) {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      }
      const phase2Path = path.join(kbDir, dirent.name, 'phase2-results.json');
      const phase3Path = path.join(kbDir, dirent.name, 'phase3-results.json');
      return { 
        id: dirent.name, 
        summary, 
        hasPhase2: fs.existsSync(phase2Path),
        hasPhase3: fs.existsSync(phase3Path)
      };
    });
  res.json({ knowledgeBases: dirs });
});

app.post('/api/phase3/start', async (req, res) => {
  try {
    const { knowledgeBaseId, phase2WorkflowId } = req.body;
    if (!knowledgeBaseId) return res.status(400).json({ error: 'Knowledge base ID is required' });
    
    const workflowId = await phase3Orchestrator.startGapAnalysis(knowledgeBaseId, phase2WorkflowId);
    phase3Orchestrator.addListener(workflowId, (event, data) => {
      console.log(`[Phase3 API] ${event}:`, data);
    });
    res.json({ workflowId, message: 'Phase 3 gap analysis started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase3/:id', (req, res) => {
  const workflow = phase3Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json(workflow);
});

app.get('/api/phase3/:id/results', (req, res) => {
  const workflow = phase3Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json({ gaps: workflow.gaps, stats: workflow.stats, recommendations: workflow.recommendations });
});

app.get('/api/phase3/:id/export', (req, res) => {
  const workflow = phase3Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="phase3-results-${req.params.id}.json"`);
  res.send(JSON.stringify(workflow, null, 2));
});

app.get('/api/phase3/knowledge-bases/:id/phase3-results', (req, res) => {
  const resultsPath = path.join(process.cwd(), 'knowledge-bases', req.params.id, 'phase3-results.json');
  if (!fs.existsSync(resultsPath)) return res.status(404).json({ error: 'Phase 3 results not found' });
  res.json(JSON.parse(fs.readFileSync(resultsPath, 'utf-8')));
});

// Phase 4 API Endpoints
app.get('/api/phase4/knowledge-bases', (req, res) => {
  const kbDir = path.join(process.cwd(), 'knowledge-bases');
  if (!fs.existsSync(kbDir)) return res.json({ knowledgeBases: [] });
  
  const dirs = fs.readdirSync(kbDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const summaryPath = path.join(kbDir, dirent.name, 'summary.json');
      let summary = null;
      if (fs.existsSync(summaryPath)) {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      }
      const phase2Path = path.join(kbDir, dirent.name, 'phase2-results.json');
      const phase3Path = path.join(kbDir, dirent.name, 'phase3-results.json');
      const phase4Path = path.join(kbDir, dirent.name, 'phase4-results.json');
      const generatedPagesPath = path.join(process.cwd(), 'generated-pages', dirent.name);
      return { 
        id: dirent.name, 
        summary, 
        hasPhase2: fs.existsSync(phase2Path),
        hasPhase3: fs.existsSync(phase3Path),
        hasPhase4: fs.existsSync(phase4Path),
        hasGeneratedPages: fs.existsSync(generatedPagesPath)
      };
    });
  res.json({ knowledgeBases: dirs });
});

app.post('/api/phase4/start', async (req, res) => {
  try {
    const { knowledgeBaseId, phase3WorkflowId, apiKey } = req.body;
    if (!knowledgeBaseId) return res.status(400).json({ error: 'Knowledge base ID is required' });
    
    const workflowId = await phase4Orchestrator.startPageGeneration(knowledgeBaseId, phase3WorkflowId, apiKey);
    phase4Orchestrator.addListener(workflowId, (event, data) => {
      console.log(`[Phase4 API] ${event}:`, data);
    });
    res.json({ workflowId, message: 'Phase 4 page generation started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase4/:id', (req, res) => {
  const workflow = phase4Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json(workflow);
});

app.get('/api/phase4/:id/results', (req, res) => {
  const workflow = phase4Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json({ 
    pages: workflow.pages, 
    middleware: workflow.middleware, 
    stats: workflow.stats 
  });
});

app.get('/api/phase4/:id/export', (req, res) => {
  const workflow = phase4Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="phase4-results-${req.params.id}.json"`);
  res.send(JSON.stringify(workflow, null, 2));
});

app.get('/api/phase4/:id/pages', (req, res) => {
  const workflow = phase4Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json({ pages: workflow.pages.map(p => ({ id: p.id, title: p.title, category: p.category, targetQuery: p.targetQuery, filePath: p.filePath })) });
});

app.get('/api/phase4/:id/middleware', (req, res) => {
  const workflow = phase4Orchestrator.getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.setHeader('Content-Type', 'application/javascript');
  res.send(workflow.middleware.code);
});

app.get('/api/phase4/knowledge-bases/:id/pages', (req, res) => {
  const pagesDir = path.join(process.cwd(), 'generated-pages', req.params.id);
  if (!fs.existsSync(pagesDir)) return res.json({ pages: [] });
  
  const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.md'));
  const pages = files.map(file => {
    const content = fs.readFileSync(path.join(pagesDir, file), 'utf-8');
    const titleMatch = content.match(/title: "([^"]+)"/);
    const catMatch = content.match(/category: "([^"]+)"/);
    return { 
      fileName: file, 
      title: titleMatch ? titleMatch[1] : file,
      category: catMatch ? catMatch[1] : 'general'
    };
  });
  res.json({ pages });
});

app.get('/api/phase4/knowledge-bases/:id/pages/:fileName', (req, res) => {
  const filePath = path.join(process.cwd(), 'generated-pages', req.params.id, req.params.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Page not found' });
  res.setHeader('Content-Type', 'text/markdown');
  res.send(fs.readFileSync(filePath, 'utf-8'));
});

app.get('/api/phase4/knowledge-bases/:id/middleware', (req, res) => {
  const middlewarePath = path.join(process.cwd(), 'generated-pages', req.params.id, 'middleware.js');
  if (!fs.existsSync(middlewarePath)) return res.status(404).json({ error: 'Middleware not found' });
  res.setHeader('Content-Type', 'application/javascript');
  res.send(fs.readFileSync(middlewarePath, 'utf-8'));
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              Fynd AI - GEO Workflow System                    ║
║                                                              ║
║   Server: http://localhost:${PORT}                            ║
║                                                              ║
║   Phase 1 API:                                               ║
║   POST /api/phase1/start - Start website crawl               ║
║   GET  /api/phase1/:id - Get workflow status                 ║
║                                                              ║
║   Phase 2 API:                                               ║
║   GET  /api/phase2/knowledge-bases - List knowledge bases    ║
║   POST /api/phase2/start - Start query analysis              ║
║                                                              ║
║   Phase 3 API:                                               ║
║   POST /api/phase3/start - Start gap analysis                ║
║   GET  /api/phase3/:id/results - Get gap analysis results    ║
║                                                              ║
║   Phase 4 API:                                               ║
║   POST /api/phase4/start - Start page generation            ║
║   GET  /api/phase4/:id/results - Get generated pages        ║
║   GET  /api/phase4/:id/middleware - Get middleware code     ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
