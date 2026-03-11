# Multi-Agent Communication & Orchestration Research

> Date: 2026-03-11
> Context: soma Chrome extension needs concurrent AI agents with inter-agent communication
> Current stack: pi-agent-core (single-agent runtime), Chrome extension (single JS process)

---

## 1. Problem Statement

soma needs a multi-agent architecture where:
- A **main agent** handles user Chat without blocking
- **Subagents** run background tasks (web scraping, data extraction, Spark processing)
- Subagents can **ask the main agent for clarification** mid-task
- Subagents **notify** the main agent on completion
- Main agent can **cancel** running subagents
- Subagents may **collaborate** (A finds URLs, B extracts data)
- All agents share **Loro CRDT** as the data layer
- Everything runs **in a Chrome extension** (single JS process, no child_process)

---

## 2. Framework Survey

### A. Google ADK (Agent Development Kit) for TypeScript

**Source**: [google/adk-js](https://github.com/google/adk-js) | [Multi-agent docs](https://google.github.io/adk-docs/agents/multi-agents/)

**Multi-agent orchestration**: First-class support with three workflow agent types:
- **SequentialAgent**: executes sub_agents in order, shared InvocationContext
- **ParallelAgent**: executes sub_agents concurrently, interleaved events, shared session.state
- **LoopAgent**: sequential loop with max_iterations and escalation

**Inter-agent communication**: Three mechanisms:
1. Shared session state (`context.state` / `output_key`) -- passive blackboard
2. LLM-driven delegation (`transfer_to_agent(agent_name)`) -- dynamic routing
3. AgentTool wrapping -- invoke agent as a tool synchronously

**Browser compatibility**: Builds to ESM and "web formats". Primary focus is server-side. No explicit browser-only runtime story. Depends on Google AI SDK.

**Bundle size**: Unknown (not published on bundlephobia). The `@google/adk` package is young (mid-2025). Likely large due to Google AI SDK dependency.

**Assessment for soma**: Good orchestration primitives but too tightly coupled to Google's AI stack. We use pi-ai as the LLM layer. The ParallelAgent + shared state pattern is worth borrowing conceptually, but the framework itself adds more than we need.

---

### B. OpenAI Agents SDK (TypeScript)

**Source**: [openai/openai-agents-js](https://github.com/openai/openai-agents-js) | [Docs](https://openai.github.io/openai-agents-js/)

**Multi-agent orchestration**: Through **handoffs** -- an agent delegates to another agent for a specific task. Agents can also be wrapped as tools for another agent.

**Inter-agent communication**: Message-based with streaming support. Handoffs carry context. Guardrails run in parallel with agent execution.

**Browser compatibility**: TypeScript-first SDK. Has browser-specific code (localStorage, matchMedia). Likely works in browser for core logic, but streaming/SSE may assume fetch APIs.

**Bundle size**: npm package `@openai/agents-js`, v0.2.71 as of March 2026. Size not documented. Moderate dependency tree.

**Assessment for soma**: Handoff pattern is elegant for sequential delegation but doesn't naturally model concurrent background agents or mid-task clarification requests. Tightly coupled to OpenAI's model. Not suitable as a framework, but the handoff concept is useful.

---

### C. Anthropic Claude Agent SDK

**Source**: [claude-agent-sdk on npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) | [Docs](https://platform.claude.com/docs/en/agent-sdk/overview)

**Multi-agent orchestration**: Not a multi-agent framework. It's a single-agent harness (the same loop that powers Claude Code) with tool calling, file operations, shell commands, and MCP integration. Multi-session coordination is handled at the Claude Code application layer (Agent Teams), not in the SDK.

**Browser compatibility**: Designed for Node.js environments (shell commands, file I/O). Not suitable for browser.

**Assessment for soma**: Not applicable. We already have pi-agent-core which is the browser-compatible equivalent.

---

### D. LangGraph.js

**Source**: [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs) | [Docs](https://docs.langchain.com/oss/javascript/langgraph/overview)

**Multi-agent orchestration**: Graph-based state machine. Two primary patterns:
- **Supervisor**: Central agent routes to specialists, controls all communication
- **Swarm**: Decentralized handoffs where agents decide when to transfer (a la OpenAI Swarm)

**Inter-agent communication**:
- Shared state via typed state schemas
- Handoff via LangGraph `Command` objects
- Agents can maintain private conversation history or share memory
- Parallel branches with automatic synchronization

**Concurrent execution**: Native parallel execution. Downstream nodes wait for all parallel branches to complete (scatter-gather).

**Browser compatibility**: LangGraph.js runs in Node.js. No documented browser-only mode. Heavy dependency on LangChain ecosystem.

**Bundle size**: `@langchain/langgraph` + `@langchain/core` + provider packages. Very large dependency tree. Unsuitable for Chrome extension bundle.

**Assessment for soma**: The graph-based state machine model is powerful but over-engineered for our use case. The LangChain dependency chain is a dealbreaker for a Chrome extension. However, the supervisor pattern + shared state + parallel branches is exactly what we need conceptually.

---

### E. KaibanJS

**Source**: [kaiban-ai/KaibanJS](https://github.com/kaiban-ai/KaibanJS) | [kaibanjs.com](https://www.kaibanjs.com/)

**Multi-agent orchestration**: Kanban-inspired task board. Team coordinates agents and their tasks. Sequential task execution with `{taskResult:taskN}` references between agents.

**Inter-agent communication**: Task-based workflow. Results pass between tasks. Redux-inspired state management with Zustand under the hood.

**Browser compatibility**: Explicitly supports React, Vue, Angular, NextJS, and Node.js. Designed to work in browser.

**Bundle size**: 23 dependencies, 48 versions. Package includes LangChain tool compatibility, which adds weight.

**Concurrent execution**: Task-board model is sequential by default. No native parallel agent execution documented.

**Assessment for soma**: Interesting Kanban metaphor, and the browser-first + Zustand-based approach is aligned with our stack. However, sequential task model doesn't fit our need for concurrent subagents. The LangChain dependency adds unwanted weight. The Redux-inspired state pattern is something we already have (Zustand + Loro).

---

### F. Vercel AI SDK 6

**Source**: [ai-sdk.dev](https://ai-sdk.dev/docs/agents/overview) | [GitHub](https://github.com/vercel/ai)

**Multi-agent orchestration**: Five patterns supported via composition:
1. Chaining (sequential)
2. Routing (dispatch to specialist)
3. Parallelization (concurrent specialists)
4. Orchestrator-Workers (coordinator splits, workers execute in parallel)
5. Evaluator-Optimizer (iterative feedback loop)

**Inter-agent communication**: Through function composition -- agents receive structured input and return results. No formal message bus. Subagents are called via tools. `ToolLoopAgent` is the core abstraction.

**Browser compatibility**: React, Next.js, Vue, Svelte, Node.js. Client-side streaming via hooks. Browser-compatible core.

**Bundle size**: `ai` package is moderate. Provider-agnostic core + per-provider adapters.

**Assessment for soma**: Closest to what we need in terms of patterns (Orchestrator-Workers, Parallelization). But it's designed around server-side execution with Vercel infrastructure. The `ToolLoopAgent` pattern of "subagent as tool" is exactly the right abstraction. We could implement this pattern on top of pi-agent-core without importing the SDK.

---

### G. CrewAI (TypeScript ports)

**Source**: [crewai-ts](https://github.com/ShMcK/crewai-ts), [crewai-js](https://github.com/codewithbro95/crewai-js) (unmaintained)

**Assessment for soma**: Both are unofficial ports of the Python CrewAI framework. crewai-js is unmaintained. crewai-ts aims for feature parity but is not production-ready. The role-based agent model (Agent has a role, backstory, goal) is too heavy for our subagent-as-temporary-role design. Not suitable.

---

### H. Microsoft AutoGen / Agent Framework

**Source**: [microsoft/autogen](https://github.com/microsoft/autogen)

**Multi-agent**: Powerful event-driven, asynchronous architecture. Merged with Semantic Kernel into "Microsoft Agent Framework" (Oct 2025).

**JS/TS support**: Primarily Python and .NET. TypeScript port is in early stages (GitHub issue #236). No production-ready JS package.

**Assessment for soma**: Not viable for our stack. Python/.NET focused.

---

### I. Mastra.ai

**Source**: [mastra.ai](https://mastra.ai/) | [GitHub](https://github.com/mastra-ai/mastra)

**Multi-agent orchestration**: Graph-based state machine workflows. Supports orchestrating multi-step AI operations, suspend/resume workflows, multi-agent workflows.

**Browser compatibility**: TypeScript-first, from the team behind Gatsby. Primarily server-side (Next.js, Node.js). No documented browser-only mode.

**Bundle size**: Full framework with RAG, memory, evals, MCP integration. Heavy for a Chrome extension.

**Assessment for soma**: Full-stack AI framework. Too heavy for our client-side Chrome extension use case. The workflow suspend/resume concept is interesting but we get that from pi-agent-core's state management.

---

### J. pi-agent-core (Current)

**Source**: [badlogic/pi-mono](https://github.com/badlogic/pi-mono) | [DeepWiki analysis](https://deepwiki.com/badlogic/pi-mono/3-pi-agent-core:-agent-framework)

**Architecture**: ~570 lines. Zero Node.js dependencies. Browser-compatible.

**Agent API**:
- `prompt(messages, tools)` -- start conversation
- `continue()` -- resume after assistant message
- `steer(message)` -- interrupt: delivered after current tool, skips remaining tools
- `followUp(message)` -- non-interrupting: delivered after agent finishes
- `abort()` -- cancel immediately
- `subscribe(event, handler)` -- lifecycle events (turn_start, agent_start, message_start/update/end, tool_execution_start/update/end, agent_end, turn_end)
- `getState()/setState()` -- custom application state

**Steering modes**: `"one-at-a-time"` (deliver one, wait, repeat) or `"all-at-once"` (batch). Both `steer()` and `followUp()` are synchronous and safe during streaming.

**Multi-agent**: No built-in orchestration. Higher-level apps (pi-coding-agent) implement coordination. Multiple Agent instances can coexist.

**Assessment for soma**: This is our foundation. It already runs in browser, has the right primitives (steer/followUp/abort/subscribe), and is provider-agnostic via streamFn. The question is what orchestration layer to build on top.

---

## 3. Claude Code's Multi-Agent Architecture (Reference)

Claude Code implements two tiers of parallelism. Both are relevant as design references.

### Subagents (within a single session)

- Spawned by the main agent as tool calls
- Run in their own context window
- **Cannot** message each other -- only report results back to the main agent
- Main agent acts as sole intermediary
- Good for focused tasks where only the result matters
- Lower token cost (results summarized back)

### Agent Teams (across sessions, experimental)

- Lead session spawns teammate sessions
- Each teammate is a full Claude Code instance
- **Can** message each other directly via mailbox system
- Shared task list with states: pending / in-progress / completed
- Task dependencies: pending tasks with unresolved deps can't be claimed
- File-based task locking prevents race conditions
- Communication: `message` (one-to-one) and `broadcast` (one-to-all)
- Idle notifications automatic
- Components: Team config, Task list, Mailbox, Team lead

**Key insight for soma**: Claude Code's subagent model (report-back-only) maps to our simple subagent use case. The Agent Teams model (shared task list + direct messaging + mailbox) maps to our inter-agent collaboration use case. But Claude Code runs as separate processes with file-based coordination, which we can't do in a Chrome extension. We need to adapt these patterns for a single-process, in-memory architecture.

---

## 4. Communication Patterns Analysis

### Pattern 1: Hub-and-Spoke (Supervisor)

```
Main Agent (Hub)
  |-- steer/cancel --> Subagent A
  |-- steer/cancel --> Subagent B
  +-- steer/cancel --> Subagent C
      ^ results/clarification requests ^
```

- Main agent is the sole coordinator
- Subagents only communicate with main, never with each other
- Simple to implement, easy to reason about
- **Maps to**: Claude Code subagents, Vercel Orchestrator-Workers
- **Limitation**: Agent A can't directly pass URLs to Agent B -- must go through main

### Pattern 2: Shared Blackboard

```
Main Agent ----> Blackboard (shared state) <---- Subagent A
                       |                            |
                 Subagent B <------------------> Subagent C
```

- All agents read/write to a shared state object
- No direct messaging; coordination via state changes + subscriptions
- **Maps to**: Google ADK's shared session.state, LangGraph's typed state schemas
- **Perfect fit for soma**: Loro CRDT IS the blackboard. Agents write nodes, other agents observe via CRDT subscriptions
- **Limitation**: No structured request/response; hard to implement "ask for clarification"

### Pattern 3: Message Bus (Event-Driven)

```
Main Agent <--> [Message Bus] <--> Subagent A
                      |
                Subagent B <--> Subagent C
```

- Agents publish/subscribe to typed channels
- Supports request/response, broadcast, and pub/sub
- **Maps to**: Claude Code Agent Teams' mailbox, Confluent's event-driven patterns
- **Strength**: Natural fit for clarification requests (subagent publishes "need-clarification" event)
- **Complexity**: Requires message routing, delivery guarantees, cleanup on agent termination

### Pattern 4: Hybrid (Blackboard + Message Bus) -- RECOMMENDED

```
Loro CRDT (Blackboard)          Message Bus (Coordination)
  |-- nodes/state               |-- task-delegated
  |-- results                   |-- clarification-needed
  +-- progress                  |-- task-completed
                                |-- task-cancelled
                                +-- agent-status
```

- Data flows through the shared blackboard (Loro CRDT)
- Coordination signals flow through the message bus
- **This is what we should build**

---

## 5. What Existing Frameworks Don't Solve for Us

| Requirement | Framework Coverage | Gap |
|---|---|---|
| Browser-only, single process | Only KaibanJS and pi-agent-core explicitly support browser | Most frameworks assume Node.js |
| Concurrent independent agents | Google ADK ParallelAgent, LangGraph parallel branches | But coupled to their LLM layer |
| Mid-task clarification | No framework solves this well | All assume one-way delegation |
| Shared CRDT data layer | No framework integrates with CRDT | All use their own state management |
| Lightweight bundle | pi-agent-core ~201KB | Everything else is 500KB+ with dependencies |
| steer/followUp during streaming | Only pi-agent-core | Unique to our current runtime |

**Conclusion**: No existing framework fits our constraints. We should build a thin orchestration layer on top of pi-agent-core.

---

## 6. Recommended Architecture: AgentOrchestrator

### Design Principles

1. **Build on pi-agent-core, not replace it** -- each agent is a pi-agent-core `Agent` instance
2. **Loro CRDT as the blackboard** -- all durable data (results, progress, state) flows through nodes
3. **Lightweight message bus for coordination** -- typed events for task lifecycle, not data
4. **No framework dependency** -- just TypeScript patterns (EventTarget, Promise, AbortController)
5. **Main agent is never blocked** -- subagent lifecycle is fully async

### Core Abstractions

```typescript
// === Message Bus (coordination signals, not data) ===

interface AgentMessage {
  id: string
  from: string          // agent ID
  to: string | '*'      // target agent ID or broadcast
  type: AgentMessageType
  payload: unknown
  timestamp: number
}

type AgentMessageType =
  | 'task-delegated'        // main -> subagent: here's your task
  | 'task-progress'         // subagent -> main: status update
  | 'task-completed'        // subagent -> main: done, here are result node IDs
  | 'task-failed'           // subagent -> main: error
  | 'clarification-needed'  // subagent -> main: I need more info
  | 'clarification-response'// main -> subagent: here's your answer
  | 'task-cancelled'        // main -> subagent: abort
  | 'data-available'        // agent -> agent: I produced data you might need

// === Agent Registry ===

interface SubagentHandle {
  id: string
  agent: Agent              // pi-agent-core Agent instance
  task: TaskDescriptor
  status: 'running' | 'waiting-clarification' | 'completed' | 'failed' | 'cancelled'
  abortController: AbortController
}

interface TaskDescriptor {
  id: string
  description: string       // natural language task description
  skills: string[]          // #skill node IDs to include
  tools: AgentTool[]        // tools available to this subagent
  parentTaskId?: string     // for subtask chains
  outputNodeIds?: string[]  // where to write results (Loro node IDs)
}

// === Orchestrator ===

class AgentOrchestrator {
  private mainAgent: Agent
  private subagents: Map<string, SubagentHandle>
  private bus: AgentMessageBus

  // Spawn a subagent for background work
  async delegate(task: TaskDescriptor): Promise<string> // returns subagent ID

  // Cancel a running subagent
  async cancel(subagentId: string): Promise<void>

  // Get status of all running subagents
  getStatus(): SubagentStatus[]

  // Subscribe to orchestrator events (for UI: badge, task list)
  on(event: OrchestratorEvent, handler: Function): Unsubscribe
}
```

### Message Bus Implementation

For a single-process Chrome extension, the message bus is trivially an EventTarget:

```typescript
class AgentMessageBus {
  private target = new EventTarget()
  private queues = new Map<string, AgentMessage[]>()  // per-agent mailbox

  send(msg: AgentMessage): void {
    // Direct delivery if agent is listening, else queue
    this.target.dispatchEvent(new CustomEvent(msg.to, { detail: msg }))
    // Also dispatch on type channel for broadcast monitoring
    this.target.dispatchEvent(new CustomEvent(msg.type, { detail: msg }))
  }

  subscribe(agentId: string, handler: (msg: AgentMessage) => void): () => void {
    const listener = (e: Event) => handler((e as CustomEvent).detail)
    this.target.addEventListener(agentId, listener)
    return () => this.target.removeEventListener(agentId, listener)
  }

  subscribeType(type: AgentMessageType, handler: (msg: AgentMessage) => void): () => void {
    const listener = (e: Event) => handler((e as CustomEvent).detail)
    this.target.addEventListener(type, listener)
    return () => this.target.removeEventListener(type, listener)
  }
}
```

**Why EventTarget over EventEmitter**: EventTarget is a browser-native API (zero dependencies). It supports the same pub/sub pattern. No npm package needed.

### Clarification Flow (Key Differentiator)

This is the hardest requirement -- a subagent pausing mid-task to ask the main agent a question:

```typescript
// Inside a subagent's tool execution:
async function extractPricingTool(args, update) {
  const pageContent = await fetchPage(args.url)

  if (ambiguousFormat(pageContent)) {
    // Subagent asks main agent for clarification
    const answer = await orchestrator.askClarification(
      subagentId,
      "Found two pricing tables on this page. Which one: 'Enterprise' or 'Developer'?"
    )
    // answer comes from main agent (which may ask the user)
    return extractFromTable(pageContent, answer.choice)
  }

  return extractAllPricing(pageContent)
}

// In AgentOrchestrator:
async askClarification(subagentId: string, question: string): Promise<ClarificationAnswer> {
  const handle = this.subagents.get(subagentId)
  handle.status = 'waiting-clarification'

  // Send clarification request to main agent
  this.bus.send({
    from: subagentId,
    to: 'main',
    type: 'clarification-needed',
    payload: { question }
  })

  // Return a promise that resolves when main agent responds
  return new Promise((resolve) => {
    const unsub = this.bus.subscribe(subagentId, (msg) => {
      if (msg.type === 'clarification-response') {
        handle.status = 'running'
        unsub()
        resolve(msg.payload as ClarificationAnswer)
      }
    })
  })
}
```

**How the main agent handles it**: The main agent receives the clarification-needed message. It can either:
1. Answer autonomously (if it has enough context)
2. Ask the user in Chat ("A background task needs input: ...")
3. Use `steer()` to inject the question into its own conversation

This maps perfectly to pi-agent-core's `steer()` mechanism -- the clarification message steers the main agent's attention.

### Inter-Subagent Collaboration

For Agent A finding URLs that Agent B needs to extract:

```
Option 1: Pipeline via Loro CRDT (preferred -- "everything is a node")
  Agent A writes URL nodes to a specific parent node
  Agent B subscribes to that parent's children via Loro

Option 2: Pipeline via message bus (for ephemeral coordination)
  Agent A sends 'data-available' message
  Agent B receives and processes
```

In practice, Option 1 is better because:
- Data persists in the node graph (user can see it)
- CRDT handles concurrent writes automatically
- Loro subscriptions are the natural notification mechanism

### Cancellation

Leverages pi-agent-core's `abort()` + standard `AbortController`:

```typescript
async cancel(subagentId: string): Promise<void> {
  const handle = this.subagents.get(subagentId)
  if (!handle) return

  // 1. Signal abort to all async operations
  handle.abortController.abort()

  // 2. Abort the pi-agent-core agent loop
  handle.agent.abort()

  // 3. Notify via message bus
  this.bus.send({
    from: 'main',
    to: subagentId,
    type: 'task-cancelled',
    payload: { reason: 'User cancelled' }
  })

  // 4. Cleanup
  handle.status = 'cancelled'
  this.subagents.delete(subagentId)
}
```

---

## 7. How This Maps to soma's Architecture

```
+---------------------------------------------+
|  Chrome Extension (single JS process)       |
|                                             |
|  +--------------------------------------+   |
|  |  AgentOrchestrator                   |   |
|  |  |-- Main Agent (pi-agent-core)      |   |
|  |  |   +-- Chat conversation loop      |   |
|  |  |-- Message Bus (EventTarget)       |   |
|  |  |-- Subagent A (pi-agent-core)      |   |
|  |  |   +-- Web scraping task           |   |
|  |  |-- Subagent B (pi-agent-core)      |   |
|  |  |   +-- Data extraction task        |   |
|  |  +-- Subagent C (pi-agent-core)      |   |
|  |      +-- Spark processing task       |   |
|  +--------------------------------------+   |
|                    |                        |
|  +--------------------------------------+   |
|  |  Loro CRDT (shared blackboard)       |   |
|  |  +-- All agents read/write nodes     |   |
|  +--------------------------------------+   |
|                    |                        |
|  +--------------------------------------+   |
|  |  Cloudflare Worker (pi-ai proxy)     |   |
|  |  +-- All agents share same proxy     |   |
|  +--------------------------------------+   |
+---------------------------------------------+
```

**Concurrency model**: All agents share the JS event loop. Each agent's LLM calls are async (fetch/SSE). While Agent A waits for its LLM response, Agent B can execute tools, and the main agent can process user input. This is cooperative multitasking via async/await -- no threads, no Web Workers needed.

**Why no Web Workers**: Web Workers would give true parallelism but can't access the DOM, chrome.* APIs, or share the Loro CRDT document (which is a complex in-memory structure). The overhead of serializing state to/from Workers outweighs the benefit. Our agents are I/O-bound (waiting for LLM APIs), not CPU-bound, so cooperative async is sufficient.

---

## 8. Framework Comparison Summary

| Criterion | Google ADK | OpenAI Agents | LangGraph.js | KaibanJS | Vercel AI SDK 6 | pi-agent-core | **Recommended** |
|---|---|---|---|---|---|---|---|
| Browser runtime | Partial | Partial | No | Yes | Partial | **Yes** | pi-agent-core base |
| Multi-agent built-in | Yes (3 types) | Handoffs | Graphs | Kanban tasks | Patterns | No | Build on top |
| Concurrent agents | ParallelAgent | No | Parallel branches | No | Parallel | Manual | EventTarget + async |
| Mid-task clarification | No | No | No | No | No | steer()/followUp() | steer() + message bus |
| Shared data layer | session.state | No | Typed state | Zustand | No | getState() | Loro CRDT |
| Cancellation | No | No | No | No | No | abort() | abort() + AbortController |
| Agent-to-agent comms | transfer_to_agent | Handoff | Command | Task results | Function args | N/A | Message bus (EventTarget) |
| Bundle size | Large | Medium | Very large | Large | Medium | **~201 KB** | ~201 KB + ~50 lines |
| Provider lock-in | Google AI | OpenAI | LangChain | LangChain | Multi | **None** (streamFn) | None |

---

## 9. Implementation Phases

### Phase 1: Single subagent, fire-and-forget
- AgentOrchestrator class with `delegate()` and `cancel()`
- Main agent spawns one subagent at a time
- Subagent writes results to Loro CRDT
- Completion notification via EventTarget
- UI: badge in Chat panel header

### Phase 2: Concurrent subagents + progress
- Multiple simultaneous subagents
- Progress updates via message bus
- Task list UI (running / completed / failed)
- Cancel individual tasks

### Phase 3: Clarification requests
- Subagent-to-main clarification flow
- Main agent decides: answer autonomously or ask user
- Waiting state for subagents

### Phase 4: Inter-agent collaboration
- Pipeline pattern via Loro CRDT subscriptions
- Agent A writes data nodes, Agent B observes and processes
- Dependency tracking between tasks

---

## 10. Key Takeaways

1. **No existing framework fits our constraints**. The combination of browser-only runtime, CRDT data layer, pi-agent-core as the agent loop, and mid-task clarification is unique enough that we need our own thin orchestration layer.

2. **The orchestration layer is small**. We estimate ~200-300 lines of TypeScript: AgentOrchestrator class, AgentMessageBus (EventTarget wrapper), SubagentHandle type, TaskDescriptor type. No new dependencies.

3. **Loro CRDT is the natural blackboard**. Instead of inventing a state-sharing mechanism, agents write results as nodes. Other agents and the UI observe via CRDT subscriptions. This is "everything is a node" extended to AI.

4. **pi-agent-core's steer()/followUp() is uniquely suited** for the clarification pattern. No other framework has an equivalent mid-stream message injection mechanism.

5. **The patterns we borrow**:
   - From Google ADK: ParallelAgent concept + shared state as blackboard
   - From Claude Code Agent Teams: Mailbox metaphor + task states (pending/running/completed)
   - From Vercel AI SDK: Orchestrator-Workers pattern + subagent-as-tool
   - From pi-agent-core: steer() for clarification, abort() for cancellation

6. **Google A2A protocol** (Agent-to-Agent, now a Linux Foundation project) defines a cross-vendor standard for agent interoperability. While it's designed for distributed systems (HTTP/JSON-RPC/SSE), its concepts -- Agent Cards (capability discovery), Task lifecycle, and agent-to-agent messaging -- could inform our internal message types. Not needed now, but worth watching as soma potentially needs to communicate with external agents in the future.

---

## Sources

### Frameworks
- [Google ADK TypeScript announcement](https://developers.googleblog.com/introducing-agent-development-kit-for-typescript-build-ai-agents-with-the-power-of-a-code-first-approach/)
- [Google ADK Multi-agent docs](https://google.github.io/adk-docs/agents/multi-agents/)
- [Google ADK GitHub (adk-js)](https://github.com/google/adk-js)
- [OpenAI Agents SDK TypeScript](https://openai.github.io/openai-agents-js/)
- [OpenAI Agents SDK GitHub](https://github.com/openai/openai-agents-js)
- [Claude Agent SDK on npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [Claude Agent SDK docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [LangGraph.js GitHub](https://github.com/langchain-ai/langgraphjs)
- [LangGraph.js Overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LangGraph Swarm](https://github.com/langchain-ai/langgraph-swarm-py)
- [KaibanJS](https://www.kaibanjs.com/)
- [KaibanJS GitHub](https://github.com/kaiban-ai/KaibanJS)
- [Vercel AI SDK 6 blog](https://vercel.com/blog/ai-sdk-6)
- [Vercel AI SDK Agents overview](https://ai-sdk.dev/docs/agents/overview)
- [Mastra.ai](https://mastra.ai/)
- [Mastra GitHub](https://github.com/mastra-ai/mastra)
- [Microsoft AutoGen](https://github.com/microsoft/autogen)
- [CrewAI-TS](https://github.com/ShMcK/crewai-ts)

### pi-agent-core
- [pi-mono GitHub](https://github.com/badlogic/pi-mono)
- [pi-agent-core DeepWiki](https://deepwiki.com/badlogic/pi-mono/3-pi-agent-core:-agent-framework)
- [pi-agent-core on npm](https://www.npmjs.com/package/@mariozechner/pi-agent-core)
- [Agent Loop and State Management](https://deepwiki.com/badlogic/pi-mono/3.1-agent-and-transport-layer)

### Claude Code Architecture
- [Claude Code Agent Teams docs](https://code.claude.com/docs/en/agent-teams)
- [Claude Code Agent Teams guide](https://claudefa.st/blog/guide/agents/agent-teams)
- [Claude Code Async workflows](https://claudefa.st/blog/guide/agents/async-workflows)
- [Claude Code Sub-Agent patterns](https://claudefa.st/blog/guide/agents/sub-agent-best-practices)
- [Claude Code Swarms](https://addyosmani.com/blog/claude-code-agent-teams/)

### Communication Patterns
- [5 Coordination Patterns for Multi-Agent AI](https://dev.to/triqual/multi-agent-ai-5-coordination-patterns-i-learned-the-hard-way-kbk)
- [Building AI Agent Workflows with Vercel AI SDK](https://www.callstack.com/blog/building-ai-agent-workflows-with-vercels-ai-sdk-a-practical-guide)
- [Google A2A Protocol](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [A2A Protocol spec](https://a2a-protocol.org/latest/)
- [LangGraph Multi-Agent tutorial](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/langgraph-multi-agent-systems-complete-tutorial-examples)
- [Blackboard Pattern for Multi-Agent Systems](https://medium.com/@dp2580/building-intelligent-multi-agent-systems-with-mcps-and-the-blackboard-pattern-to-build-systems-a454705d5672)
- [4 JS Frameworks for Multi-Agent LLM Orchestration](https://dev.to/kaibanjs/javascript-catches-up-4-modern-frameworks-for-multi-agent-llm-orchestration-51fn)
