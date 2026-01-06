import type { ReasoningGraph } from '../types/reasoning-graph.js';

export class ReasoningGraphExporter {
  /**
   * Exports the reasoning graph to JSON format.
   */
  static toJSON(graph: ReasoningGraph, pretty = false): string {
    return JSON.stringify(graph, null, pretty ? 2 : 0);
  }

  /**
   * Exports the reasoning graph to Graphviz DOT format.
   */
  static toGraphviz(graph: ReasoningGraph, options?: {
    direction?: 'TB' | 'LR' | 'BT' | 'RL';
    nodeShape?: string;
    nodeStyle?: string;
  }): string {
    const direction = options?.direction || 'TB';
    const nodeShape = options?.nodeShape || 'box';
    const nodeStyle = options?.nodeStyle || 'rounded';

    let dot = `digraph ReasoningGraph {\n`;
    dot += `  rankdir=${direction};\n`;
    dot += `  node [shape=${nodeShape}, style=${nodeStyle}];\n\n`;

    // Add nodes
    for (const node of graph.nodes) {
      const label = this.escapeLabel(node.label);
      const color = this.getNodeColor(node.type);
      dot += `  "${node.id}" [label="${label}", fillcolor="${color}", style="filled,${nodeStyle}"];\n`;
    }

    dot += '\n';

    // Add edges
    for (const edge of graph.edges) {
      const label = edge.label ? ` [label="${this.escapeLabel(edge.label)}"]` : '';
      const style = this.getEdgeStyle(edge.type);
      dot += `  "${edge.source}" -> "${edge.target}"${label}${style};\n`;
    }

    dot += '}\n';
    return dot;
  }

  private static escapeLabel(label: string): string {
    return label
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  private static getNodeColor(type: string): string {
    switch (type) {
      case 'start':
        return '#90EE90'; // lightgreen
      case 'end':
        return '#FFB6C1'; // lightpink
      case 'intention':
        return '#87CEEB'; // skyblue
      case 'action':
        return '#DDA0DD'; // plum
      case 'tool':
        return '#F0E68C'; // khaki
      case 'policy':
        return '#FFA500'; // orange
      case 'decision':
        return '#98D8C8'; // mint
      default:
        return '#E0E0E0'; // lightgray
    }
  }

  private static getEdgeStyle(type: string): string {
    switch (type) {
      case 'rejects':
        return ' [color=red, style=dashed]';
      case 'approves':
        return ' [color=green, style=bold]';
      case 'validates':
        return ' [color=blue]';
      case 'triggers':
        return ' [color=purple]';
      default:
        return '';
    }
  }
}

