import { BaseAgent } from './base.js';
import { AgentConfig, AgentCapability, ExtractedContent, SchemaAnalysis, SchemaType, RichResult, SchemaGap } from '../types/index.js';
import * as cheerio from 'cheerio';

const DEFAULT_CAPABILITIES: AgentCapability[] = [
  {
    name: 'analyzeSchema',
    description: 'Analyze JSON-LD and microdata schema markup',
    inputSchema: { pages: 'array' },
    outputSchema: { schemaAnalysis: 'object' }
  },
  {
    name: 'detectRichResults',
    description: 'Detect Google rich results eligibility',
    inputSchema: { schemaTypes: 'array' },
    outputSchema: { richResults: 'array' }
  },
  {
    name: 'identifyGaps',
    description: 'Identify missing schema opportunities',
    inputSchema: { existingSchemas: 'array', siteContent: 'object' },
    outputSchema: { gaps: 'array' }
  }
];

const RECOMMENDED_SCHEMAS: Record<string, { type: string; importance: 'high' | 'medium' | 'low'; reason: string }> = {
  organization: {
    type: 'Organization',
    importance: 'high',
    reason: 'Essential for brand visibility and knowledge panel'
  },
  website: {
    type: 'WebSite',
    importance: 'high',
    reason: 'Required for search console and sitelinks'
  },
  breadcrumbList: {
    type: 'BreadcrumbList',
    importance: 'high',
    reason: 'Improves navigation and SERP appearance'
  },
  localBusiness: {
    type: 'LocalBusiness',
    importance: 'medium',
    reason: 'Critical for local SEO if you have a physical location'
  },
  product: {
    type: 'Product',
    importance: 'medium',
    reason: 'Enables rich product snippets in search'
  },
  faq: {
    type: 'FAQPage',
    importance: 'medium',
    reason: 'Generates rich results with expanded snippets'
  },
  article: {
    type: 'Article',
    importance: 'medium',
    reason: 'Enables rich results for blog posts and news'
  },
  video: {
    type: 'VideoObject',
    importance: 'low',
    reason: 'Enables video rich results'
  },
  review: {
    type: 'Review',
    importance: 'low',
    reason: 'Shows star ratings in search results'
  },
  howTo: {
    type: 'HowTo',
    importance: 'low',
    reason: 'Creates step-by-step rich results'
  },
  person: {
    type: 'Person',
    importance: 'medium',
    reason: 'Important for personal brands and team pages'
  },
  contactPage: {
    type: 'ContactPage',
    importance: 'medium',
    reason: 'Helps search engines understand contact information'
  },
  aboutPage: {
    type: 'AboutPage',
    importance: 'medium',
    reason: 'Provides organizational information'
  },
  service: {
    type: 'Service',
    importance: 'medium',
    reason: 'Enables service-rich results'
  }
};

export class SchemaAnalysisAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      name: 'SchemaAnalysisAgent',
      role: 'Schema Analyst',
      description: 'Analyzes schema.org markup and identifies gaps for rich results',
      capabilities: DEFAULT_CAPABILITIES
    };
    super(config);
  }

  async process(input: any): Promise<SchemaAnalysis> {
    const { pages, extractedContent } = input;
    
    console.log(`[SchemaAnalysisAgent] Analyzing schema markup across ${pages.length} pages`);

    const schemaTypes = this.detectSchemaTypes(pages);
    const richResults = this.detectRichResults(schemaTypes);
    const gaps = this.identifyGaps(schemaTypes, extractedContent);

    const analysis: SchemaAnalysis = {
      schemaTypes,
      missingSchemas: gaps.map(g => g.recommended),
      richResults,
      gaps
    };

    console.log(`[SchemaAnalysisAgent] Analysis complete:`);
    console.log(`  - Schema types found: ${schemaTypes.length}`);
    console.log(`  - Rich results possible: ${richResults.filter(r => r.detected).length}`);
    console.log(`  - Gaps identified: ${gaps.length}`);

    this.setContext('schemaAnalysis', analysis);
    return analysis;
  }

  private detectSchemaTypes(pages: any[]): SchemaType[] {
    const schemaTypes: SchemaType[] = [];
    const seenTypes = new Set<string>();

    for (const page of pages) {
      try {
        const $ = cheerio.load(page.html || '');
        
        const jsonLdScripts = $('script[type="application/ld+json"]');
        jsonLdScripts.each((_, el) => {
          try {
            const content = $(el).html();
            if (content) {
              const data = JSON.parse(content);
              this.extractSchemaTypes(data, page.url, seenTypes, schemaTypes);
            }
          } catch {}
        });
        
        const microdataElements = $('[itemscope]');
        microdataElements.each((_, el) => {
          const itemType = $(el).attr('itemtype');
          if (itemType) {
            const type = itemType.replace('https://schema.org/', '');
            if (!seenTypes.has(type)) {
              seenTypes.add(type);
              schemaTypes.push({
                type,
                url: page.url,
                properties: this.extractMicrodataProperties($(el))
              });
            }
          }
        });

      } catch {}
    }

    return schemaTypes;
  }

  private extractSchemaTypes(data: any, url: string, seenTypes: Set<string>, schemaTypes: SchemaType[]): void {
    if (!data) return;

    if (Array.isArray(data)) {
      for (const item of data) {
        this.extractSchemaTypes(item, url, seenTypes, schemaTypes);
      }
      return;
    }

    if (data['@type']) {
      const type = Array.isArray(data['@type']) ? data['@type'][0] : data['@type'];
      const cleanType = type.replace('https://schema.org/', '').replace('http://schema.org/', '');

      if (!seenTypes.has(cleanType)) {
        seenTypes.add(cleanType);
        schemaTypes.push({
          type: cleanType,
          url,
          properties: Object.keys(data).filter(k => !k.startsWith('@'))
        });
      }
    }

    if (data['@graph'] && Array.isArray(data['@graph'])) {
      for (const item of data['@graph']) {
        this.extractSchemaTypes(item, url, seenTypes, schemaTypes);
      }
    }
  }

  private extractMicrodataProperties($el: cheerio.Cheerio): string[] {
    const properties: string[] = [];
    
    $el.find('[itemprop]').each((_, el) => {
      const prop = $(el).attr('itemprop');
      if (prop) {
        properties.push(prop);
      }
    });
    
    return [...new Set(properties)];
  }

  private detectRichResults(schemaTypes: SchemaType[]): RichResult[] {
    const typeSet = new Set(schemaTypes.map(s => s.type.toLowerCase()));
    
    const richResultTypes = [
      { type: 'Organization', required: ['Organization', 'Corporation', 'LocalBusiness'], valid: false },
      { type: 'WebSite', required: ['WebSite'], valid: false },
      { type: 'BreadcrumbList', required: ['BreadcrumbList'], valid: false },
      { type: 'FAQPage', required: ['FAQPage'], valid: false },
      { type: 'Article', required: ['Article', 'BlogPosting', 'NewsArticle'], valid: false },
      { type: 'Product', required: ['Product'], valid: false },
      { type: 'Review', required: ['Review', 'AggregateRating'], valid: false },
      { type: 'Recipe', required: ['Recipe'], valid: false },
      { type: 'VideoObject', required: ['VideoObject'], valid: false },
      { type: 'Course', required: ['Course'], valid: false },
      { type: 'Event', required: ['Event'], valid: false },
      { type: 'HowTo', required: ['HowTo'], valid: false },
      { type: 'JobPosting', required: ['JobPosting'], valid: false },
      { type: 'SoftwareApplication', required: ['SoftwareApplication'], valid: false },
      { type: 'Book', required: ['Book'], valid: false },
      { type: 'Movie', required: ['Movie'], valid: false },
      { type: 'Person', required: ['Person'], valid: false }
    ];

    const results: RichResult[] = [];
    
    for (const richType of richResultTypes) {
      const detected = richType.required.some(req => 
        typeSet.has(req.toLowerCase())
      );
      
      results.push({
        type: richType.type,
        detected,
        valid: detected
      });
    }

    return results;
  }

  private identifyGaps(schemaTypes: SchemaType[], extractedContent: any[]): SchemaGap[] {
    const existingTypes = new Set(schemaTypes.map(s => s.type.toLowerCase()));
    const gaps: SchemaGap[] = [];

    const contentTypes = new Set<string>();
    for (const content of extractedContent) {
      const title = content.title?.toLowerCase() || '';
      const paragraphs = content.paragraphs?.join(' ')?.toLowerCase() || '';
      
      if (title.includes('about') || paragraphs.includes('about us')) {
        contentTypes.add('about');
      }
      if (title.includes('contact') || paragraphs.includes('contact')) {
        contentTypes.add('contact');
      }
      if (title.includes('product') || paragraphs.includes('product')) {
        contentTypes.add('product');
      }
      if (title.includes('service') || paragraphs.includes('service')) {
        contentTypes.add('service');
      }
      if (title.includes('faq') || paragraphs.includes('frequently asked')) {
        contentTypes.add('faq');
      }
      if (title.includes('blog') || title.includes('news') || title.includes('article')) {
        contentTypes.add('article');
      }
      if (paragraphs.includes('review') || paragraphs.includes('testimonial')) {
        contentTypes.add('review');
      }
      if (title.includes('team') || title.includes('person')) {
        contentTypes.add('person');
      }
    }

    if (contentTypes.has('about') && !existingTypes.has('aboutpage') && !existingTypes.has('aboutpage')) {
      gaps.push(RECOMMENDED_SCHEMAS.aboutPage);
    }
    if (contentTypes.has('contact') && !existingTypes.has('contactpage')) {
      gaps.push(RECOMMENDED_SCHEMAS.contactPage);
    }
    if (contentTypes.has('product') && !existingTypes.has('product')) {
      gaps.push(RECOMMENDED_SCHEMAS.product);
    }
    if (contentTypes.has('service') && !existingTypes.has('service')) {
      gaps.push(RECOMMENDED_SCHEMAS.service);
    }
    if (contentTypes.has('faq') && !existingTypes.has('faqpage')) {
      gaps.push(RECOMMENDED_SCHEMAS.faq);
    }
    if (contentTypes.has('article') && !existingTypes.has('article')) {
      gaps.push(RECOMMENDED_SCHEMAS.article);
    }
    if (contentTypes.has('review') && !existingTypes.has('review')) {
      gaps.push(RECOMMENDED_SCHEMAS.review);
    }
    if (contentTypes.has('person') && !existingTypes.has('person')) {
      gaps.push(RECOMMENDED_SCHEMAS.person);
    }

    if (!existingTypes.has('organization')) {
      gaps.push(RECOMMENDED_SCHEMAS.organization);
    }
    if (!existingTypes.has('website')) {
      gaps.push(RECOMMENDED_SCHEMAS.website);
    }
    if (!existingTypes.has('breadcrumblist')) {
      gaps.push(RECOMMENDED_SCHEMAS.breadcrumbList);
    }

    return gaps.sort((a, b) => {
      const importanceOrder = { high: 0, medium: 1, low: 2 };
      return importanceOrder[a.importance] - importanceOrder[b.importance];
    });
  }
}
