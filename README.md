# Fynd-AI GEO Workflow

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)

**GEO (Generative Engine Optimization) Workflow** - A multi-agent system that optimizes your website for AI/LLM citation. The system crawls your website, analyzes how it appears in AI responses, identifies gaps, and generates optimized content to improve citation rates.

## Overview

Fynd-AI helps websites get cited in AI responses (ChatGPT, Claude, Gemini, etc.) through a comprehensive 4-phase workflow:

1. **Phase 1**: Crawl & Understand - Multi-agent system that deeply analyzes your website
2. **Phase 2**: Query Analysis - Run 100+ queries on LLMs to check citation status
3. **Phase 3**: Gap Analysis - Identify where competitors are cited but you aren't
4. **Phase 4**: Optimization - Generate optimized pages + AI bot middleware

## Architecture

The project uses two implementation approaches:

### Multi-Agent Architecture (Phase 1)
```
Phase1Orchestrator
    ├── CrawlerAgent              → Crawls website, discovers pages
    ├── ContentExtractionAgent    → Extracts structured content
    ├── LinkMappingAgent          → Maps internal/external links
    ├── SchemaAnalysisAgent       → Analyzes schema.org markup
    └── KnowledgeBaseGeneratorAgent → Creates AI-readable KB
```

### Original GEO Workflow
```
WorkflowManager
    ├── CrawlerAgent         → HTML to Markdown conversion
    ├── QueryAgent           → LLM query execution
    ├── GapAnalysisAgent     → Citation gap identification
    └── PageGeneratorAgent  → Page generation + middleware
```

---

## Phase 1: Multi-Agent Crawler

The Multi-Agent Crawler is an advanced system that deeply analyzes your website to create a comprehensive knowledge base.

### Agents

#### 1. CrawlerAgent
**Role**: Website Crawler

**Capabilities**:
- Crawl submitted URL and discover pages (up to 50 pages, depth 3)
- Parse sitemap.xml for additional page discovery
- Extract page metadata (load time, status, word count)

**Process**:
1. Start from submitted URL
2. Discover internal links recursively
3. Check for sitemap.xml and parse if available
4. Return structured crawl result with all pages

#### 2. ContentExtractionAgent
**Role**: Content Extractor

**Capabilities**:
- Extract structured content from HTML pages
- Convert HTML to clean Markdown
- Extract SEO metadata (Open Graph, Twitter Cards)

**Output** (`ExtractedContent`):
```typescript
interface ExtractedContent {
  pageUrl: string;
  title: string;
  headings: Heading[];      // h1-h6 with IDs
  paragraphs: string[];      // Clean text paragraphs
  lists: string[];           // UL/OL items
  tables: TableData[];       // Structured table data
  images: ImageInfo[];       // Image src, alt, title
  codeBlocks: string[];      // Pre/code blocks
  links: LinkInfo[];         // Internal/external links
  metadata: PageMetadata;    // SEO metadata
}
```

#### 3. LinkMappingAgent
**Role**: Link Mapper

**Capabilities**:
- Map all internal links across the site
- Identify external links
- Analyze site structure and hierarchy
- Find orphan pages and broken links

**Output** (`LinkMap`):
```typescript
interface LinkMap {
  internalLinks: Map<string, string[]>;
  externalLinks: Map<string, string[]>;
  sitemaps: string[];
  brokenLinks: string[];
  orphanPages: string[];
  siteStructure: SitePage[];  // Hierarchical structure
}
```

#### 4. SchemaAnalysisAgent
**Role**: Schema Analyst

**Capabilities**:
- Detect JSON-LD and microdata schema markup
- Analyze Google rich results eligibility
- Identify missing schema opportunities

**Output** (`SchemaAnalysis`):
```typescript
interface SchemaAnalysis {
  schemaTypes: SchemaType[];     // Found schema.org types
  missingSchemas: string[];      // Recommended schemas
  richResults: RichResult[];     // Rich result eligibility
  gaps: SchemaGap[];             // Optimization opportunities
}
```

#### 5. KnowledgeBaseGeneratorAgent
**Role**: Knowledge Base Generator

**Capabilities**:
- Generate AI-readable knowledge base
- Extract key topics and entities
- Create Q&A pairs from content
- Detect industry, audience, brand voice

**Output** (`KnowledgeBase`):
```typescript
interface KnowledgeBase {
  siteSummary: SiteSummary;
  topics: Topic[];
  entities: Entity[];
  qaPairs: QAPair[];
  structuredData: any;
  generatedAt: number;
}
```

---

## Complete GEO Workflow (Phases 2-4)

After Phase 1 creates the knowledge base, the remaining phases optimize for AI citation.

### Phase 2: QueryAgent

**What it does**:
- Runs 100+ queries against LLMs (ChatGPT)
- Checks if your site appears in responses
- Identifies competitor citations

**Query Categories**:
- General: "What is {site} about?"
- Comparison: "{site} vs competitors"
- Recommendations: "Best {industry} platforms"
- How-to: "How to use {site}"
- Reviews: "{site} review"
- Pricing: "{site} pricing"

**Output**:
```typescript
interface QueryResult {
  query: string;
  llmResponse: string;
  citedUrls: string[];
  yourSiteMentioned: boolean;
  competitorsMentioned: string[];
}
```

### Phase 3: GapAnalysisAgent

**What it does**:
- Analyzes query results to find gaps
- Compares your citations vs competitors
- Ranks opportunities by importance

**Output**:
```typescript
interface CitationGap {
  query: string;
  competitors: string[];
  missingTopics: string[];
  opportunityScore: number;  // 0-1
}
```

### Phase 4: PageGeneratorAgent

**What it does**:
- Generates optimized Markdown pages for each gap
- Creates AI middleware code
- Serves optimized content only to AI bots

**Output**:
- Generated Markdown pages with frontmatter
- Middleware code (Node.js/Express)

**Middleware Usage**:
```javascript
const geoMiddleware = require('./middleware');
app.use(geoMiddleware({
  workflowId: 'xxx',
  generatedDir: './generated-pages/xxx'
}));
```

---

## API Endpoints

### Phase 1 (Multi-Agent)

```bash
# Start crawl
POST /api/phase1/start
{"url": "https://example.com"}

# Get workflow status
GET /api/phase1/:id

# Get complete results
GET /api/phase1/:id/knowledge-base
GET /api/phase1/:id/summary
GET /api/phase1/:id/crawl-result
GET /api/phase1/:id/extracted-content
GET /api/phase1/:id/link-map
GET /api/phase1/:id/schema-analysis
```

### Original Workflow

```bash
# Start workflow
POST /api/workflow/start
{"url": "https://example.com", "apiKey": "sk-..."}

# Get results
GET /api/workflow/:id
GET /api/workflow/:id/pages
GET /api/workflow/:id/middleware
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
cd fynd-ai

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### Running the Server

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start

# CLI mode
npm run cli -- https://example.com
```

### Quick Start Example

```bash
# Start server
npm run dev

# In another terminal, start a crawl
curl -X POST http://localhost:3000/api/phase1/start \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Check status
curl http://localhost:3000/api/phase1/{workflow-id}
```

---

## Technical Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.3
- **Server**: Express.js
- **Crawling**: Cheerio, Axios
- **HTML to Markdown**: Turndown
- **LLM Integration**: OpenAI SDK
- **Utilities**: UUID

### Key Dependencies

```json
{
  "dependencies": {
    "axios": "^1.6.2",
    "cheerio": "^1.0.0-rc.17",
    "express": "^4.18.2",
    "openai": "^4.24.1",
    "turndown": "^7.1.2",
    "uuid": "^9.0.1"
  }
}
```

---

## Output Formats

### Knowledge Base JSON

Generated at: `knowledge-bases/{workflow-id}/knowledge-base.json`

```json
{
  "siteSummary": {
    "name": "Example",
    "description": "Website description",
    "industry": "SaaS/Software",
    "primaryPurpose": "Lead Generation",
    "targetAudience": ["Developers", "Business Owners"],
    "keyValueProps": ["Feature 1", "Feature 2"],
    "brandVoice": "Professional & Informative"
  },
  "topics": [
    {
      "name": "Topic Name",
      "description": "Description",
      "pages": ["page-url-1"],
      "keywords": ["keyword1", "keyword2"],
      "relevance": 10
    }
  ],
  "entities": [...],
  "qaPairs": [...],
  "structuredData": {
    "stats": {
      "totalPages": 50,
      "totalHeadings": 200,
      "totalParagraphs": 500
    }
  }
}
```

### Generated Pages

Location: `generated-pages/{workflow-id}/`

Files:
- `*.md` - Optimized markdown pages
- `middleware.js` - AI bot detection middleware

---

## Project Structure

```
fynd-ai/
├── src/
│   ├── multi-agent/
│   │   ├── agents/
│   │   │   ├── base.ts                        # Base agent class
│   │   │   ├── crawler.ts                     # CrawlerAgent
│   │   │   ├── content-extraction.ts          # ContentExtractionAgent
│   │   │   ├── link-mapping.ts                # LinkMappingAgent
│   │   │   ├── schema-analysis.ts             # SchemaAnalysisAgent
│   │   │   └── knowledge-base-generator.ts    # KB Generator
│   │   ├── services/
│   │   │   └── phase1-orchestrator.ts         # Phase 1 workflow
│   │   ├── types/
│   │   │   └── index.ts                       # TypeScript interfaces
│   │   └── server.ts                          # Phase 1 API server
│   ├── agents/                                # Original GEO workflow
│   │   ├── base.ts
│   │   ├── crawler.ts
│   │   ├── query.ts
│   │   ├── gap-analysis.ts
│   │   └── page-generator.ts
│   ├── services/
│   │   └── workflow-manager.ts
│   ├── server/
│   │   └── index.ts
│   ├── types/
│   │   └── index.ts
│   └── cli.ts
├── public/
│   └── index.html                             # Web UI
├── knowledge-bases/                           # Generated KBs
├── generated-pages/                           # Generated pages
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Roadmap

### Completed
- [x] Phase 1: Multi-Agent Crawler
- [x] Knowledge Base Generation
- [x] Schema Analysis
- [x] Link Mapping
- [x] Web UI

### Planned
- [ ] Phase 2: LLM Query Integration (real API)
- [ ] Phase 3: Advanced Gap Analysis
- [ ] Phase 4: Page Generation
- [ ] Docker Support
- [ ] Cloud Deployment Scripts
- [ ] Dashboard Improvements
- [ ] Export to Various Formats

---

## License

MIT License

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
