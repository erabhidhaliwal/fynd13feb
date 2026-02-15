import express from 'express';
import { Phase1Orchestrator } from '../multi-agent/services/phase1-orchestrator.js';
import { Phase2Orchestrator } from '../multi-agent/services/phase2-orchestrator.js';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

const phase1Orchestrator = new Phase1Orchestrator();
const phase2Orchestrator = new Phase2Orchestrator();

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'phase1.html'));
});

app.get('/phase1', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'phase1.html'));
});

app.get('/phase2', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'phase2.html'));
});

// Phase 1 Endpoints
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

    const workflowId = await phase1Orchestrator.startCrawl(url);
    
    phase1Orchestrator.addListener(workflowId, (event, data) => {
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
    const workflow = phase1Orchestrator.getWorkflow(id);
    
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
    const workflow = phase1Orchestrator.getWorkflow(id);
    
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
    const workflow = phase1Orchestrator.getWorkflow(id);
    
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
    const workflow = phase1Orchestrator.getWorkflow(id);
    
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
    const workflow = phase1Orchestrator.getWorkflow(id);
    
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
    const workflow = phase1Orchestrator.getWorkflow(id);
    
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
    const workflows = phase1Orchestrator.getAllWorkflows();
    res.json({ workflows });
  } catch (error: any) {
    console.error('[Phase1 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Phase 2 Endpoints
app.get('/api/phase2/knowledge-bases', async (req, res) => {
  try {
    const kbDir = path.join(process.cwd(), 'knowledge-bases');
    
    if (!fs.existsSync(kbDir)) {
      return res.json({ knowledgeBases: [] });
    }
    
    const dirs = fs.readdirSync(kbDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const summaryPath = path.join(kbDir, dirent.name, 'summary.json');
        let summary = null;
        
        if (fs.existsSync(summaryPath)) {
          summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
        }
        
        const phase2Path = path.join(kbDir, dirent.name, 'phase2-results.json');
        const hasPhase2 = fs.existsSync(phase2Path);
        
        return {
          id: dirent.name,
          summary,
          hasPhase2
        };
      });
    
    res.json({ knowledgeBases: dirs });
    
  } catch (error: any) {
    console.error('[Phase2 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/phase2/start', async (req, res) => {
  try {
    const { knowledgeBaseId, apiKey } = req.body;
    
    if (!knowledgeBaseId) {
      return res.status(400).json({ error: 'Knowledge base ID is required' });
    }

    const workflowId = await phase2Orchestrator.startQueryAnalysis(knowledgeBaseId, apiKey);
    
    phase2Orchestrator.addListener(workflowId, (event, data) => {
      console.log(`[Phase2 API] ${event}:`, data);
    });

    res.json({ workflowId, message: 'Phase 2 workflow started' });
    
  } catch (error: any) {
    console.error('[Phase2 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase2/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = phase2Orchestrator.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    res.json(workflow);
    
  } catch (error: any) {
    console.error('[Phase2 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase2/:id/results', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = phase2Orchestrator.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    res.json({
      queries: workflow.queries,
      stats: workflow.stats
    });
    
  } catch (error: any) {
    console.error('[Phase2 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase2/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = phase2Orchestrator.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="phase2-results-${id}.json"`);
    res.send(JSON.stringify({
      workflowId: workflow.id,
      knowledgeBaseId: workflow.knowledgeBaseId,
      queries: workflow.queries,
      stats: workflow.stats,
      completedAt: workflow.completedAt
    }, null, 2));
    
  } catch (error: any) {
    console.error('[Phase2 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase2/knowledge-bases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const kbPath = path.join(process.cwd(), 'knowledge-bases', id, 'knowledge-base.json');
    
    if (!fs.existsSync(kbPath)) {
      return res.status(404).json({ error: 'Knowledge base not found' });
    }
    
    const kb = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
    res.json(kb);
    
  } catch (error: any) {
    console.error('[Phase2 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/phase2/knowledge-bases/:id/phase2-results', async (req, res) => {
  try {
    const { id } = req.params;
    const resultsPath = path.join(process.cwd(), 'knowledge-bases', id, 'phase2-results.json');
    
    if (!fs.existsSync(resultsPath)) {
      return res.status(404).json({ error: 'Phase 2 results not found for this knowledge base' });
    }
    
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    res.json(results);
    
  } catch (error: any) {
    console.error('[Phase2 API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              Fynd AI - GEO Workflow System                      ║
║                                                                 ║
║   Server: http://localhost:${PORT}                                ║
║   Phase 1: http://localhost:${PORT}/phase1                       ║
║   Phase 2: http://localhost:${PORT}/phase2                       ║
║                                                                 ║
║   Phase 1 API Endpoints:                                        ║
║   POST /api/phase1/start           - Start crawl                ║
║   GET  /api/phase1/:id             - Get workflow status        ║
║   GET  /api/phase1/:id/knowledge-base - Get KB                 ║
║                                                                 ║
║   Phase 2 API Endpoints:                                        ║
║   GET  /api/phase2/knowledge-bases  - List knowledge bases      ║
║   POST /api/phase2/start            - Start query analysis      ║
║   GET  /api/phase2/:id              - Get workflow status        ║
║   GET  /api/phase2/:id/results      - Get query results         ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;