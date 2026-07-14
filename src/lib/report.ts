/* Единый формат результата тула: человекочитаемый отчёт (агенту нужен
   фидбек «что сделано» для его собственного отчёта пользователю). */

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export function ok(lines: string | string[]): ToolResult {
  const text = Array.isArray(lines) ? lines.join("\n") : lines;
  return { content: [{ type: "text", text }] };
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: `Ошибка: ${message}` }], isError: true };
}

/* Отчёт-аккумулятор: тулы печатают шаги по мере выполнения. */
export class Report {
  private lines: string[] = [];
  add(line: string) {
    this.lines.push(line);
  }
  addAll(lines: string[]) {
    this.lines.push(...lines);
  }
  toResult(): ToolResult {
    return ok(this.lines);
  }
}
