import type { RunComparison } from '../types/comparison.js';

export class ComparisonReportGenerator {
  static generate(comparison: RunComparison, format: 'json' | 'html' | 'text' = 'text'): string {
    switch (format) {
      case 'json':
        return this.generateJSON(comparison);
      case 'html':
        return this.generateHTML(comparison);
      case 'text':
        return this.generateText(comparison);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private static generateJSON(comparison: RunComparison): string {
    return JSON.stringify(comparison, null, 2);
  }

  private static generateHTML(comparison: RunComparison): string {
    const metricsRows = Object.entries(comparison.metrics)
      .map(
        ([key, value]) => `
      <tr>
        <td><strong>${this.formatKey(key)}</strong></td>
        <td>${value.run1}</td>
        <td>${value.run2}</td>
        <td class="${value.diff === 0 ? '' : value.diff > 0 ? 'positive' : 'negative'}">${value.diff > 0 ? '+' : ''}${value.diff}</td>
      </tr>`
      )
      .join('');

    const differencesRows = comparison.differences
      .map(
        (diff) => `
      <tr class="severity-${diff.severity || 'low'}">
        <td>${diff.type}</td>
        <td>${diff.eventType || '-'}</td>
        <td>${diff.eventId || '-'}</td>
        <td>${this.escapeHTML(diff.details)}</td>
      </tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <title>Run Comparison Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .positive { color: green; }
    .negative { color: red; }
    .severity-high { background-color: #ffcccc; }
    .severity-medium { background-color: #ffffcc; }
    .severity-low { background-color: #ccffcc; }
  </style>
</head>
<body>
  <h1>Run Comparison Report</h1>
  <h2>Runs</h2>
  <p><strong>Run 1:</strong> ${comparison.runId1}</p>
  <p><strong>Run 2:</strong> ${comparison.runId2}</p>
  
  <h2>Metrics</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Run 1</th>
      <th>Run 2</th>
      <th>Difference</th>
    </tr>
    ${metricsRows}
  </table>
  
  <h2>Summary</h2>
  <ul>
    <li>Total Differences: ${comparison.summary.totalDifferences}</li>
    <li>Critical Differences: ${comparison.summary.criticalDifferences}</li>
  </ul>
  
  <h2>Main Differences</h2>
  <ul>
    ${comparison.summary.mainDifferences.map((d) => `<li>${this.escapeHTML(d)}</li>`).join('')}
  </ul>
  
  <h2>All Differences</h2>
  <table>
    <tr>
      <th>Type</th>
      <th>Event Type</th>
      <th>Event ID</th>
      <th>Details</th>
    </tr>
    ${differencesRows}
  </table>
</body>
</html>`;
  }

  private static generateText(comparison: RunComparison): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('RUN COMPARISON REPORT');
    lines.push('='.repeat(80));
    lines.push('');
    lines.push(`Run 1: ${comparison.runId1}`);
    lines.push(`Run 2: ${comparison.runId2}`);
    lines.push('');

    lines.push('METRICS:');
    lines.push('-'.repeat(80));
    for (const [key, value] of Object.entries(comparison.metrics)) {
      lines.push(`${this.formatKey(key)}:`);
      lines.push(`  Run 1: ${value.run1}`);
      lines.push(`  Run 2: ${value.run2}`);
      lines.push(`  Diff:  ${value.diff > 0 ? '+' : ''}${value.diff}`);
    }
    lines.push('');

    lines.push('SUMMARY:');
    lines.push('-'.repeat(80));
    lines.push(`Total Differences: ${comparison.summary.totalDifferences}`);
    lines.push(`Critical Differences: ${comparison.summary.criticalDifferences}`);
    lines.push('');

    if (comparison.summary.mainDifferences.length > 0) {
      lines.push('MAIN DIFFERENCES:');
      lines.push('-'.repeat(80));
      comparison.summary.mainDifferences.forEach((diff) => {
        lines.push(`  - ${diff}`);
      });
      lines.push('');
    }

    if (comparison.differences.length > 0) {
      lines.push('ALL DIFFERENCES:');
      lines.push('-'.repeat(80));
      comparison.differences.forEach((diff, idx) => {
        lines.push(`${idx + 1}. [${diff.type}] ${diff.severity || 'low'} severity`);
        lines.push(`   Event Type: ${diff.eventType || 'N/A'}`);
        lines.push(`   Event ID: ${diff.eventId || 'N/A'}`);
        lines.push(`   Details: ${diff.details}`);
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  private static formatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  private static escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

