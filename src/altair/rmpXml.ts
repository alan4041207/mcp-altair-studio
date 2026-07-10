/**
 * Minimal builder for Altair AI Studio / RapidMiner ".rmp" process XML.
 *
 * The .rmp format has been stable across RapidMiner/Altair AI Studio releases for
 * over a decade: a tree of <operator class="..."> nodes, each optionally containing
 * one or more nested <process> blocks (used by control-structure operators such as
 * Cross Validation, X-Validation, or Loop), wired together with <connect> tags that
 * reference the OPERATOR-SPECIFIC port names (there is no universal "input"/"output"
 * convention — e.g. Retrieve exposes "output", most example-set operators expose
 * "example set input"/"example set output" or a task-specific name like "training").
 *
 * If you introduce an operator/port combination this file doesn't already know a
 * recipe for, the safest way to get exact names is: build the two-operator snippet
 * once in the Altair AI Studio GUI, then Process > Export Process (or copy from the
 * XML view), and read the class/port names straight out of that export.
 */

export interface Parameter {
  key: string;
  value: string;
}

export interface ListParameter {
  key: string;
  entries: Parameter[];
}

export interface Connection {
  /** Omit when connecting from an outer sub-process input port (a "source"). */
  fromOp?: string;
  fromPort: string;
  /** Omit when connecting to an outer sub-process output port (a "sink"). */
  toOp?: string;
  toPort: string;
}

export interface OperatorNode {
  name: string;
  classKey: string;
  parameters?: Parameter[];
  listParameters?: ListParameter[];
  /** One entry per nested <process> the operator owns (e.g. Cross Validation has 2). */
  subprocesses?: {
    operators: OperatorNode[];
    connections: Connection[];
  }[];
}

export interface BuildProcessOptions {
  macros?: Record<string, string>;
  operators: OperatorNode[];
  connections: Connection[];
  /** Altair/RapidMiner internal compatibility tag. Harmless if slightly off: Studio
   * auto-upgrades on open and will not fail to load over this. */
  compatibility?: string;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderParameters(params: Parameter[] | undefined, indent: string): string {
  if (!params || params.length === 0) return "";
  return params
    .map(
      (p) => `${indent}<parameter key="${xmlEscape(p.key)}" value="${xmlEscape(p.value)}"/>`
    )
    .join("\n") + "\n";
}

function renderListParameters(lists: ListParameter[] | undefined, indent: string): string {
  if (!lists || lists.length === 0) return "";
  return lists
    .map((l) => {
      const entries = l.entries
        .map(
          (e) =>
            `${indent}  <parameter key="${xmlEscape(e.key)}" value="${xmlEscape(e.value)}"/>`
        )
        .join("\n");
      return `${indent}<list key="${xmlEscape(l.key)}">\n${entries}\n${indent}</list>`;
    })
    .join("\n") + "\n";
}

function renderConnections(conns: Connection[], indent: string): string {
  return conns
    .map((c) => {
      const from = c.fromOp
        ? `from_op="${xmlEscape(c.fromOp)}" from_port="${xmlEscape(c.fromPort)}"`
        : `from_port="${xmlEscape(c.fromPort)}"`;
      const to = c.toOp
        ? `to_op="${xmlEscape(c.toOp)}" to_port="${xmlEscape(c.toPort)}"`
        : `to_port="${xmlEscape(c.toPort)}"`;
      return `${indent}<connect ${from} ${to}/>`;
    })
    .join("\n");
}

function renderOperator(op: OperatorNode, indent: string, compatibility: string): string {
  const inner = indent + "  ";
  let body = "";
  body += renderParameters(op.parameters, inner);
  body += renderListParameters(op.listParameters, inner);

  if (op.subprocesses && op.subprocesses.length > 0) {
    for (const sp of op.subprocesses) {
      const opsXml = sp.operators
        .map((o) => renderOperator(o, inner + "  ", compatibility))
        .join("\n");
      const connXml = renderConnections(sp.connections, inner + "  ");
      body += `${inner}<process expanded="true">\n${opsXml}${opsXml ? "\n" : ""}${connXml}\n${inner}</process>\n`;
    }
  }

  return `${indent}<operator activated="true" class="${xmlEscape(op.classKey)}" compatibility="${compatibility}" expanded="true" name="${xmlEscape(op.name)}">\n${body}${indent}</operator>`;
}

function renderMacros(macros: Record<string, string> | undefined, indent: string): string {
  if (!macros || Object.keys(macros).length === 0) return `${indent}<macros/>`;
  const entries = Object.entries(macros)
    .map(
      ([k, v]) =>
        `${indent}  <macro>\n${indent}    <key>${xmlEscape(k)}</key>\n${indent}    <value>${xmlEscape(
          v
        )}</value>\n${indent}  </macro>`
    )
    .join("\n");
  return `${indent}<macros>\n${entries}\n${indent}</macros>`;
}

export function buildProcessXml(opts: BuildProcessOptions): string {
  const compatibility = opts.compatibility ?? "10.6.000";
  const opsXml = opts.operators
    .map((o) => renderOperator(o, "      ", compatibility))
    .join("\n");
  const connXml = renderConnections(opts.connections, "      ");
  const macrosXml = renderMacros(opts.macros, "    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<process version="${compatibility}">
  <context>
    <input/>
    <output/>
${macrosXml}
  </context>
  <operator activated="true" class="process" compatibility="${compatibility}" expanded="true" name="Process" origin="GENERATED_BY_MCP_ALTAIR_STUDIO">
    <process expanded="true">
${opsXml}${opsXml ? "\n" : ""}${connXml}
    </process>
  </operator>
</process>
`;
}
