"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTemplate = renderTemplate;
exports.formatAsMarkdownList = formatAsMarkdownList;
exports.formatProfileMemory = formatProfileMemory;
exports.formatSemanticMemory = formatSemanticMemory;
exports.formatEpisodeSummary = formatEpisodeSummary;
function renderTemplate(template, categorized, profileMemory, semanticMemory = [], episodeSummary = []) {
    let rendered = template;
    rendered = rendered.replace(/\{\{history\}\}/g, formatAsMarkdownList(categorized.history));
    rendered = rendered.replace(/\{\{shortTermMemory\}\}/g, formatAsMarkdownList(categorized.shortTermMemory));
    rendered = rendered.replace(/\{\{longTermMemory\}\}/g, formatAsMarkdownList(categorized.longTermMemory));
    rendered = rendered.replace(/\{\{profileMemory\}\}/g, formatProfileMemory(profileMemory));
    rendered = rendered.replace(/\{\{semanticMemory\}\}/g, formatSemanticMemory(semanticMemory));
    rendered = rendered.replace(/\{\{episodeSummary\}\}/g, formatEpisodeSummary(episodeSummary));
    return rendered;
}
function formatAsMarkdownList(items) {
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
function formatProfileMemory(profileMemory) {
    const facts = profileMemory.facts || [];
    if (facts.length === 0) {
        return '*No profile information available*';
    }
    const groupedBySubject = {};
    for (const fact of facts) {
        if (!groupedBySubject[fact.subject]) {
            groupedBySubject[fact.subject] = [];
        }
        groupedBySubject[fact.subject].push({
            predicate: fact.predicate,
            object: fact.object,
        });
    }
    const sections = Object.entries(groupedBySubject).map(([subject, subjectFacts]) => {
        const factLines = subjectFacts
            .map((fact) => `- **${fact.predicate}**: ${fact.object}`)
            .join('\n');
        return `### ${subject}\n${factLines}`;
    });
    return sections.join('\n\n');
}
function formatSemanticMemory(semanticMemory) {
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
function formatEpisodeSummary(episodeSummary) {
    if (episodeSummary.length === 0) {
        return '';
    }
    return episodeSummary
        .filter((summary) => summary && summary.trim() !== '')
        .map((summary) => `> ${summary}`)
        .join('\n\n');
}
//# sourceMappingURL=renderTemplate.js.map