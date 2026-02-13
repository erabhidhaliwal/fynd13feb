import { BaseAgent } from './base.js';
import { AgentConfig, AgentCapability, ExtractedContent, LinkMap, SchemaAnalysis, KnowledgeBase, SiteSummary, Topic, Entity, QAPair } from '../types/index.js';

const DEFAULT_CAPABILITIES: AgentCapability[] = [
  {
    name: 'generateKnowledgeBase',
    description: 'Generate structured AI-readable knowledge base',
    inputSchema: { extractedContent: 'array', linkMap: 'object', schemaAnalysis: 'object', siteUrl: 'string' },
    outputSchema: { knowledgeBase: 'object' }
  },
  {
    name: 'extractTopics',
    description: 'Extract key topics from content',
    inputSchema: { content: 'array' },
    outputSchema: { topics: 'array' }
  },
  {
    name: 'extractEntities',
    description: 'Extract named entities from content',
    inputSchema: { content: 'array' },
    outputSchema: { entities: 'array' }
  },
  {
    name: 'generateQA',
    description: 'Generate Q&A pairs from content',
    inputSchema: { content: 'array' },
    outputSchema: { qaPairs: 'array' }
  }
];

export class KnowledgeBaseGeneratorAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      name: 'KnowledgeBaseGeneratorAgent',
      role: 'Knowledge Base Generator',
      description: 'Generates structured AI-readable knowledge base from crawled content',
      capabilities: DEFAULT_CAPABILITIES
    };
    super(config);
  }

  async process(input: any): Promise<KnowledgeBase> {
    const { extractedContent, linkMap, schemaAnalysis, siteUrl } = input;
    
    console.log(`[KnowledgeBaseGeneratorAgent] Generating knowledge base from ${extractedContent.length} pages`);

    const siteSummary = this.generateSiteSummary(extractedContent, siteUrl);
    const topics = this.extractTopics(extractedContent);
    const entities = this.extractEntities(extractedContent);
    const qaPairs = this.generateQA(extractedContent);
    const structuredData = this.generateStructuredData(extractedContent, linkMap, schemaAnalysis);

    const knowledgeBase: KnowledgeBase = {
      siteSummary,
      topics,
      entities,
      qaPairs,
      structuredData,
      generatedAt: Date.now()
    };

    console.log(`[KnowledgeBaseGeneratorAgent] Knowledge base generated:`);
    console.log(`  - Site: ${siteSummary.name}`);
    console.log(`  - Industry: ${siteSummary.industry}`);
    console.log(`  - Topics: ${topics.length}`);
    console.log(`  - Entities: ${entities.length}`);
    console.log(`  - Q&A Pairs: ${qaPairs.length}`);

    this.setContext('knowledgeBase', knowledgeBase);
    return knowledgeBase;
  }

  private generateSiteSummary(extractedContent: ExtractedContent[], siteUrl: string): SiteSummary {
    const firstPage = extractedContent[0];
    const allText = extractedContent.map(c => c.paragraphs.join(' ')).join(' ');
    
    const urlObj = new URL(siteUrl);
    const hostname = urlObj.hostname.replace('www.', '');
    const siteName = hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);

    const name = firstPage?.title?.split('|')[0]?.split('-')[0]?.trim() || siteName;
    const description = firstPage?.metadata?.description || 
                       firstPage?.paragraphs?.[0]?.substring(0, 200) || 
                       'Website description not available';
    
    const industry = this.detectIndustry(allText);
    const primaryPurpose = this.detectPurpose(allText);
    const targetAudience = this.detectAudience(allText);
    const keyValueProps = this.extractValueProps(allText);
    const brandVoice = this.detectBrandVoice(allText);

    return {
      name,
      description,
      industry,
      primaryPurpose,
      targetAudience,
      keyValueProps,
      brandVoice
    };
  }

  private detectIndustry(text: string): string {
    const industries: Record<string, string[]> = {
      'SaaS/Software': ['software', 'platform', 'saas', 'cloud', 'app', 'application', 'solution', 'api', 'dashboard'],
      'E-commerce': ['shop', 'store', 'product', 'buy', 'cart', 'checkout', 'order', 'shipping', 'payment'],
      'Finance': ['finance', 'financial', 'banking', 'payment', 'investment', 'trading', 'crypto', 'loan', 'credit'],
      'Healthcare': ['health', 'medical', 'healthcare', 'doctor', 'patient', 'hospital', 'wellness', 'treatment'],
      'Education': ['education', 'learning', 'course', 'tutorial', 'training', 'school', 'university', 'student'],
      'Marketing': ['marketing', 'seo', 'advertising', 'campaign', 'analytics', 'brand', 'content'],
      'Technology': ['tech', 'technology', 'developer', 'api', 'code', 'it', 'infrastructure'],
      'Real Estate': ['real estate', 'property', 'housing', 'apartment', 'rent', 'buy', 'mortgage'],
      'Travel': ['travel', 'hotel', 'booking', 'flight', 'vacation', 'tourism', 'destination'],
      'Food & Dining': ['restaurant', 'food', 'dining', 'delivery', 'catering', 'menu', 'chef'],
      'Media & Entertainment': ['news', 'blog', 'video', 'music', 'entertainment', 'media', 'publishing'],
      'Consulting': ['consulting', 'consultant', 'advisory', 'strategy', 'management']
    };

    const lowerText = text.toLowerCase();
    
    for (const [industry, keywords] of Object.entries(industries)) {
      const matches = keywords.filter(kw => lowerText.includes(kw)).length;
      if (matches >= 2) return industry;
    }

    return 'General';
  }

  private detectPurpose(text: string): string {
    const purposes: Record<string, string[]> = {
      'Lead Generation': ['contact', 'quote', 'demo', 'signup', 'register', 'get started'],
      'Sales': ['buy', 'purchase', 'order', 'pricing', 'plan', 'subscription'],
      'Information': ['learn', 'understand', 'guide', 'documentation', 'help', 'support'],
      'Engagement': ['community', 'forum', 'blog', 'news', 'update', 'follow'],
      'Booking': ['book', 'reserve', 'schedule', 'appointment', 'availability']
    };

    const lowerText = text.toLowerCase();
    
    for (const [purpose, keywords] of Object.entries(purposes)) {
      const matches = keywords.filter(kw => lowerText.includes(kw)).length;
      if (matches >= 2) return purpose;
    }

    return 'Information & Services';
  }

  private detectAudience(text: string): string[] {
    const audiences: Record<string>[] = [
      { audience: 'Developers', keywords: ['developer', 'api', 'code', 'documentation', 'sdk'] },
      { audience: 'Business Owners', keywords: ['business', 'enterprise', 'company', 'ceo', 'founder'] },
      { audience: 'Marketing Professionals', keywords: ['marketing', 'seo', 'campaign', 'advertising'] },
      { audience: 'IT Professionals', keywords: ['it', 'technology', 'infrastructure', 'system'] },
      { audience: 'Consumers', keywords: ['customer', 'user', 'personal', 'home', 'individual'] },
      { audience: 'Students', keywords: ['student', 'learning', 'course', 'education', 'tutorial'] },
      { audience: 'Healthcare Providers', keywords: ['doctor', 'medical', 'healthcare', 'provider', 'clinic'] },
      { audience: 'Recruiters', keywords: ['hiring', 'job', 'career', 'recruit', 'talent'] }
    ];

    const lowerText = text.toLowerCase();
    const detected: string[] = [];

    for (const { audience, keywords } of audiences) {
      const matches = keywords.filter(kw => lowerText.includes(kw)).length;
      if (matches >= 1) {
        detected.push(audience);
      }
    }

    return detected.length > 0 ? detected : ['General Audience'];
  }

  private extractValueProps(text: string): string[] {
    const valueProps: string[] = [];
    
    const patterns = [
      /we (offer|provide|deliver|have)/gi,
      /our (solution|platform|service)/gi,
      /key (features|benefits|advantages)/gi,
      /why (choose|use|work with)/gi,
      /free (trial|demo|consultation)/gi,
      /no (credit card|commitment|setup)/gi,
      /(\d+)\+ (years|users|customers|features)/gi,
      /(best|top|leading) (solution|platform|service)/gi
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        valueProps.push(...matches.slice(0, 3));
      }
    }

    return [...new Set(valueProps)].slice(0, 5);
  }

  private detectBrandVoice(text: string): string {
    const sample = text.substring(0, 2000).toLowerCase();
    
    const formal = ['please', 'kindly', 'respectfully', 'thank you', 'consider', 'recommend'];
    const casual = ['hey', 'awesome', 'cool', 'love', 'amazing', 'great', 'super'];
    const technical = ['implement', 'configure', 'deploy', 'optimize', 'integrate', 'scalable'];
    const friendly = ['happy', 'helpful', 'friendly', 'support', 'assistance'];

    let formalCount = formal.filter(w => sample.includes(w)).length;
    let casualCount = casual.filter(w => sample.includes(w)).length;
    let technicalCount = technical.filter(w => sample.includes(w)).length;
    let friendlyCount = friendly.filter(w => sample.includes(w)).length;

    if (technicalCount > Math.max(formalCount, casualCount)) {
      return 'Technical & Professional';
    } else if (casualCount > formalCount) {
      return 'Casual & Friendly';
    } else if (friendlyCount > 0) {
      return 'Helpful & Supportive';
    }

    return 'Professional & Informative';
  }

  private extractTopics(extractedContent: ExtractedContent[]): Topic[] {
    const topicMap = new Map<string, Topic>();
    
    for (const content of extractedContent) {
      const pageText = content.title + ' ' + content.paragraphs.join(' ');
      const keywords = this.extractKeywords(pageText);
      
      for (const heading of content.headings) {
        const topicName = heading.text.trim();
        if (topicName.length > 3 && topicName.length < 100) {
          
          if (!topicMap.has(topicName)) {
            topicMap.set(topicName, {
              name: topicName,
              description: content.paragraphs.find(p => p.toLowerCase().includes(topicName.toLowerCase())) || '',
              pages: [],
              keywords: [],
              relevance: 0
            });
          }
          
          const topic = topicMap.get(topicName)!;
          topic.pages.push(content.pageUrl);
          topic.relevance += (6 - heading.level);
        }
      }

      for (const keyword of keywords.slice(0, 10)) {
        if (!topicMap.has(keyword)) {
          topicMap.set(keyword, {
            name: keyword,
            description: '',
            pages: [content.pageUrl],
            keywords: [],
            relevance: 1
          });
        } else {
          const topic = topicMap.get(keyword)!;
          if (!topic.pages.includes(content.pageUrl)) {
            topic.pages.push(content.pageUrl);
            topic.relevance += 1;
          }
        }
      }
    }

    return Array.from(topicMap.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 30);
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
      'a', 'an', 'as', 'if', 'then', 'than', 'so', 'because', 'when',
      'where', 'how', 'what', 'which', 'who', 'whom', 'whose', 'also',
      'more', 'most', 'some', 'any', 'all', 'each', 'every', 'both',
      'few', 'other', 'such', 'no', 'not', 'only', 'same', 'just'
    ]);

    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    const wordCount = new Map<string, number>();
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }

    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word]) => word);
  }

  private extractEntities(extractedContent: ExtractedContent[]): Entity[] {
    const entityMap = new Map<string, Entity>();
    
    for (const content of extractedContent) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const urlRegex = /https?:\/\/[^\s]+/g;
      const phoneRegex = /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
      
      const emails = content.pageUrl.match(emailRegex) || [];
      const urls = content.pageUrl.match(urlRegex) || [];
      const phones = content.pageUrl.match(phoneRegex) || [];

      for (const email of emails) {
        if (!entityMap.has(email)) {
          entityMap.set(email, {
            name: email,
            type: 'Email',
            description: 'Contact email found on website',
            properties: new Map()
          });
        }
      }

      for (const phone of phones) {
        const key = `phone_${phone}`;
        if (!entityMap.has(key)) {
          entityMap.set(key, {
            name: phone,
            type: 'Phone',
            description: 'Contact phone number found on website',
            properties: new Map()
          });
        }
      }

      for (const heading of content.headings) {
        if (heading.level === 1 && heading.text.length > 3 && heading.text.length < 50) {
          const key = `heading_${heading.text}`;
          if (!entityMap.has(key)) {
            entityMap.set(key, {
              name: heading.text,
              type: 'Heading',
              description: 'Primary page heading',
              properties: new Map()
            });
          }
        }
      }

      if (content.metadata.author) {
        const key = `author_${content.metadata.author}`;
        if (!entityMap.has(key)) {
          entityMap.set(key, {
            name: content.metadata.author,
            type: 'Person',
            description: 'Content author',
            properties: new Map()
          });
        }
      }
    }

    return Array.from(entityMap.values()).slice(0, 50);
  }

  private generateQA(extractedContent: ExtractedContent[]): QAPair[] {
    const qaPairs: QAPair[] = [];

    for (const content of extractedContent.slice(0, 20)) {
      if (content.headings.length > 0) {
        for (const heading of content.headings) {
          if (heading.level <= 3 && content.paragraphs.length > 0) {
            const answer = content.paragraphs[0].substring(0, 300);
            
            const question = this.generateQuestion(heading.text);
            
            qaPairs.push({
              question,
              answer,
              sourcePage: content.pageUrl
            });
          }
        }
      }

      if (content.lists.length > 0) {
        for (const listItem of content.lists.slice(0, 5)) {
          if (listItem.length > 20 && listItem.length < 150) {
            qaPairs.push({
              question: `What is ${listItem.split(' ').slice(0, 5).join(' ')}?`,
              answer: listItem,
              sourcePage: content.pageUrl
            });
          }
        }
      }
    }

    return qaPairs.slice(0, 100);
  }

  private generateQuestion(heading: string): string {
    const cleanHeading = heading.trim();
    
    if (cleanHeading.startsWith('How ')) {
      return cleanHeading + '?';
    }
    if (cleanHeading.startsWith('What ')) {
      return cleanHeading + '?';
    }
    if (cleanHeading.startsWith('Why ')) {
      return cleanHeading + '?';
    }
    if (cleanHeading.startsWith('When ')) {
      return cleanHeading + '?';
    }
    if (cleanHeading.startsWith('Where ')) {
      return cleanHeading + '?';
    }
    
    return `What is ${cleanHeading}?`;
  }

  private generateStructuredData(
    extractedContent: ExtractedContent[], 
    linkMap: LinkMap, 
    schemaAnalysis: SchemaAnalysis
  ): any {
    return {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      stats: {
        totalPages: extractedContent.length,
        totalHeadings: extractedContent.reduce((sum, c) => sum + c.headings.length, 0),
        totalParagraphs: extractedContent.reduce((sum, c) => sum + c.paragraphs.length, 0),
        totalImages: extractedContent.reduce((sum, c) => sum + c.images.length, 0),
        totalLinks: extractedContent.reduce((sum, c) => sum + c.links.length, 0)
      },
      siteStructure: {
        totalPages: linkMap?.siteStructure?.length || 0,
        orphanPages: linkMap?.orphanPages?.length || 0,
        brokenLinks: linkMap?.brokenLinks?.length || 0
      },
      schema: {
        typesFound: schemaAnalysis?.schemaTypes?.length || 0,
        missingTypes: schemaAnalysis?.missingSchemas?.length || 0,
        richResults: schemaAnalysis?.richResults?.filter(r => r.detected).length || 0
      }
    };
  }
}
