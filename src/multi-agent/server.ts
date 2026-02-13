import express from 'express';
import { Phase1Orchestrator } from '../multi-agent/services/phase1-orchestrator.js';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

const orchestrator = new Phase1Orchestrator();

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'phase1.html'));
});

app.post('/api/phase1/start', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const workflowId = await orchestrator.startCrawl(url);
    
    orchestrator.addListener(workflowId, (event, data) => {
      console.log(`[Phase1 API] ${event}:`, data);
    });

    res.json({ workflowId, message: 'Phase 1 workflow started' });
    
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase1/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = orchestrator.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    res.json(workflow);
    
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase1/:id/knowledge-base', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = orchestrator.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    if (!workflow.data.knowledgeBase) {
      return res.status(404).json({ error: 'Knowledge base not yet generated' });
    }
    
    res.json(workflow.data.knowledgeBase);
    
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase1/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const kbPath = path.join(process.cwd(), 'knowledge-bases', id, 'summary.json');
    
    if (!fs.existsSync(kbPath)) {
      return res.status(404).json({ error: 'Knowledge base summary not found' });
    }
    
    const summary = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
    res.json(summary);
    
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase1/:id/crawl-result', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = orchestrator.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    if (!workflow.data.crawlResult) {
      return res.status(404).json({ error: 'Crawl result not yet available' });
    }
    
    res.json(workflow.data.crawlResult);
    
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase1/:id/extracted-content', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = orchestrator.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    if (!workflow.data.extractedContent) {
      return res.status(404).json({ error: 'Extracted content not yet available' });
    }
    
    const { limit = 10, offset = 0 } = req.query;
    const content = workflow.data.extractedContent;
    const paginated = content.slice(Number(offset), Number(offset) + Number(limit));
    
    res.json({
      total: content.length,
      limit: Number(limit),
      offset: Number(offset),
      pages: paginated
    });
    
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase1/:id/link-map', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = orchestrator.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    if (!workflow.data.linkMap) {
      return res.status(404).json({ error: 'Link map not yet available' });
    }
    
    res.json(workflow.data.linkMap);
    
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase1/:id/schema-analysis', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = orchestrator.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    if (!workflow.data.schemaAnalysis) {
      return res.status(404).json({ error: 'Schema analysis not yet available' });
    }
    
    res.json(workflow.data.schemaAnalysis);
    
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase1', async (req, res) => {
  try {
    const workflows = orchestrator.getAllWorkflows();
    res.json({ workflows });
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║            Fynd AI - Phase 1: Multi-Agent Crawler              ║
║                                                               ║
║   Server: http://localhost:${PORT}                              ║
║   Phase 1 API: http://localhost:${PORT}/api/phase1             ║
║                                                               ║
║   Endpoints:                                                  ║
║   POST /api/phase1/start    - Start crawl                     ║
║   GET  /api/phase1/:id      - Get workflow status             ║
║   GET  /api/phase1/:id/knowledge-base - Get KB               ║
║   GET  /api/phase1/:id/summary       - Get summary           ║
║   GET  /api/phase1/:id/crawl-result   - Get crawl result     ║
║   GET  /api/phase1/:id/extracted-content - Get content       ║
║   GET  /api/phase1/:id/link-map       - Get link map         ║
║   GET  /api/phase1/:id/schema-analysis - Get schema         ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
