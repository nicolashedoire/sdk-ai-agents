const MAX_MESSAGE_LENGTH = 500;

/** Cuts a text stored in events or shown in errors (a model's reply, an error) to `max`. */
export function truncate(text: string, max: number = MAX_MESSAGE_LENGTH): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
