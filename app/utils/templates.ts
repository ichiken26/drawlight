import { createNode, type Diagram, type NodeKind, type DiagramKind, type EntityField, type Cardinality, type MessageType } from './model'

type FieldSpec = readonly [name: string, dataType: string, key?: 'PK' | 'FK']
type NodeSpec = readonly [id: string, kind: NodeKind, label: string, x: number, y: number, fields?: readonly FieldSpec[]]
type EdgeSpec = readonly [from: string, to: string, label?: string, semantic?: Cardinality | MessageType]

interface TemplateSpec {
  kind?: DiagramKind
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
  previewEdges: readonly { x1: number; y1: number; x2: number; y2: number }[]
}

/**
 * All templates use the same normalized document format as the editor and MCP.
 * Compact node/edge tuples make additions reviewable without duplicating styles,
 * dimensions, or generated IDs in every preset.
 */
function buildTemplate(spec: TemplateSpec): DiagramTemplate {
  const diagram: Diagram = {
    version: 2,
    kind: spec.kind || 'flowchart',
    title: spec.name,
    nodes: spec.nodes.map(([id, kind, label, x, y, fieldSpecs]) => {
      const node = createNode(id, kind, label, x, y)
      if (kind === 'entity' && fieldSpecs) {
        node.fields = fieldSpecs.map(([name, dataType, key], index): EntityField => ({
          id: `${id}-field-${index + 1}`, name, dataType, key: key || null
        }))
        node.h = Math.max(72, 50 + node.fields.length * 25)
      }
      return node
    }),
    edges: spec.edges.map(([from, to, label = '', semantic], index) => ({
      id: `${spec.id}-edge-${index + 1}`,
      from, to, label,
      ...(spec.kind === 'er' ? { cardinality: (semantic || 'one-to-many') as Cardinality } : {}),
      ...(spec.kind === 'sequence' ? { messageType: (semantic || 'call') as MessageType } : {})
    }))
  }
  const byId = new Map(diagram.nodes.map(node => [node.id, node]))
  const previewEdges = diagram.edges.flatMap(edge => {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) return []
    return [{ x1: from.x + from.w / 2, y1: from.y + from.h / 2,
      x2: to.x + to.w / 2, y2: to.y + to.h / 2 }]
  })
  return { id: spec.id, name: spec.name, category: spec.category, description: spec.description, diagram, previewEdges }
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
    id: 'er-saas',
    kind: 'er',
    name: 'ER · SaaS schema',
    category: 'ER diagram',
    description: 'Tables, typed columns, primary/foreign keys and relationship cardinality.',
    nodes: [
      ['users', 'entity', 'users', 60, 60, [['id', 'uuid', 'PK'], ['email', 'varchar'], ['created_at', 'timestamp']]],
      ['projects', 'entity', 'projects', 430, 60, [['id', 'uuid', 'PK'], ['owner_id', 'uuid', 'FK'], ['name', 'varchar']]],
      ['diagrams', 'entity', 'diagrams', 800, 60, [['id', 'uuid', 'PK'], ['project_id', 'uuid', 'FK'], ['kind', 'varchar']]],
      ['memberships', 'entity', 'memberships', 430, 300, [['user_id', 'uuid', 'FK'], ['project_id', 'uuid', 'FK'], ['role', 'varchar']]]
    ],
    edges: [
      ['users', 'projects', 'owns', 'one-to-many'],
      ['users', 'memberships', 'joins', 'one-to-many'],
      ['projects', 'memberships', 'has', 'one-to-many'],
      ['projects', 'diagrams', 'contains', 'one-to-many']
    ]
  },
  {
    id: 'er-blog',
    kind: 'er',
    name: 'ER · Blog database',
    category: 'ER diagram',
    description: 'Users, posts and comments with 1:N relationships.',
    nodes: [
      ['users', 'entity', 'users', 60, 96, [['id', 'uuid', 'PK'], ['handle', 'varchar']]],
      ['posts', 'entity', 'posts', 440, 96, [['id', 'uuid', 'PK'], ['user_id', 'uuid', 'FK'], ['body', 'text']]],
      ['comments', 'entity', 'comments', 800, 96, [['id', 'uuid', 'PK'], ['post_id', 'uuid', 'FK'], ['message', 'text']]]
    ],
    edges: [['users', 'posts', 'writes', 'one-to-many'], ['posts', 'comments', 'has', 'one-to-many']]
  },
  {
    id: 'sequence-auth',
    kind: 'sequence',
    name: 'Sequence · API authentication',
    category: 'Sequence diagram',
    description: 'Chronological request, database lookup and response messages.',
    nodes: [
      ['browser', 'participant', 'Browser', 60, 64],
      ['nuxt', 'participant', 'Nuxt server', 330, 64],
      ['api', 'participant', 'Gleam API', 610, 64],
      ['db', 'participant', 'Database', 890, 64]
    ],
    edges: [
      ['browser', 'nuxt', 'GET /dashboard', 'call'],
      ['nuxt', 'api', 'Verify token', 'call'],
      ['api', 'db', 'Find session', 'call'],
      ['db', 'api', 'Session record', 'return'],
      ['api', 'nuxt', 'Auth result', 'return'],
      ['nuxt', 'browser', 'HTML response', 'return']
    ]
  },
  {
    id: 'sequence-events',
    kind: 'sequence',
    name: 'Sequence · Event processing',
    category: 'Sequence diagram',
    description: 'Publish, background processing and acknowledgement.',
    nodes: [
      ['web', 'participant', 'Web app', 60, 64],
      ['api', 'participant', 'API', 350, 64],
      ['queue', 'participant', 'Event bus', 640, 64],
      ['worker', 'participant', 'Worker', 930, 64]
    ],
    edges: [
      ['web', 'api', 'POST /jobs', 'call'],
      ['api', 'queue', 'Enqueue job', 'async'],
      ['api', 'web', '202 Accepted', 'return'],
      ['queue', 'worker', 'Deliver event', 'async'],
      ['worker', 'api', 'Report result', 'async']
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
