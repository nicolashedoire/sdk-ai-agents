import type { PolicyContext } from '../types/policy.js';
import type { Intention } from '../types/run.js';

export type ConditionOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'matches'
  | 'exists';

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface ConditionExpression {
  type: 'condition' | 'and' | 'or' | 'not';
  conditions?: Condition[];
  expressions?: ConditionExpression[];
}

export class ConditionEvaluator {
  /**
   * Evaluates a condition expression against the given context.
   */
  evaluate(
    expression: ConditionExpression | Condition | string,
    intention: Intention,
    context: PolicyContext
  ): boolean {
    // Handle string conditions (backward compatibility)
    if (typeof expression === 'string') {
      return this.evaluateStringCondition(expression, intention, context);
    }

    // Handle single Condition object
    if ('field' in expression && 'operator' in expression && 'value' in expression) {
      return this.evaluateCondition(expression as Condition, intention, context);
    }

    // Handle ConditionExpression
    const expr = expression as ConditionExpression;

    switch (expr.type) {
      case 'condition':
        if (expr.conditions && expr.conditions.length > 0) {
          return expr.conditions.every((cond) => this.evaluateCondition(cond, intention, context));
        }
        return true;

      case 'and':
        if (expr.expressions) {
          return expr.expressions.every((e) => this.evaluate(e, intention, context));
        }
        return true;

      case 'or':
        if (expr.expressions) {
          return expr.expressions.some((e) => this.evaluate(e, intention, context));
        }
        return false;

      case 'not':
        if (expr.expressions && expr.expressions.length > 0) {
          return !this.evaluate(expr.expressions[0], intention, context);
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Evaluates a single condition.
   */
  private evaluateCondition(
    condition: Condition,
    intention: Intention,
    context: PolicyContext
  ): boolean {
    const fieldValue = this.getFieldValue(condition.field, intention, context);

    switch (condition.operator) {
      case 'eq':
        return fieldValue === condition.value;

      case 'ne':
        return fieldValue !== condition.value;

      case 'gt':
        return this.compareNumbers(fieldValue, condition.value) > 0;

      case 'gte':
        return this.compareNumbers(fieldValue, condition.value) >= 0;

      case 'lt':
        return this.compareNumbers(fieldValue, condition.value) < 0;

      case 'lte':
        return this.compareNumbers(fieldValue, condition.value) <= 0;

      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);

      case 'notIn':
        return Array.isArray(condition.value) && !condition.value.includes(fieldValue);

      case 'contains':
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(condition.value);
        }
        if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
          return fieldValue.includes(condition.value);
        }
        return false;

      case 'matches':
        if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
          try {
            const regex = new RegExp(condition.value);
            return regex.test(fieldValue);
          } catch {
            return false;
          }
        }
        return false;

      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;

      default:
        return false;
    }
  }

  /**
   * Gets the value of a field from the context or intention.
   */
  private getFieldValue(field: string, intention: Intention, context: PolicyContext): unknown {
    // Context fields
    if (field.startsWith('context.')) {
      const contextField = field.substring(8);
      switch (contextField) {
        case 'agentId':
          return context.agentId;
        case 'runId':
          return context.runId;
        case 'currentStep':
          return context.currentStep;
        case 'tokensUsed':
          return context.tokensUsed;
        case 'startTime':
          return context.startTime;
        case 'elapsedTime':
          return Date.now() - context.startTime;
        default:
          return undefined;
      }
    }

    // Intention fields
    if (field.startsWith('intention.')) {
      const intentionField = field.substring(10);
      switch (intentionField) {
        case 'type':
          return intention.type;
        case 'toolName':
          return intention.toolName;
        case 'parameters':
          return intention.parameters;
        default:
          if (intention.parameters && typeof intention.parameters === 'object') {
            return (intention.parameters as Record<string, unknown>)[intentionField];
          }
          return undefined;
      }
    }

    // Time-based fields
    if (field.startsWith('time.')) {
      const timeField = field.substring(5);
      const now = new Date();
      switch (timeField) {
        case 'hour':
          return now.getHours();
        case 'day':
          return now.getDay();
        case 'date':
          return now.getDate();
        case 'month':
          return now.getMonth() + 1;
        case 'year':
          return now.getFullYear();
        case 'timestamp':
          return Date.now();
        default:
          return undefined;
      }
    }

    // Direct field access (for backward compatibility)
    switch (field) {
      case 'agentId':
        return context.agentId;
      case 'toolName':
        return intention.toolName;
      case 'intentionType':
        return intention.type;
      default:
        return undefined;
    }
  }

  /**
   * Compares two values as numbers.
   */
  private compareNumbers(a: unknown, b: unknown): number {
    const numA = typeof a === 'number' ? a : Number(a);
    const numB = typeof b === 'number' ? b : Number(b);

    if (Number.isNaN(numA) || Number.isNaN(numB)) {
      return 0;
    }

    return numA - numB;
  }

  /**
   * Evaluates a string condition (backward compatibility).
   * Supports simple expressions like "toolName == 'test'" or "currentStep > 5".
   */
  private evaluateStringCondition(
    condition: string,
    intention: Intention,
    context: PolicyContext
  ): boolean {
    // Simple equality check
    if (condition.includes('==')) {
      const [field, value] = condition.split('==').map((s) => s.trim());
      const fieldValue = this.getFieldValue(field, intention, context);
      return String(fieldValue) === value.replace(/['"]/g, '');
    }

    // Simple inequality check
    if (condition.includes('!=')) {
      const [field, value] = condition.split('!=').map((s) => s.trim());
      const fieldValue = this.getFieldValue(field, intention, context);
      return String(fieldValue) !== value.replace(/['"]/g, '');
    }

    // Greater than
    if (condition.includes('>')) {
      const [field, value] = condition.split('>').map((s) => s.trim());
      const fieldValue = this.getFieldValue(field, intention, context);
      return this.compareNumbers(fieldValue, Number(value)) > 0;
    }

    // Less than
    if (condition.includes('<')) {
      const [field, value] = condition.split('<').map((s) => s.trim());
      const fieldValue = this.getFieldValue(field, intention, context);
      return this.compareNumbers(fieldValue, Number(value)) < 0;
    }

    // Default: check if field exists and is truthy
    const fieldValue = this.getFieldValue(condition, intention, context);
    return Boolean(fieldValue);
  }
}
