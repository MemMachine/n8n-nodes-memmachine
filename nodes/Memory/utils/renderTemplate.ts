import type { IDataObject } from 'n8n-workflow';
import type { CategorizedMemories, EpisodicMemoryItem } from './categorizeMemories';

export interface ProfileMemoryFacts extends IDataObject {
  facts?: Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence?: number;
    source?: string;
  }>;
  entities?: Record<string, string>;
}

export interface SemanticMemoryFeature extends IDataObject {
  set_id: string;
  category: string;
  tag: string;
  feature_name: string;
  value: string;
  metadata?: {
    citations?: any;
    id?: string;
    other?: any;
  };
}

/**
 * Renders a markdown template by replacing placeholders with formatted memory sections
 * 
 * @param template - Template string with placeholders: {{history}}, {{shortTermMemory}}, {{longTermMemory}}, {{profileMemory}}, {{semanticMemory}}, {{episodeSummary}}
 * @param categorized - Categorized memory structure from categorizeMemories()
 * @param profileMemory - Profile memory facts from MemMachine API
 * @param semanticMemory - Semantic memory features from MemMachine API
 * @param episodeSummary - Episode summaries from short-term memory
 * @returns Rendered markdown string with placeholders replaced
 * 
 * @example
 * const template = "## History\n{{history}}\n\n## Profile\n{{profileMemory}}";
 * const context = renderTemplate(template, categorized, profileFacts, semanticFeatures, summaries);
 */
export function renderTemplate(
  template: string,
  categorized: CategorizedMemories,
  profileMemory: ProfileMemoryFacts,
  semanticMemory: SemanticMemoryFeature[] = [],
  episodeSummary: string[] = [],
): string {
  let rendered = template;

  // Replace each placeholder with formatted content
  rendered = rendered.replace(/\{\{history\}\}/g, formatAsMarkdownList(categorized.history));
  rendered = rendered.replace(/\{\{shortTermMemory\}\}/g, formatAsMarkdownList(categorized.shortTermMemory));
  rendered = rendered.replace(/\{\{longTermMemory\}\}/g, formatAsMarkdownList(categorized.longTermMemory));
  rendered = rendered.replace(/\{\{profileMemory\}\}/g, formatProfileMemory(profileMemory));
  rendered = rendered.replace(/\{\{semanticMemory\}\}/g, formatSemanticMemory(semanticMemory));
  rendered = rendered.replace(/\{\{episodeSummary\}\}/g, formatEpisodeSummary(episodeSummary));

  return rendered;
}

/**
 * Formats an array of episodic memory items as a markdown bulleted list
 * 
 * @param items - Array of episodic memory items
 * @returns Markdown formatted string (bulleted list or empty message)
 * 
 * @example
 * formatAsMarkdownList([{ producer: "user_1", produced_for: "agent", episode_content: "Hello" }])
 * // Returns: "- **user_1** → agent: Hello"
 */
export function formatAsMarkdownList(items: EpisodicMemoryItem[]): string {
  if (items.length === 0) {
    return '*No memories in this category*';
  }

  return items
    .map((item) => {
      const content = item.episode_content || '';
      const producer = item.producer || 'unknown';
      const producedFor = item.produced_for || 'unknown';
      return `- **${producer}** → ${producedFor}: ${content}`;
    })
    .join('\n');
}

/**
 * Formats profile memory facts as markdown sections grouped by subject
 * 
 * @param profileMemory - Profile memory facts structure
 * @returns Markdown formatted string with subject headings and fact lists
 * 
 * @example
 * formatProfileMemory({ facts: [{ subject: "user_1", predicate: "Name", object: "Alice" }] })
 * // Returns: "### user_1\n- **Name**: Alice"
 */
export function formatProfileMemory(profileMemory: ProfileMemoryFacts): string {
  const facts = profileMemory.facts || [];

  if (facts.length === 0) {
    return '*No profile information available*';
  }

  // Group facts by subject
  const groupedBySubject: Record<string, Array<{ predicate: string; object: string }>> = {};
  
  for (const fact of facts) {
    if (!groupedBySubject[fact.subject]) {
      groupedBySubject[fact.subject] = [];
    }
    groupedBySubject[fact.subject].push({
      predicate: fact.predicate,
      object: fact.object,
    });
  }

  // Format each subject as a section
  const sections = Object.entries(groupedBySubject).map(([subject, subjectFacts]) => {
    const factLines = subjectFacts
      .map((fact) => `- **${fact.predicate}**: ${fact.object}`)
      .join('\n');
    return `### ${subject}\n${factLines}`;
  });

  return sections.join('\n\n');
}

/**
 * Formats semantic memory features as markdown list grouped by tag/category
 * 
 * @param semanticMemory - Array of semantic memory features
 * @returns Markdown formatted string with feature listings
 * 
 * @example
 * formatSemanticMemory([{ tag: "Demographic", feature_name: "name", value: "Alice" }])
 * // Returns: "- **Demographic** / name: Alice"
 */
export function formatSemanticMemory(semanticMemory: SemanticMemoryFeature[]): string {
  if (semanticMemory.length === 0) {
    return '*No semantic features available*';
  }

  return semanticMemory
    .map((feature) => {
      const tag = feature.tag || 'General';
      const featureName = feature.feature_name || 'property';
      const value = feature.value || '';
      return `- **${tag}** / ${featureName}: ${value}`;
    })
    .join('\n');
}

/**
 * Formats episode summaries as markdown
 * 
 * @param episodeSummary - Array of summary strings
 * @returns Markdown formatted string with summaries
 */
export function formatEpisodeSummary(episodeSummary: string[]): string {
  if (episodeSummary.length === 0) {
    return '';
  }

  return episodeSummary
    .filter((summary) => summary && summary.trim() !== '')
    .map((summary) => `> ${summary}`)
    .join('\n\n');
}
