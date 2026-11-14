import { createNode, type Diagram, type NodeKind } from './model'

type NodeSpec = readonly [id: string, kind: NodeKind, label: string, x: number, y: number]
type EdgeSpec = readonly [from: string, to: string, label?: string]

interface TemplateSpec {
  id: string
  name: string
  category: string
  description: string
  nodes: readonly NodeSpec[]
  edges: readonly EdgeSpec[]
}

export interface DiagramTemplate {
  id: string
  name: string
  category: string
  description: string
  diagram: Diagram
}

/**
 * All templates use the same normalized document format as the editor and MCP.
 * Compact node/edge tuples make additions reviewable without duplicating styles,
 * dimensions, or generated IDs in every preset.
 */
function buildTemplate(spec: TemplateSpec): DiagramTemplate {
  const diagram: Diagram = {
    version: 1,
    title: spec.name,
    nodes: spec.nodes.map(([id, kind, label, x, y]) => createNode(id, kind, label, x, y)),
    edges: spec.edges.map(([from, to, label = ''], index) => ({
      id: `${spec.id}-edge-${index + 1}`,
      from,
      to,
      label
    }))
  }
  return { id: spec.id, name: spec.name, category: spec.category, description: spec.description, diagram }
}

const definitions: readonly TemplateSpec[] = [
  {
    id: 'blank',
    name: 'Blank canvas',
    category: 'Start fresh',
    description: 'Your ideas, no constraints. Start with an empty diagram.',
    nodes: [],
    edges: []
  },
  {
    id: 'api-flow',
    name: 'API request flow',
    category: 'Flowchart',
    description: 'Trace authentication, success paths and errors in one view.',
    nodes: [
      ['client', 'start', 'Client', 48, 192],
      ['validate', 'decision', 'Authenticated?', 280, 172],
      ['handler', 'process', 'Handle request', 560, 80],
      ['reject', 'process', '401 Unauthorized', 560, 300],
      ['respond', 'start', '200 OK', 840, 92],
      ['denied', 'start', 'Error response', 840, 312]
    ],
    edges: [
      ['client', 'validate', 'request'],
      ['validate', 'handler', 'yes'],
      ['validate', 'reject', 'no'],
      ['handler', 'respond'],
      ['reject', 'denied']
    ]
  },
  {
    id: 'web-architecture',
    name: 'Web app architecture',
    category: 'System design',
    description: 'Browser, gateway, services, queue and database.',
    nodes: [
      ['browser', 'process', 'Browser / Nuxt', 40, 208],
      ['api', 'process', 'API gateway', 280, 208],
      ['app', 'process', 'Gleam service', 520, 72],
      ['worker', 'process', 'Worker', 520, 320],
      ['database', 'database', 'PostgreSQL', 784, 72],
      ['queue', 'database', 'Job queue', 784, 320]
    ],
    edges: [
      ['browser', 'api', 'HTTPS'],
      ['api', 'app', 'HTTP'],
      ['app', 'database', 'SQL'],
      ['app', 'queue', 'enqueue'],
      ['queue', 'worker', 'consume']
    ]
  },
  {
    id: 'deployment',
    name: 'CI / CD pipeline',
    category: 'DevOps',
    description: 'From source commit through checks to production release.',
    nodes: [
      ['commit', 'start', 'Git push', 40, 200],
      ['build', 'process', 'Build', 244, 192],
      ['test', 'decision', 'Tests pass?', 468, 180],
      ['deploy', 'process', 'Deploy', 716, 108],
      ['fail', 'note', 'Report failure', 716, 320],
      ['prod', 'start', 'Production', 952, 116]
    ],
    edges: [
      ['commit', 'build'],
      ['build', 'test'],
      ['test', 'deploy', 'yes'],
      ['test', 'fail', 'no'],
      ['deploy', 'prod']
    ]
  },
  {
    id: 'data-model',
    name: 'Data model overview',
    category: 'Database',
    description: 'A lightweight entity relationship overview (not full ER notation).',
    nodes: [
      ['users', 'database', 'users', 112, 72],
      ['projects', 'database', 'projects', 428, 72],
      ['diagrams', 'database', 'diagrams', 744, 72],
      ['members', 'database', 'memberships', 428, 312],
      ['revisions', 'database', 'revisions', 744, 312]
    ],
    edges: [
      ['users', 'projects', 'owner_id'],
      ['users', 'members', 'user_id'],
      ['projects', 'members', 'project_id'],
      ['projects', 'diagrams', 'project_id'],
      ['diagrams', 'revisions', 'diagram_id']
    ]
  },
  {
    id: 'event-driven',
    name: 'Event-driven services',
    category: 'Architecture',
    description: 'Producer, event bus, consumer and durable store.',
    nodes: [
      ['frontend', 'process', 'Frontend', 40, 180],
      ['producer', 'process', 'Event producer', 280, 180],
      ['bus', 'database', 'Event bus', 520, 180],
      ['workerA', 'process', 'Notification worker', 780, 56],
      ['workerB', 'process', 'Analytics worker', 780, 304],
      ['resultA', 'note', 'Send message', 1000, 56],
      ['resultB', 'database', 'Event warehouse', 1000, 304]
    ],
    edges: [
      ['frontend', 'producer'],
      ['producer', 'bus', 'publish'],
      ['bus', 'workerA', 'subscribe'],
      ['bus', 'workerB', 'subscribe'],
      ['workerA', 'resultA'],
      ['workerB', 'resultB']
    ]
  }
]

export const templates: readonly DiagramTemplate[] = definitions.map(buildTemplate)
