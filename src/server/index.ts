import express from 'express';
import { WorkflowManager } from '../services/workflow-manager.js';
import { Phase1Orchestrator } from '../multi-agent/services/phase1-orchestrator.js';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3000;

const workflowManager = new WorkflowManager();
const phase1Orchestrator = new Phase1Orchestrator();
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

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║            GEO Workflow Server Running                      ║
║                                                            ║
║   Server: http://localhost:${PORT}                          ║
║                                                            ║
║   Endpoints:                                               ║
║   POST /api/workflow/start - Start GEO workflow            ║
║   GET  /api/workflow/:id - Get workflow status             ║
║   GET  /api/workflow/:id/pages - Get generated pages       ║
║   GET  /api/workflow/:id/middleware - Get middleware code  ║
║                                                            ║
║   Phase 1: http://localhost:${PORT}/phase1                  ║
║   POST /api/phase1/start - Start crawl                     ║
║   GET  /api/phase1/:id - Get Phase 1 status                ║
║   GET  /api/phase1/:id/knowledge-base - Get KB             ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
