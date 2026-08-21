# The Pattern Oracle Corpus

A reference corpus of software design patterns, architectural primitives, and idioms — organized for fast contract→pattern matching by an oracle subagent.

Each entry follows this template:

> **Name** (aliases) — *Category* — Source
> **Problem shape:** the recognizable contract-level signal that triggers this pattern.
> **Properties / invariants:** what is true once you commit.
> **Sketch:** the structural shape (collaborators, key methods).
> **Don't reach for it when:** common misuses / wrong-tool flags.

---

## TABLE OF CONTENTS

1. **Problem-Shape Index** — "I need to..." → candidate patterns
2. **GoF Creational Patterns**
3. **GoF Structural Patterns**
4. **GoF Behavioral Patterns**
5. **PEAA Domain Logic Patterns**
6. **PEAA Data Source / Object-Relational Patterns**
7. **PEAA Web Presentation Patterns**
8. **PEAA Distribution / Session / Base Patterns**
9. **Domain-Driven Design — Tactical**
10. **Domain-Driven Design — Strategic**
11. **Enterprise Integration Patterns — Channels & Construction**
12. **Enterprise Integration Patterns — Routing**
13. **Enterprise Integration Patterns — Transformation**
14. **Enterprise Integration Patterns — Endpoints & System Management**
15. **POSA — Architectural & Concurrency Patterns**
16. **Concurrency Primitives**
17. **Cloud / Distributed Resilience Patterns**
18. **Cloud / Data Management Patterns**
19. **Microservices Patterns**
20. **Architectural Styles**
21. **Reactive & Streaming Patterns**
22. **Functional Programming Patterns**
23. **Caching Patterns**
24. **Security Patterns**
25. **Configuration / Deployment / Release Patterns**
26. **Testing Patterns (xUnit / Meszaros)**
27. **Refactoring Primitives (Fowler)**
28. **Anti-patterns & Smell Triggers**

---

## 1. PROBLEM-SHAPE INDEX ("I need to…")

This is the primary navigation aid. Match a contract clause to the left column and consult the candidates on the right.

### Behavior, capability, and extension
- **Add capabilities optionally / stack cross-cutting concerns (logging, retry, caching, auth) without modifying core** → **Decorator**, Chain of Responsibility, Interceptor, Aspect, Middleware/Pipeline, Around-Advice, Wrapper Facade
- **Make a behavior swappable at runtime / multiple interchangeable implementations behind one interface** → **Strategy**, Bridge, Policy, Plugin, Microkernel
- **Defer choice of concrete type to subclasses or configuration** → Factory Method, Abstract Factory, Service Locator, Dependency Injection, Component Configurator
- **Encapsulate an algorithm with steps subclasses can fill in** → Template Method, Hook Method, Skeletal Implementation
- **Add behavior to existing class without changing its source** → Decorator, Visitor, Extension Method, Open Host Service, Wrapper, Adapter, Mixin
- **Switch behavior based on object state** → State, Finite State Machine, State Pattern (GoF)
- **Encapsulate a request as a first-class object (queueable/undoable/loggable)** → **Command**, Memento (for undo), Job, Action

### Construction & lifecycle
- **The constructor is going to keep growing / many optional parameters** → **Builder**, Fluent Builder, Step Builder, Parameter Object, Named Arguments idiom
- **Single source of truth for some collection with populate / lookup / lifetime** → **Registry**, Service Locator, Singleton (with caution), Identity Map, Object Pool
- **Hide instantiation of family of related objects** → Abstract Factory, Factory Method, Kit
- **Cheap copy of complex object** → Prototype, Copy Constructor, Persistent Data Structure
- **Exactly one instance with global access** → Singleton (caution), Monostate, Borg, Module pattern; prefer DI-scoped lifetime
- **Recycle expensive resources** → Object Pool, Connection Pool, Thread Pool, Flyweight (for shared immutable state)
- **Choose implementation based on configuration / plugin** → Plugin, Service Provider Interface (SPI), Component Configurator, Strategy + Factory

### Interaction & communication
- **Broadcast events to N consumers** → **Observer**, Publish-Subscribe, Event Bus, Domain Event, Reactive Subject, Multicast Channel
- **Decouple sender and receiver in time / space** → Message Channel, Queue, Mediator, Event Bus, Actor, Promise/Future
- **Coordinate multiple objects without them knowing each other** → Mediator, Process Manager, Saga Orchestrator, Workflow Engine
- **One request handled by one of several handlers** → Chain of Responsibility, Selective Consumer, Content-Based Router, Dispatcher
- **Iterate over a collection without exposing its structure** → Iterator, Cursor, Generator, Stream
- **Expose a simple façade over a complex subsystem** → **Facade**, Service Layer, Application Service, Remote Facade, API Gateway
- **Translate one interface to another** → **Adapter**, Anti-Corruption Layer, Wrapper Facade, Gateway, Mapper
- **Stand in for an expensive / remote / protected object** → **Proxy** (Remote, Virtual, Protection, Smart, Caching)
- **Decouple abstraction from implementation so they vary independently** → Bridge, Pluggable Implementation
- **Treat tree-like structures uniformly with leaves** → Composite, Hierarchical Visitor

### State, persistence, and data
- **Persist objects to a relational store** → Active Record, Data Mapper, Repository, Row Data Gateway, Table Data Gateway
- **Hide query construction from domain code** → Repository, Query Object, Specification, Criteria
- **Avoid loading the same row twice in a session** → **Identity Map**
- **Track which objects need saving in a transaction boundary** → **Unit of Work**, Change Tracker
- **Defer loading until the data is needed** → Lazy Load (Lazy Initialization, Virtual Proxy, Value Holder, Ghost)
- **Single source of truth where everything reads/writes** → Repository, Registry, Identity Map
- **Add domain semantics over a primitive value** → Value Object, Tiny Type, Money pattern
- **Materialize a derived view for queries** → Materialized View, CQRS Read Model, Index Table, Projection
- **Append-only history-of-truth** → **Event Sourcing**, Write-Ahead Log, Append-Only Store
- **Separate read and write models** → **CQRS**, Command-Query Separation, Read Replica
- **Span a transaction across multiple services** → **Saga** (orchestration / choreography), Compensating Transaction, Outbox
- **Reliably publish event when state changes (no dual-write)** → **Transactional Outbox**, Inbox, Change Data Capture, Transaction Log Tailing
- **Make a side-effecting operation safely retryable** → **Idempotency Key**, Idempotent Receiver, At-Least-Once + Dedup
- **Validate complex predicates against domain objects** → Specification, Composite Specification, Rule Object

### Resilience, scale, and concurrency
- **They want retry** → **Retry** (with exponential backoff, jitter), Hedging
- **Stop calling a failing dependency** → **Circuit Breaker**, Fail Fast
- **Cap concurrent work to protect a resource / isolate failures** → **Bulkhead**, Semaphore, Thread Pool, Rate Limiter
- **Bound how long we will wait** → **Timeout**, Deadline Propagation
- **Smooth bursty load / decouple producer from consumer rate** → Queue-Based Load Leveling, Buffer, Backpressure, Throttling
- **Fan out work to many workers** → Competing Consumers, Worker Thread, Fork-Join, Scatter-Gather, Map-Reduce
- **Choose one leader from many** → Leader Election, Singleton-of-Cluster, Consensus
- **Mutate shared state safely** → Monitor, Lock, Read-Write Lock, CAS, Immutable Object, Thread Confinement, Copy-on-Write
- **Coordinate completion of N tasks** → Latch, Barrier, Future Aggregator, CompletionService
- **Async result will be available later** → **Future / Promise**, Async/Await, Continuation, Callback
- **React to many I/O events on few threads** → Reactor, Proactor, Selector, Event Loop
- **Provide graceful degradation when something fails** → Fallback, Static Default, Cached Stale, Bulkhead

### System / topology
- **Hide the location and identity of services from callers** → Service Registry, Service Discovery (client/server-side), Ambassador, DNS-based discovery
- **Single ingress for many backend services** → API Gateway, Backends-for-Frontends, Reverse Proxy, Edge Service
- **Out-of-process helper attached to each instance** → **Sidecar**, Ambassador, Service Mesh (Envoy/Istio)
- **Replace a legacy system gradually** → **Strangler Fig**, Branch by Abstraction, Parallel Run
- **Isolate domain from frameworks/IO** → **Hexagonal (Ports & Adapters)**, Clean, Onion Architecture
- **Plug optional features into a core** → Microkernel, Plugin, Component Configurator, Extension Interface

### Configuration, deployment, observability
- **Toggle features without redeploying** → Feature Flag / Toggle, Dark Launch, Canary
- **Roll out to a subset of users to test in production** → Canary, Blue/Green, Shadow Traffic, Ring Deployment
- **Externalize config from code** → Externalized Configuration, External Configuration Store, 12-Factor Config
- **Observe across services** → Distributed Tracing, Correlation ID, Log Aggregation, Health Check API, Application Metrics

### Security
- **Federated authentication** → OAuth 2.0, OIDC, SAML, Federated Identity, JWT
- **Authorize access by role or attribute** → RBAC, ABAC, Capability-based, Policy-based Access Control
- **Encrypt-in-flight gateway / centralize TLS** → Gateway Offloading, Edge Termination
- **Hide internal services / scrub requests** → Gatekeeper, Valet Key, API Gateway, WAF

### Testing
- **Replace dependency in a test** → **Test Double** (Dummy, Stub, Spy, Mock, Fake)
- **Build varied test inputs cheaply** → Test Data Builder, Object Mother, Fixture
- **Make untestable async/UI code testable** → Humble Object, Passive View
- **Verify two services agree on contract** → Consumer-Driven Contract Test
- **Compare large output to gold copy** → Snapshot Test, Approval Test
- **Generate inputs to find counterexamples** → Property-Based Test

---

## 2. GoF CREATIONAL PATTERNS *(Source: Gamma/Helm/Johnson/Vlissides 1994)*

### Abstract Factory (Kit)
*Creational — GoF*
**Problem shape:** You need to create families of related objects whose concrete types must vary together (e.g., LookAndFeel produces Buttons + Scrollbars matching one theme).
**Properties:** Client code is decoupled from concrete classes; swapping the factory swaps an entire family consistently. Adding new families is easy, adding new product types is invasive.
**Sketch:** `AbstractFactory` interface with `createA()`, `createB()`. Each `ConcreteFactoryX` returns matching `ConcreteAX`, `ConcreteBX`. Client only sees the interfaces.
**Don't reach for it when:** there's only one product type (use Factory Method); products don't need to come from a coordinated family; you only need configuration variation (use Strategy).

### Builder
*Creational — GoF*
**Problem shape:** "The constructor is going to keep growing." Many optional/named parameters; construction has invariants that must be checked atomically; you want a fluent assembly DSL.
**Properties:** Separates how a thing is assembled from what it is; can produce different representations from the same steps; immutable result if `build()` returns frozen object.
**Sketch:** `Builder` with `withX(...).withY(...).build() : Product`. Optionally a `Director` that orchestrates a fixed assembly recipe.
**Don't reach for it when:** ≤3 parameters; all required (use plain constructor or factory); no validation needed.

### Factory Method
*Creational — GoF*
**Problem shape:** A class can't anticipate which concrete subclass it must instantiate; subclasses should choose. Or: hide `new` behind a name with semantic meaning (`User.fromEmail(...)`).
**Properties:** Defines an interface for creating an object but lets subclasses decide; pairs naturally with Template Method.
**Sketch:** `abstract Creator { abstract Product create(); doWork(){ p = create(); ... } }`. `ConcreteCreator` overrides `create`.
**Don't reach for it when:** one factory function in a module suffices; you actually need a family (Abstract Factory) or configuration-driven creation (DI).

### Prototype
*Creational — GoF*
**Problem shape:** You need new objects by cloning an exemplar — construction is expensive, configuration-heavy, or known only at runtime.
**Properties:** `clone()` returns an independent copy; deep vs. shallow distinction matters; registry of prototypes acts as a factory.
**Sketch:** `Prototype { clone() : Prototype }`; `ConcretePrototype` overrides; client uses `proto.clone()`.
**Don't reach for it when:** values are immutable already (just share); construction is cheap; deep cloning surfaces aliasing bugs.

### Singleton
*Creational — GoF (often considered an anti-pattern in modern code)*
**Problem shape:** Exactly one instance must exist process-wide and clients need a global access point.
**Properties:** Globally reachable; lifetime tied to process; testability and thread-safety pitfalls; double-checked locking is the canonical hazard.
**Sketch:** Private constructor; static `getInstance()`; lazy or eager initialization.
**Don't reach for it when:** what you actually want is a DI-scoped lifetime, a Registry, a Monostate, or a per-request cache. Prefer DI container managed singletons over hand-rolled ones.

---

## 3. GoF STRUCTURAL PATTERNS

### Adapter (Wrapper)
*Structural — GoF*
**Problem shape:** Two interfaces need to talk and don't match. Legacy or third-party API differs from what your code expects.
**Properties:** Translates calls 1:1 or with light reshaping; preserves semantics; usually thin.
**Sketch:** `Target` is what the client wants; `Adaptee` is what exists; `Adapter implements Target` and delegates to `Adaptee`.
**Don't reach for it when:** the translation is non-trivial domain mapping (use Anti-Corruption Layer); both sides are yours and you can change one (just refactor).

### Bridge
*Structural — GoF*
**Problem shape:** Two orthogonal axes of variation must be combined without `O(n*m)` class explosion (e.g., Shape × Renderer).
**Properties:** Decouples abstraction from implementation; both can evolve independently; composition over inheritance.
**Sketch:** `Abstraction` holds reference to `Implementor`; `RefinedAbstractionX` extends `Abstraction`; `ConcreteImplementorY implements Implementor`.
**Don't reach for it when:** you only have one axis varying (Strategy is enough); the abstraction and implementation are very tightly coupled in domain meaning.

### Composite
*Structural — GoF*
**Problem shape:** Tree-like structure where leaves and groups should be treated uniformly (file/folder, group/atom, AST nodes).
**Properties:** Recursive operations; uniform interface across leaves and composites; easy whole-part traversal.
**Sketch:** `Component` interface; `Leaf implements Component`; `Composite implements Component` and contains `List<Component>`; operations recurse.
**Don't reach for it when:** structure is flat; leaves and composites genuinely have different APIs (forcing uniformity creates `notSupported()` methods).

### Decorator (Wrapper)
*Structural — GoF*
**Problem shape:** "They want retry / they want to add capabilities optionally." Stacking cross-cutting concerns (logging, caching, auth, retry, timing) over a core, dynamically and composably.
**Properties:** Decorator implements the same interface as the wrapped object → uniform I/O at every layer; layers compose by nesting; order matters; transparent to callers.
**Sketch:** `Component` interface; `ConcreteComponent` is the core; `Decorator implements Component` and holds a `Component`; `ConcreteDecoratorX` overrides specific methods.
**Don't reach for it when:** the added behavior changes the interface (use Adapter); only one fixed wrapper is needed (just inline it); stacking creates ordering dependencies that aren't documented.

### Facade
*Structural — GoF*
**Problem shape:** A subsystem has many fine-grained classes and clients only need a few high-level use cases.
**Properties:** Reduces coupling; offers a use-case-shaped API; doesn't prevent advanced clients from going around.
**Sketch:** `Facade` exposes a small API and delegates to many subsystem classes.
**Don't reach for it when:** the "facade" becomes a god-object accreting unrelated operations; you actually need an Adapter or Service Layer.

### Flyweight
*Structural — GoF*
**Problem shape:** Vast number of fine-grained objects share most of their state and memory is the bottleneck (glyphs, particles, tile sprites).
**Properties:** Splits intrinsic (shared, immutable) from extrinsic (per-context) state; flyweights are pooled; identity ≠ instance identity.
**Sketch:** `FlyweightFactory.get(key) → Flyweight`; clients pass extrinsic state to operations.
**Don't reach for it when:** few objects; mutable shared state; readability cost not worth memory savings.

### Proxy
*Structural — GoF*
**Problem shape:** A stand-in is needed that controls access to the real object: remote, lazy/expensive, protected, cached, smart-pointer.
**Properties:** Same interface as subject; transparent to caller; can add lifecycle, access control, caching, remoting.
**Sketch:** `Subject` interface; `RealSubject implements Subject`; `Proxy implements Subject` holds a `RealSubject` (or its handle) and intercepts.
**Variants:** Remote, Virtual (lazy), Protection, Smart Reference, Caching, Synchronization.
**Don't reach for it when:** the wrapper modifies the response materially (use Decorator); you really want a Mediator; transparency is undesirable.

---

## 4. GoF BEHAVIORAL PATTERNS

### Chain of Responsibility
*Behavioral — GoF*
**Problem shape:** A request should be tried by a sequence of handlers until one handles it; senders shouldn't know which handler succeeds.
**Properties:** Decoupling of sender/receiver; handlers are pluggable and reorderable; risk of unhandled requests.
**Sketch:** `Handler { successor; handle(req) }`. Each handler decides to handle or pass to `successor`.
**Don't reach for it when:** all handlers always run (use a Pipeline); routing is data-driven (use a Content-Based Router or Dispatcher table).

### Command
*Behavioral — GoF*
**Problem shape:** Encapsulate a request as an object so it can be queued, logged, undone, parameterized, or sent across boundaries.
**Properties:** First-class actions; supports undo via Memento; pairs with Queue, Job, Invoker.
**Sketch:** `Command { execute(); undo()? }`; `ConcreteCommand` holds receiver + args; `Invoker` runs commands.
**Don't reach for it when:** the action is trivial and not stored, queued, or replayed.

### Interpreter
*Behavioral — GoF*
**Problem shape:** A small, stable language must be parsed and executed (rules engines, regex, query DSL).
**Properties:** Each grammar rule = a class; easy to extend; not for performance-sensitive parsing.
**Sketch:** `AbstractExpression { interpret(ctx) }`; `Terminal` and `Nonterminal` subclasses form an AST.
**Don't reach for it when:** grammar is large/complex (use parser generator); performance matters (compile, don't tree-walk).

### Iterator (Cursor)
*Behavioral — GoF*
**Problem shape:** Traverse a collection without exposing its structure; multiple simultaneous traversals.
**Properties:** Decouples traversal algorithm from container; can be external (client drives) or internal (collection drives).
**Sketch:** `Iterator { hasNext(); next() }`; `Iterable { iterator() }`.
**Don't reach for it when:** the language already provides one (just use it).

### Mediator
*Behavioral — GoF*
**Problem shape:** A web of objects communicate many-to-many; you want to centralize coordination so each object only knows the mediator.
**Properties:** Reduces coupling between colleagues at the cost of a god-mediator risk; centralizes interaction logic.
**Sketch:** `Mediator` interface with `notify(sender, event)`; `Colleague` holds reference to mediator; concrete mediator implements coordination.
**Don't reach for it when:** the mediator gets bloated → consider Process Manager or break into multiple smaller mediators.

### Memento
*Behavioral — GoF*
**Problem shape:** Capture and restore an object's internal state without exposing internals (undo/redo, snapshots).
**Properties:** Originator's encapsulation preserved; caretaker stores opaque mementos.
**Sketch:** `Originator.save() → Memento`; `Originator.restore(Memento)`; `Caretaker` holds mementos.
**Don't reach for it when:** state is huge (use Event Sourcing); shallow copy fails because of aliasing.

### Observer (Pub/Sub)
*Behavioral — GoF*
**Problem shape:** "Broadcast events." Multiple consumers must react to state changes in a subject without the subject knowing them.
**Properties:** One-to-many dependency; loose coupling; ordering and re-entrancy hazards; potential for memory leaks if listeners aren't unsubscribed.
**Sketch:** `Subject { attach(o); detach(o); notify() }`; `Observer { update(event) }`.
**Don't reach for it when:** you need persistent, durable, cross-process events (use Pub/Sub messaging); strong delivery guarantees (use a queue); ordering matters strictly (use Event Sourcing or a single dispatcher).

### State
*Behavioral — GoF*
**Problem shape:** Object behavior changes based on internal state with many transitions; conditionals on a state field are proliferating.
**Properties:** Each state is an object; transitions are explicit; replaces switch statements.
**Sketch:** `Context` holds current `State`; `State.handle(ctx)` may call `ctx.setState(...)`.
**Don't reach for it when:** a simple enum + table suffices; states aren't really polymorphic.

### Strategy (Policy)
*Behavioral — GoF*
**Problem shape:** "Multiple interchangeable implementations behind one interface." A choice point in the algorithm at runtime (sort order, compression algo, pricing rule).
**Properties:** Encapsulates a family of algorithms; client picks at construction or runtime; easily testable.
**Sketch:** `Strategy { execute(input) }`; `ConcreteStrategyX` implements; `Context` holds a `Strategy` reference.
**Don't reach for it when:** there will only ever be one implementation; the variation is data, not algorithm (use a parameter).

### Template Method
*Behavioral — GoF*
**Problem shape:** Algorithm skeleton is fixed but specific steps vary by subclass.
**Properties:** Inversion of control ("don't call us, we'll call you"); enforces invariants in the base class.
**Sketch:** Base class with `final` (or non-overridable) `algorithm()` calling abstract/hook `step1()`, `step2()`.
**Don't reach for it when:** inheritance hurts more than it helps — favor Strategy with composition.

### Visitor
*Behavioral — GoF*
**Problem shape:** You need to add new operations over a stable hierarchy of types without modifying the types (compiler passes, AST walkers).
**Properties:** Double dispatch; adding new operations is easy, adding new types is invasive.
**Sketch:** `Visitor { visitA(A); visitB(B) }`; `Element { accept(Visitor) }`; each `Element` calls back `visitor.visitX(this)`.
**Don't reach for it when:** type hierarchy churns; pattern matching/sum types are available natively.

---

## 5. PEAA — DOMAIN LOGIC PATTERNS *(Source: Fowler, Patterns of Enterprise Application Architecture)*

### Transaction Script
*Domain logic — PEAA*
**Problem shape:** Each business request is a procedure with little overlap between requests; CRUD-heavy, low complexity.
**Properties:** Easy to start, hard to scale conceptually; duplication grows; weak abstraction over domain.
**Sketch:** A class per use case; method per request; calls down into data access directly.
**Don't reach for it when:** business logic is rich and overlapping → use Domain Model.

### Domain Model
*Domain logic — PEAA*
**Problem shape:** Complex, overlapping business rules; behavior naturally clusters around entities; rules must be reused across requests.
**Properties:** Behavior + state on the same object; emergent ubiquitous language; pairs with DDD tactical patterns.
**Sketch:** Entities, Value Objects, Aggregates with invariant-preserving methods; persistence via Data Mapper or Repository.
**Don't reach for it when:** logic is genuinely thin (Transaction Script is fine); team doesn't have OO domain modeling experience.

### Table Module
*Domain logic — PEAA*
**Problem shape:** Logic is naturally organized per database table, not per row; record-set-oriented frameworks (e.g., classic ADO.NET DataSet).
**Properties:** One class per table that operates over RecordSets.
**Don't reach for it when:** record-set abstractions aren't first-class in your stack.

### Service Layer
*Domain logic — PEAA*
**Problem shape:** You need a clear API boundary between presentation/integration and the domain model; coordination of multiple domain operations and transactions.
**Properties:** Coarse-grained operations; transactional boundary; orchestrates domain objects and repositories; an Application Service in DDD terms.
**Sketch:** `XService { doUseCase(cmd) }` opens transaction, loads aggregates via repos, calls domain methods, commits.
**Don't reach for it when:** trivial CRUD with no orchestration (controller can call repo directly).

---

## 6. PEAA — DATA SOURCE & OBJECT-RELATIONAL PATTERNS

### Row Data Gateway
*Data source — PEAA*
**Problem shape:** One object per row hides SQL while letting domain be plain.
**Sketch:** Class with finders + per-row instance with field accessors. Domain talks to gateway.

### Table Data Gateway
*Data source — PEAA*
**Problem shape:** One object encapsulates SQL for a whole table; returns record sets.
**Don't reach for it when:** you want object identity per row → use Row Data Gateway or Data Mapper.

### Active Record
*Data source — PEAA*
**Problem shape:** Domain object knows how to load/save itself; speeds CRUD-heavy apps.
**Properties:** Tight coupling between domain and persistence; great for simple, hard at scale.
**Sketch:** `class User { id; save(); delete(); static find(id) }`.
**Don't reach for it when:** complex domain logic deserves independence from storage (use Data Mapper).

### Data Mapper
*Data source — PEAA*
**Problem shape:** Keep domain ignorant of persistence; ORM-style mapping between objects and tables.
**Properties:** Domain stays POJO/POCO; mapper owns SQL and identity.
**Sketch:** `UserMapper { find(id); insert(u); update(u); delete(u) }` plus Identity Map and Unit of Work.

### Repository
*Data source — PEAA / DDD*
**Problem shape:** Domain wants a collection-like API for retrieving and storing aggregates; query knowledge centralized; persistence ignored at call site.
**Properties:** Mediates between domain and mapping layer; supports Specification queries.
**Sketch:** `interface UserRepository { findById; findBy(spec); save; remove }`.
**Don't reach for it when:** trivial CRUD where Active Record is fine; queries are read-model heavy (use CQRS read side).

### Unit of Work
*Object-relational behavioral — PEAA*
**Problem shape:** Track which objects loaded/changed/new during a business transaction and flush atomically.
**Properties:** Single commit boundary; identity safety; reduces redundant writes.
**Sketch:** `UoW { registerNew(o); registerDirty(o); registerDeleted(o); commit() }`.

### Identity Map
*Object-relational behavioral — PEAA*
**Problem shape:** Don't load the same row twice in one session; ensure object identity == row identity within scope.
**Sketch:** Map from key → in-memory object; mappers consult before loading.

### Lazy Load
*Object-relational behavioral — PEAA*
**Problem shape:** Avoid loading data until actually needed.
**Variants:** Lazy Initialization (null check), Virtual Proxy, Value Holder, Ghost (partial-loaded entity).
**Don't reach for it when:** the cost of N+1 queries exceeds the cost of eager loading.

### Foreign Key Mapping / Association Table Mapping / Dependent Mapping / Embedded Value / Serialized LOB
*Object-relational structural — PEAA*
**Problem shape:** Map various object relationships to relational schema (1:1, 1:N, M:N, owned, blob).
**Sketch:** Standard mapping idioms; choose based on cardinality, ownership, and queryability.

### Single Table / Class Table / Concrete Table Inheritance
*Object-relational inheritance — PEAA*
**Problem shape:** Map an inheritance hierarchy to relational tables.
**Trade-offs:** Single Table (denormalized, fast, sparse columns); Class Table (normalized, joins); Concrete Table (no joins, no shared key).

### Inheritance Mappers / Metadata Mapping
*Object-relational metadata — PEAA*
**Problem shape:** Centralize mapping rules in metadata rather than hand-coded mappers (basis of every ORM).

### Query Object
*Object-relational metadata — PEAA*
**Problem shape:** Build queries as objects rather than string SQL; combinable, testable.
**Sketch:** `Query { addCriterion; toSql() }`; pairs with Specification.

### Optimistic Offline Lock
*Offline concurrency — PEAA*
**Problem shape:** Long-running transactions span user think time; collisions are rare; want to detect and reject conflicting writes.
**Sketch:** Version column; UPDATE WHERE version = X; throw if rows == 0.

### Pessimistic Offline Lock
*Offline concurrency — PEAA*
**Problem shape:** Conflicts likely; serialize at acquisition time; user holds an explicit lock.

### Coarse-Grained Lock
*Offline concurrency — PEAA*
**Problem shape:** Lock a whole aggregate together (root version) rather than each child.

### Implicit Lock
*Offline concurrency — PEAA*
**Problem shape:** Make locking automatic via framework so developers can't forget.

---

## 7. PEAA — WEB PRESENTATION PATTERNS

### Model-View-Controller (MVC)
*Web presentation — PEAA / Smalltalk-80*
**Problem shape:** Separate UI rendering, user input handling, and domain state; multiple views of one model.
**Sketch:** Model notifies views (Observer); Controller translates input to model commands.

### Model-View-Presenter (MVP)
*Web presentation*
**Problem shape:** Like MVC but the view is passive — Presenter pulls from model and pushes to view; better for unit testing UI logic.
**Variants:** Passive View, Supervising Controller.

### Model-View-ViewModel (MVVM)
*Web presentation*
**Problem shape:** Two-way data binding (WPF/Knockout/Vue/SwiftUI); ViewModel exposes observable state, view binds.

### Front Controller
*Web presentation — PEAA*
**Problem shape:** Single entry handles all web requests; centralizes routing, auth, logging.
**Sketch:** Servlet/handler dispatching by URL → command/handler.

### Page Controller
*Web presentation — PEAA*
**Problem shape:** One controller per logical page; simpler when pages don't share much.

### Application Controller
*Web presentation — PEAA*
**Problem shape:** Centralize screen flow / navigation logic away from individual controllers.

### Template View
*Web presentation — PEAA*
**Problem shape:** Render HTML by embedding directives in markup (JSP, ERB, Razor).

### Transform View
*Web presentation — PEAA*
**Problem shape:** Render by transforming domain data into output (XSLT-style).

### Two-Step View
*Web presentation — PEAA*
**Problem shape:** First render to a logical structure, then to final HTML — enables uniform skinning.

---

## 8. PEAA — DISTRIBUTION, SESSION & BASE PATTERNS

### Remote Facade
*Distribution — PEAA*
**Problem shape:** Coarse-grained remote API over a fine-grained domain to reduce round trips.

### Data Transfer Object (DTO)
*Distribution — PEAA*
**Problem shape:** Pack many fields into one serializable object for cross-process transfer.
**Don't reach for it when:** within a process — domain objects suffice.

### Gateway
*Base — PEAA*
**Problem shape:** Encapsulate access to an external system or resource behind a single object you can mock and swap.
**Sketch:** `class StripeGateway { charge(req): result }`; clients depend on the interface.

### Mapper
*Base — PEAA*
**Problem shape:** A decoupling layer between two independent objects/structures (often used between domain and DTO/persistence).

### Layer Supertype
*Base — PEAA*
**Problem shape:** All classes in a layer share behavior — pull it into a superclass.

### Separated Interface
*Base — PEAA*
**Problem shape:** Define an interface in a different package than the implementer to invert dependencies.

### Registry
*Base — PEAA*
**Problem shape:** "Single source of truth for some collection with populate / lookup / lifetime." Well-known object that other objects use to find common services and information.
**Properties:** Populate (register), Lookup (resolve by key), Lifetime (scope: thread, session, process, request); risk of becoming a hidden global.
**Sketch:** `Registry.register(key, obj); Registry.lookup(key) → obj`.
**Don't reach for it when:** dependency injection covers the need; you don't want global mutable state; lifetime ambiguity isn't worth it.

### Value Object
*Base — PEAA / DDD*
**Problem shape:** Equality by value, not identity; immutable; encapsulates a small concept (Money, Date Range, Coordinates).
**Properties:** Side-effect free; easy to share; a stronger type than primitives.

### Money
*Base — PEAA*
**Problem shape:** Currency arithmetic with rounding and currency type.

### Special Case (Null Object)
*Base — PEAA / Woolf*
**Problem shape:** Avoid null checks by returning a polymorphic object that "does nothing meaningful" (NoCustomer, NullLogger).

### Plugin
*Base — PEAA*
**Problem shape:** Configure class to use at runtime/deploy time without code changes.

### Service Stub
*Base — PEAA*
**Problem shape:** Replace external dependency with a controllable stand-in for testing or local dev.

### Record Set
*Base — PEAA*
**Problem shape:** In-memory representation of tabular data — for table-module-style code.

### Client Session State / Server Session State / Database Session State
*Session state — PEAA*
**Problem shape:** Where to keep per-conversation state in a stateless protocol.

---

## 9. DOMAIN-DRIVEN DESIGN — TACTICAL PATTERNS *(Source: Evans 2003, Vernon 2013)*

### Entity
**Problem shape:** An object with identity that persists across state changes (Customer, Order).
**Properties:** Identity equality; mutable lifecycle; lives inside an Aggregate.

### Value Object
**Problem shape:** A descriptive concept without identity; immutable; equality by attributes (Money, Address).

### Aggregate (Aggregate Root)
**Problem shape:** A consistency boundary — a cluster of entities/values updated atomically with invariants enforced at the root.
**Properties:** Only the root is referenced from outside; transactions span one aggregate; concurrency control at the root version.

### Repository
**Problem shape:** Collection-like access for aggregates; clients don't think in queries, they think "give me the X with Y."

### Factory
**Problem shape:** Aggregate construction is complex enough to merit its own object/method; constructors can't enforce all invariants alone.

### Domain Service
**Problem shape:** An operation doesn't naturally belong to any one entity/value (e.g., transferring funds between two accounts).

### Application Service
**Problem shape:** Use-case orchestrator — opens transactions, loads aggregates, delegates to domain, returns DTOs.

### Domain Event
**Problem shape:** Something happened in the domain that other parts of the system care about; record + publish.
**Properties:** Past tense (`OrderPlaced`); immutable; carries the data interested parties need.

### Specification
**Problem shape:** Compose business predicates as objects (`AvailableForRent.and(NotReservedBy(user))`).
**Properties:** Combinable (and/or/not); usable for selection (queries) and validation.

### Module (Package)
**Problem shape:** Group cohesive concepts; name with ubiquitous language.

---

## 10. DOMAIN-DRIVEN DESIGN — STRATEGIC PATTERNS

### Bounded Context
**Problem shape:** A model is consistent only within a boundary — same word means different things in different contexts (a "Customer" in Sales vs Support).
**Properties:** Explicit linguistic and model boundary; usually maps to a service/team.

### Ubiquitous Language
**Problem shape:** Translation drift between domain experts and code; the same word means different things to different stakeholders.

### Context Map
**Problem shape:** Document how bounded contexts relate to each other organizationally and technically.

### Anti-Corruption Layer (ACL)
**Problem shape:** Integrate with a legacy/foreign model without letting its concepts leak into yours.
**Sketch:** Translation layer that converts to/from your model at the boundary; pairs with Adapter/Gateway.

### Open Host Service
**Problem shape:** Many downstreams need to integrate with you — provide a stable, public protocol.

### Published Language
**Problem shape:** Define a canonical schema/format (JSON Schema, Protobuf, XML Schema) that integrating contexts agree on.

### Shared Kernel
**Problem shape:** Two teams co-own a small shared model; explicit and tightly governed.

### Customer/Supplier
**Problem shape:** Upstream team commits to satisfying downstream's needs in their backlog.

### Conformist
**Problem shape:** Downstream adopts upstream's model wholesale because translation isn't worth it / control isn't possible.

### Partnership
**Problem shape:** Two teams must succeed together; coordinate planning and releases.

### Separate Ways
**Problem shape:** Integration cost > value; let contexts diverge entirely.

### Big Ball of Mud
*Architectural anti-pattern — Foote & Yoder*
**Problem shape:** Recognize when there is no architecture at all; useful diagnostic.

### Core Domain / Subdomain Distillation
**Problem shape:** Identify what's strategically differentiating (core) vs supporting vs generic; invest accordingly.

---

## 11. ENTERPRISE INTEGRATION PATTERNS — CHANNELS & MESSAGE CONSTRUCTION *(Source: Hohpe & Woolf 2003)*

### Message Channel
**Problem shape:** Two apps need to share information without direct coupling.

### Point-to-Point Channel
**Problem shape:** Exactly one consumer should process each message.

### Publish-Subscribe Channel
**Problem shape:** Many consumers should each receive a copy.

### Datatype Channel
**Problem shape:** Different message types should not share a channel — segregate by type.

### Invalid Message Channel
**Problem shape:** Where to dump messages that fail validation.

### Dead Letter Channel
**Problem shape:** Where to dump messages that can't be delivered.

### Guaranteed Delivery
**Problem shape:** Messages must survive broker/consumer crash → persistent storage.

### Channel Adapter
**Problem shape:** Connect a non-messaging app to a messaging system.

### Messaging Bridge
**Problem shape:** Connect two messaging systems (e.g., JMS↔MQ).

### Message Bus
**Problem shape:** Common backbone where many apps publish/subscribe via shared infrastructure and canonical schema.

### Message
**Problem shape:** Atomic unit of communication; metadata + payload.

### Command Message / Document Message / Event Message
**Problem shape:** Three intents: do this; here's data; this happened.

### Request-Reply
**Problem shape:** Synchronous-style RPC over async messaging — sender expects a response.

### Return Address
**Problem shape:** How a replier knows where to send the reply.

### Correlation Identifier
**Problem shape:** Match a reply to its original request when interleaved.

### Message Sequence
**Problem shape:** Send something larger than a message; receiver reassembles ordered chunks.

### Message Expiration
**Problem shape:** Old messages aren't useful; let them die.

### Format Indicator
**Problem shape:** Carry a version/type tag so receivers can evolve schemas.

---

## 12. ENTERPRISE INTEGRATION PATTERNS — ROUTING

### Pipes and Filters
**Problem shape:** Process a stream of data through a series of independent steps; each filter has uniform in/out (a message channel).
**Properties:** Compose stages independently; parallelize; reuse filters.

### Message Router
**Problem shape:** Send a message to one of several channels based on conditions, without senders knowing routing.

### Content-Based Router
**Problem shape:** Route by inspecting message content.

### Message Filter
**Problem shape:** Drop messages that don't match a predicate.

### Dynamic Router
**Problem shape:** Routing rules change at runtime; routes are configured.

### Recipient List
**Problem shape:** Fan out to a *computed* list of recipients based on message content.

### Splitter
**Problem shape:** One inbound message contains many logical items that should be processed individually.

### Aggregator
**Problem shape:** Combine related messages into one logical message; correlation + completion + aggregation function.

### Resequencer
**Problem shape:** Restore order to messages that arrived out of order.

### Composed Message Processor
**Problem shape:** Split → process each part → aggregate.

### Scatter-Gather
**Problem shape:** Send query to multiple recipients; combine their replies (pricing across N vendors).

### Routing Slip
**Problem shape:** Each message carries its own list of stops; each stop forwards to next.

### Process Manager
**Problem shape:** Centrally orchestrate a long-running, multi-step workflow with state.

### Message Broker
**Problem shape:** Centralize routing logic in a broker so endpoints don't know each other.

---

## 13. ENTERPRISE INTEGRATION PATTERNS — TRANSFORMATION

### Envelope Wrapper
**Problem shape:** Wrap a payload with infrastructure metadata; unwrap on receipt.

### Content Enricher
**Problem shape:** The receiver needs more data than the sender provided — augment from another source.

### Content Filter
**Problem shape:** Strip / project a subset of fields (security, size).

### Claim Check
**Problem shape:** Payload is huge; store it externally and pass a reference; receiver retrieves by ticket.

### Normalizer
**Problem shape:** Many input formats, one output; route per-format to format-specific translator, then to canonical.

### Canonical Data Model
**Problem shape:** Avoid `O(n²)` translators between N systems by translating each to/from one canonical schema.

---

## 14. ENTERPRISE INTEGRATION PATTERNS — ENDPOINTS & SYSTEM MANAGEMENT

### Messaging Gateway
**Problem shape:** Wrap messaging API behind a domain-shaped interface so app code doesn't know about queues.

### Messaging Mapper
**Problem shape:** Translate between domain objects and messages without coupling either to the other.

### Transactional Client
**Problem shape:** Sender or receiver needs message ops to be transactional (commit only when business work commits).

### Polling Consumer
**Problem shape:** Consumer pulls when ready (rate control).

### Event-Driven Consumer
**Problem shape:** Broker pushes; consumer reacts.

### Competing Consumers
**Problem shape:** Multiple consumers on one channel — broker delivers each message to exactly one, scaling throughput.

### Message Dispatcher
**Problem shape:** One consumer per channel that fans messages to per-type handlers in-process.

### Selective Consumer
**Problem shape:** Consumer only takes messages matching a filter (subject/JMS selector).

### Durable Subscriber
**Problem shape:** Subscriber may be down — broker holds messages until it returns.

### Idempotent Receiver
**Problem shape:** Messages may be redelivered; receiver must not re-apply effects.
**Sketch:** Track processed message IDs (Inbox table); skip duplicates.

### Service Activator
**Problem shape:** Bridge a message arrival to a service method call.

### Control Bus
**Problem shape:** Out-of-band channel for management commands and metrics.

### Detour
**Problem shape:** Conditionally route through extra steps (validation, auditing) for diagnosis.

### Wire Tap
**Problem shape:** Inspect messages on a channel without altering them.

### Message History
**Problem shape:** Track which components a message visited.

### Message Store
**Problem shape:** Archive messages for replay/audit.

### Smart Proxy
**Problem shape:** Intercept request/reply pair to gather metrics, change return address, etc.

### Test Message
**Problem shape:** Inject synthetic messages to validate the live system.

### Channel Purger
**Problem shape:** Drain a channel during testing or recovery.

---

## 15. POSA — ARCHITECTURAL & CONCURRENCY PATTERNS *(Source: Buschmann/Schmidt/Stal/Henney/Kircher/Jain, POSA Vol 1–5)*

### Layers
**Problem shape:** System decomposes into stacked horizontal concerns where each layer uses only the one below.

### Pipes and Filters
*See EIP — same pattern in different vocabulary.*

### Blackboard
**Problem shape:** Multiple specialist agents collaboratively solve a problem by reading/writing a shared knowledge base; no single deterministic algorithm.

### Broker
**Problem shape:** Distributed components communicate through an intermediary that handles location, marshalling, and dispatch (CORBA, gRPC ecosystem).

### MVC / Presentation-Abstraction-Control
**Problem shape:** Hierarchical UI agents each with their own MVC triad.

### Microkernel (Plugin)
**Problem shape:** Minimal core of mandatory mechanisms; everything else is a plug-in extension.

### Reflection
**Problem shape:** System exposes its own structure so it can adapt at runtime.

### Reactor
*POSA2 — Schmidt*
**Problem shape:** Demultiplex many synchronous I/O events to handlers on a single thread.
**Sketch:** Reactor → select() → dispatch handler.handle_event().

### Proactor
*POSA2*
**Problem shape:** Asynchronous I/O completion handling — OS notifies on completion; handler resumes.

### Acceptor-Connector
*POSA2*
**Problem shape:** Decouple connection establishment from service handling.

### Half-Sync / Half-Async
*POSA2*
**Problem shape:** Async layer for I/O, sync layer for application logic, queued in between.

### Leader / Followers
*POSA2*
**Problem shape:** Pool of threads where one leader waits on events and promotes another before processing.

### Active Object
*POSA2*
**Problem shape:** Decouple method invocation from execution — request goes on a queue, scheduler runs in own thread, returns Future.

### Monitor Object
*POSA2*
**Problem shape:** Synchronize concurrent method calls so only one runs at a time on the object.

### Thread-Specific Storage
*POSA2*
**Problem shape:** Per-thread state without explicit passing (TLS).

### Scoped Locking / Strategized Locking / Thread-Safe Interface / Double-Checked Locking
*POSA2*
**Problem shape:** Acquire/release locks RAII-style; pluggable lock strategy; safe public API; lazy singleton init.
**Caveat:** DCL is a hazard in many memory models — prefer language idioms (Java `volatile`, `Lazy<T>`).

### Component Configurator
*POSA2*
**Problem shape:** Load, configure, suspend, resume, and unload services dynamically without restarting.

### Interceptor
*POSA2*
**Problem shape:** Insert services (security, logging) into a framework's processing chain at well-defined points.

### Extension Interface
*POSA2*
**Problem shape:** Components expose multiple, separately-evolvable interfaces (COM-style QueryInterface).

### Wrapper Facade
*POSA2*
**Problem shape:** OO wrapper around C/system APIs to hide platform differences.

### Resource Lifecycle Management Patterns (POSA3, Kircher & Jain)
- **Lookup**, **Lazy Acquisition**, **Eager Acquisition**, **Partial Acquisition**, **Caching**, **Pooling**, **Coordinator**, **Resource Lifecycle Manager**, **Leasing**, **Evictor** — patterns for acquiring/releasing scarce resources in distributed systems.

---

## 16. CONCURRENCY PRIMITIVES *(Source: Lea, Goetz, JCIP)*

### Future / Promise / CompletableFuture
**Problem shape:** "Async result will be available later." Compose dependencies on not-yet-computed values.
**Properties:** Single assignment; readers block or chain; can carry exception; promise = writable side.

### Producer-Consumer
**Problem shape:** Decouple production rate from consumption rate via a bounded queue.

### Thread Pool / Worker Thread / Executor
**Problem shape:** Cap concurrency, reuse threads, queue tasks.

### Fork-Join
**Problem shape:** Recursively divide a task; join sub-results.

### Map-Reduce
**Problem shape:** Embarrassingly parallel transform + associative reduce.

### Read-Write Lock
**Problem shape:** Many readers, few writers; want concurrent reads.

### Semaphore
**Problem shape:** Cap N concurrent users of a resource (a counted bulkhead).

### Latch (CountDownLatch)
**Problem shape:** Wait for N events to occur once.

### Barrier (CyclicBarrier / Phaser)
**Problem shape:** N threads wait for each other at a rendezvous point repeatedly.

### Immutable Object
**Problem shape:** No synchronization needed; share freely; equality by value.

### Thread Confinement
**Problem shape:** Avoid sharing — each thread owns its data.

### Copy-on-Write
**Problem shape:** Frequent reads, rare writes — copy whole structure on mutation, swap atomically.

### Lock Striping
**Problem shape:** Reduce contention by partitioning data and locking only the relevant stripe.

### Lock-Free / Wait-Free / CAS
**Problem shape:** Avoid blocking entirely via atomic compare-and-swap loops.
**Caveat:** Hard to get right; use battle-tested concurrent collections.

### Balking
**Problem shape:** If object isn't in the right state for an action, return immediately rather than wait.

### Scheduler (Earliest-Deadline / Round-Robin)
**Problem shape:** Decide which queued request to service next.

### Two-Phase Termination
**Problem shape:** Cleanly shut down a long-running thread (request stop, then drain).

### Guarded Suspension
**Problem shape:** Block until precondition holds, then proceed.

### Active Object / Monitor Object — *see POSA*

---

## 17. CLOUD / DISTRIBUTED RESILIENCE PATTERNS *(Source: Microsoft Azure Architecture Center; Nygard "Release It!"; resilience4j; Polly; Hystrix)*

### Retry
**Problem shape:** "They want retry." Transient failures (network blip, throttling) should be retried automatically.
**Properties:** Pair with exponential backoff + jitter; budget total attempts; classify errors as retryable vs not.
**Don't reach for it when:** failure is permanent or the operation isn't idempotent → retries amplify damage.

### Circuit Breaker
*Nygard*
**Problem shape:** A downstream is failing; stop trying for a while so it can recover and you don't waste resources.
**Properties:** States: Closed (normal), Open (fail fast), Half-Open (probe). Pair with Fallback.

### Bulkhead
*Nygard*
**Problem shape:** Isolate failures so one slow dependency can't exhaust threads/connections shared with others.
**Sketch:** Per-dependency thread pools or semaphores; per-tenant quotas.

### Timeout
**Problem shape:** Bound how long any call can take; surface failure quickly.
**Don't reach for it when:** the timeout is shorter than realistic latency under load (causes false failures).

### Fallback
**Problem shape:** Return a sensible default (cached, static, degraded) when primary fails.

### Hedging (Speculative Retry)
**Problem shape:** Tail latency dominated by stragglers; fire a duplicate request after p99 and take the first answer.

### Throttling
**Problem shape:** Cap the rate at which a service accepts requests to protect itself.

### Rate Limiter
**Problem shape:** Per-client cap on requests per window (token bucket, leaky bucket).

### Queue-Based Load Leveling
**Problem shape:** Bursts overload the service; insert a queue so producers don't see backpressure as failure.

### Compensating Transaction
**Problem shape:** Long-running multi-step operation can't truly roll back; provide explicit reverse actions.

### Health Endpoint Monitoring
**Problem shape:** Operators / orchestrators need a dependable readiness/liveness signal.

### Compute Resource Consolidation
**Problem shape:** Many small services waste compute → bin-pack into shared hosts.

### Steady State (Nygard)
**Problem shape:** System should be able to run indefinitely without manual cleanup (logs rotate, caches evict, sessions expire).

### Fail Fast (Nygard)
**Problem shape:** If you can predict failure cheaply, fail before doing expensive work.

### Shed Load
**Problem shape:** Drop low-priority work first when overloaded.

### Test Harness (Nygard)
**Problem shape:** Reproducible way to inject distributed failure modes into tests (chaos eng).

### Decoupling Middleware (Nygard)
**Problem shape:** Insert a queue/bus between services so they fail independently.

---

## 18. CLOUD / DATA MANAGEMENT PATTERNS

### Cache-Aside (Lazy-Loaded Cache)
**Problem shape:** Read-heavy data; on miss, app fetches from store and populates cache.

### Read-Through
**Problem shape:** Cache itself loads from store on miss — single read API for clients.

### Write-Through
**Problem shape:** Every write goes through cache to store synchronously — strong consistency, slower writes.

### Write-Behind (Write-Back)
**Problem shape:** Writes go to cache, asynchronously flushed to store — fast, weaker durability.

### Refresh-Ahead
**Problem shape:** Predictively refresh hot keys before TTL expiry.

### TTL / Eviction (LRU, LFU, ARC, FIFO)
**Problem shape:** Bound cache size and staleness.

### CQRS (Command Query Responsibility Segregation)
**Problem shape:** Reads and writes have different scaling/shape needs; separate models for commands vs queries.

### Event Sourcing
**Problem shape:** Truth is the sequence of events; current state is a projection. Need full audit, time travel, replayability.
**Properties:** Append-only log; projections are derived; snapshotting for performance.

### Saga
**Problem shape:** Transaction spans services that don't share a database.
**Variants:** Orchestration (central coordinator), Choreography (services react to events).

### Transactional Outbox
**Problem shape:** Need to update DB and publish event atomically — solve dual-write by writing event into same transaction (outbox table) and relaying it.

### Inbox Pattern
**Problem shape:** Idempotent consumer — record processed message IDs to drop dupes.

### Idempotency Key
**Problem shape:** Client retries shouldn't double-charge; server keys results by client-supplied key.

### Polling Publisher / Transaction Log Tailing / Change Data Capture
**Problem shape:** Move data from DB to event stream reliably.

### Sharding
**Problem shape:** Horizontal partitioning by key — scale beyond one node's capacity.

### Index Table
**Problem shape:** Secondary lookup table to support queries on non-primary keys.

### Materialized View
**Problem shape:** Precompute expensive read for fast lookup; refresh on event.

### Priority Queue
**Problem shape:** Higher-priority messages should jump ahead.

### Static Content Hosting
**Problem shape:** Serve static assets from CDN/object store, not the app server.

### Leader Election
**Problem shape:** Many replicas, exactly one should perform a periodic action (e.g., scheduler).

### External Configuration Store
**Problem shape:** Centralize and version config across services.

### Federated Identity / Gatekeeper / Valet Key
**Problem shape:** Auth offload, protocol bridging at edge, signed time-limited URLs to backing stores.

---

## 19. MICROSERVICES PATTERNS *(Source: Richardson, microservices.io)*

### Microservice Architecture
**Problem shape:** Monolith blocks independent deploy / scale / team autonomy.

### Decompose by Business Capability / by Subdomain
**Problem shape:** Find service boundaries by looking at the business or DDD subdomains rather than tech layers.

### Self-Contained Service
**Problem shape:** Service handles synchronous requests without blocking on other services (use cached data, replicas).

### Service per Team
**Problem shape:** Conway's law — align ownership with deployment boundaries.

### Database per Service
**Problem shape:** Decouple persistence so services can evolve schemas independently.

### Shared Database (transitional anti-pattern)
**Problem shape:** Multiple services on one DB — sometimes a stepping stone in migration.

### API Gateway
**Problem shape:** Single entry point for external clients; aggregate, transform, authenticate.

### Backends-for-Frontends (BFF)
**Problem shape:** Web/mobile/IoT clients have different API needs — give each a tailored gateway.

### Service Registry
**Problem shape:** Dynamic instances need a discoverable address book.

### Client-Side Discovery / Server-Side Discovery
**Problem shape:** Where lookup logic lives — in the client or behind a load balancer.

### Self-Registration / Third-Party Registration
**Problem shape:** Service registers itself vs an orchestrator registering it.

### Service Mesh
**Problem shape:** Externalize cross-cutting concerns (retries, mTLS, traces, circuit breaks) into a sidecar so all languages get them.

### Sidecar
**Problem shape:** Co-deployed helper that adds capabilities (logging, proxy, config) to a primary container.

### Ambassador
**Problem shape:** Out-of-process client-side proxy for outbound calls (retry, breaker, discovery).

### API Composition
**Problem shape:** Query that needs data from N services — gateway or composer queries each, joins in memory.

### CQRS for queries
**Problem shape:** Avoid distributed joins — maintain a queryable view fed by service events.

### Saga (Orchestration / Choreography)
**Problem shape:** Distributed transaction across services with compensations.

### Externalized Configuration
**Problem shape:** Same artifact runs in many envs; pull config at startup.

### Microservice Chassis / Service Template
**Problem shape:** Avoid every service re-implementing logging, tracing, metrics, health, config; bake into a shared template.

### Distributed Tracing
**Problem shape:** Follow a request across N services (trace id + spans).

### Log Aggregation
**Problem shape:** One place to search logs from many instances/services.

### Application Metrics / Health Check API / Exception Tracking / Audit Logging
**Problem shape:** Operability primitives every service should expose.

### Access Token (JWT / OAuth2)
**Problem shape:** Pass identity/authz across services without re-auth.

### Consumer-Driven Contract Test
**Problem shape:** Verify producer-consumer compatibility without integration env (Pact).

### Service Component Test
**Problem shape:** Test a single service in isolation with stubbed collaborators.

---

## 20. ARCHITECTURAL STYLES

### Monolithic Architecture
**Problem shape:** Simplicity, single deploy, single DB; baseline for most apps.

### Modular Monolith
**Problem shape:** Monolith with strong internal module boundaries — get most of the benefits without distribution costs.

### Layered (N-Tier)
**Problem shape:** Stack of horizontal concerns: presentation → application → domain → infrastructure.

### Hexagonal (Ports and Adapters) — *Cockburn*
**Problem shape:** Domain must not know about UI / DB / framework; testable in isolation.
**Sketch:** Domain defines Ports (interfaces); Adapters implement them for HTTP, DB, MQ, etc. Inversion of control at the edge.

### Onion Architecture — *Palermo*
**Problem shape:** Concentric layers with dependencies pointing inward; domain at the core.

### Clean Architecture — *Martin*
**Problem shape:** Same idea, with explicit Use Cases / Interactors and Boundaries.

### Pipeline / Pipes-and-Filters Architecture
**Problem shape:** Data flows through composable transformation stages.

### Event-Driven Architecture
**Problem shape:** Components react to events; loosely coupled; natural fit for asynchronous workloads.

### Space-Based Architecture (Tuple Space)
**Problem shape:** Avoid DB bottleneck via in-memory data grid; replicate data across processing units.

### Service-Oriented Architecture (SOA)
**Problem shape:** Reusable enterprise services with formal contracts (often around an ESB).

### Microservices Architecture — *see above*

### Serverless / FaaS
**Problem shape:** Event-triggered short-lived functions; pay-per-invocation; no server management.

### Microkernel (Plug-in) Architecture
**Problem shape:** A small core + plug-ins implementing variability (IDEs, browsers).

### Choreography vs Orchestration
**Problem shape:** Decentralized cooperation (each component reacts to events) vs centralized conductor (a process manager directs).

### Strangler Fig — *Fowler*
**Problem shape:** Migrate from legacy by gradually intercepting and reimplementing slices behind a façade until the legacy is gone.

### Branch by Abstraction — *Fowler*
**Problem shape:** Make a large in-place migration safe by introducing an abstraction between callers and old impl, then porting underneath.

### Parallel Run / Dark Launch
**Problem shape:** Run new alongside old; compare outputs without risk to users.

---

## 21. REACTIVE & STREAMING PATTERNS

### Reactive Streams (Backpressure)
**Problem shape:** Asynchronous stream processing where producers must not overwhelm consumers; consumers signal demand.

### Observable / Observer (RxJava-style)
**Problem shape:** Compose async sequences with operators (map, filter, merge, zip).

### Subject
**Problem shape:** Object that's both Observer and Observable — bridge imperative events into reactive streams.

### Hot vs Cold Streams
**Problem shape:** Cold = per-subscriber producer; Hot = shared producer (broadcasts).

### Actor Model — *Hewitt / Erlang / Akka*
**Problem shape:** Concurrent units with private state communicating only by messages; supervision trees for fault tolerance.

### Supervisor / Let-It-Crash
**Problem shape:** Don't try to defend every actor — let it crash and have a supervisor restart it with a clean state.

### CSP (Communicating Sequential Processes)
**Problem shape:** Goroutines/channels — synchronous handoff between processes via channels.

### Reactor / Proactor — *see POSA*

### Single Writer Principle
**Problem shape:** Avoid contention by ensuring only one writer per data; use queues to funnel writes.

### Event Loop
**Problem shape:** Single thread processes a queue of events to completion (Node.js, browsers).

### Disruptor (LMAX)
**Problem shape:** Ultra-low-latency in-process message passing via a ring buffer with mechanical sympathy.

---

## 22. FUNCTIONAL PROGRAMMING PATTERNS

### Pure Function
**Problem shape:** Determinism + no side effects → trivially testable, parallelizable, memoizable.

### Higher-Order Function
**Problem shape:** Pass behavior as a value (map/filter/reduce, callbacks).

### Functor (`map`)
**Problem shape:** Apply a function inside a context (Optional, List, Future) without unwrapping.

### Applicative (`ap`, `pure`)
**Problem shape:** Apply a function-in-context to a value-in-context; combine independent effects.

### Monad (`flatMap` / `bind`)
**Problem shape:** Sequence dependent computations in a context (nullable, async, error, IO, state).

### Specific Monads
- **Option/Maybe** — absence
- **Either/Result** — typed errors
- **List** — nondeterminism
- **Reader** — read-only environment / DI
- **Writer** — accumulating log
- **State** — threaded mutable-feeling state
- **IO / Task** — controlled side effects
- **Future / Promise** — async
- **Continuation** — first-class control flow

### Free Monad
**Problem shape:** Describe a program as data; interpret it many ways (real, mock, optimized).

### Tagless Final
**Problem shape:** Like Free monad but using typeclass constraints — DSLs polymorphic over the effect; multiple interpreters.

### Lens / Prism / Optional / Traversal (Optics)
**Problem shape:** Get/set deeply nested immutable data; compose access paths.

### Pipeline / Function Composition
**Problem shape:** Chain pure transformations; `f . g . h`.

### Transducer
**Problem shape:** Composable, source-agnostic transformations independent of input/output collection.

### Persistent Data Structure
**Problem shape:** Immutable updates with structural sharing — efficient "copy."

### Trampoline
**Problem shape:** Stack-safe recursion in languages without TCO.

### CPS (Continuation-Passing Style)
**Problem shape:** Make control flow first-class for async, generators, reentrancy.

### Parser Combinator
**Problem shape:** Compose parsers from primitive parsers via map/and-then/or-else.

### Algebraic Data Type / Sum Type / Pattern Matching
**Problem shape:** Closed set of cases; exhaustively pattern-match.

### Smart Constructor
**Problem shape:** Hide raw constructor; expose validating factory returning `Result` or `Option`.

### Phantom Type / Branded Type
**Problem shape:** Type-level distinctions without runtime cost (e.g., `UserId` ≠ `OrderId`).

### Railway-Oriented Programming
**Problem shape:** Compose `Result`-returning steps so errors short-circuit cleanly.

### Memoization
**Problem shape:** Cache pure-function results; trade memory for time.

### Lazy Evaluation / Stream
**Problem shape:** Compute only what's demanded; infinite structures.

---

## 23. CACHING PATTERNS

### Read-Through / Write-Through / Write-Behind / Cache-Aside / Refresh-Ahead — *see Cloud Data*

### TTL Eviction
**Problem shape:** Time-bound staleness.

### Size-Bounded Eviction (LRU / LFU / ARC / 2Q / FIFO)
**Problem shape:** Bound memory; choose by access pattern.

### Negative Cache
**Problem shape:** Cache "not found" answers to avoid pounding the origin.

### Stampede Protection (Single-Flight)
**Problem shape:** Many concurrent misses for the same key — only one fetch should happen.

### Stale-While-Revalidate
**Problem shape:** Return stale immediately, refresh asynchronously.

### Stale-If-Error
**Problem shape:** Origin down → keep serving stale rather than failing.

### Cache Hierarchies (L1/L2)
**Problem shape:** In-process cache + distributed cache + origin.

---

## 24. SECURITY PATTERNS

### Authentication Patterns
- **Password + MFA**, **Token-Based (JWT / Opaque)**, **mTLS**, **Certificate Auth**, **WebAuthn / Passkeys**, **API Key**.

### Authorization Patterns
- **RBAC** — roles bundle permissions; assign roles to users.
- **ABAC** — policy evaluates attributes of subject/resource/action/context.
- **Capability-Based** — possessing an unforgeable token grants the right.
- **Policy-Based Access Control / Rego/OPA** — externalized authorization.
- **Claims-Based** — token carries claims; service checks them.

### OAuth 2.0 Flows
- **Authorization Code (+ PKCE)**, **Client Credentials**, **Device Code**, **Refresh Token**. (Implicit and Resource-Owner Password are deprecated.)

### OIDC
**Problem shape:** Authentication on top of OAuth 2.0 — `id_token` carries identity claims.

### Federated Identity / SAML
**Problem shape:** Trust an external IdP; SSO across orgs.

### Zero Trust
**Problem shape:** No implicit trust by network location; verify every request.

### Gatekeeper
**Problem shape:** Dedicated host validates and sanitizes requests before reaching backends.

### Valet Key
**Problem shape:** Hand client a short-lived signed URL/token to access a specific resource directly (e.g., S3 pre-signed URL).

### Secret Management / Vault
**Problem shape:** Don't bake secrets into code/config; fetch from a vault with rotation.

### Encryption-at-Rest / In-Transit
**Problem shape:** Defense in depth.

### Defense in Depth
**Problem shape:** Layered controls; no single point of failure.

### Principle of Least Privilege
**Problem shape:** Each component gets only the rights it strictly needs.

### CSRF Token / SameSite Cookies
**Problem shape:** Prevent forged cross-origin state-changing requests.

### Content Security Policy
**Problem shape:** Constrain what a page can load to mitigate XSS.

### Input Validation / Output Encoding
**Problem shape:** Treat all input as hostile; encode at sink.

### Rate Limit / Account Lockout / Backoff
**Problem shape:** Brute-force defense.

---

## 25. CONFIGURATION / DEPLOYMENT / RELEASE PATTERNS

### Blue/Green Deployment
**Problem shape:** Swap traffic atomically between two identical environments; instant rollback.

### Canary Release
**Problem shape:** Send a small % of traffic to new version; expand if healthy.

### Rolling Deployment
**Problem shape:** Replace instances one by one; tolerate mixed versions.

### Feature Toggle / Feature Flag
**Problem shape:** Decouple deploy from release; turn features on/off without redeploy; experiment, kill-switch.
**Variants:** Release toggles, Experiment toggles, Ops toggles, Permission toggles.

### Dark Launch
**Problem shape:** Run the new code path in production silently to measure impact before exposing to users.

### Shadow Traffic / Mirroring
**Problem shape:** Duplicate live traffic to a candidate system; compare outputs.

### Strangler Fig — *see above*

### Branch by Abstraction — *see above*

### GitOps
**Problem shape:** Declarative infra/app config in Git; reconciler drives cluster to match.

### Immutable Infrastructure
**Problem shape:** Never patch in place; replace.

### Twelve-Factor App
**Problem shape:** Cloud-native baseline (config in env, stateless processes, dev/prod parity, etc.).

### Phased Rollout / Ring Deployment
**Problem shape:** Concentric rings of users get the build progressively.

---

## 26. TESTING PATTERNS *(Source: Meszaros — xUnit Test Patterns)*

### Four-Phase Test
**Problem shape:** Standard test structure: Setup → Exercise → Verify → Teardown (Arrange-Act-Assert variant).

### Test Doubles (Meszaros taxonomy)
- **Dummy** — passed but never used.
- **Stub** — returns canned answers.
- **Fake** — working implementation but not production-suitable (in-memory DB).
- **Spy** — stub that also records calls.
- **Mock** — pre-programmed expectations; verified at the end.

### Test Fixture
**Problem shape:** Common state needed by many tests.
**Variants:** Fresh Fixture (rebuild every test), Shared Fixture (slower DBs), Persistent Fixture, In-Line Fixture, Implicit Setup.

### Object Mother
**Problem shape:** Centralize creation of canonical test objects.

### Test Data Builder
**Problem shape:** Like Builder, for test inputs — readable, default-loaded, easily varied.

### Humble Object
**Problem shape:** Hard-to-test thin layer (UI, DB, async); push logic into a testable companion and keep the layer "humble."

### Self-Validating Value
**Problem shape:** Object knows how to assert itself.

### Custom Assertion / Hamcrest Matcher
**Problem shape:** Express intent and reuse complex assertions.

### Expected Object
**Problem shape:** Build the expected output and compare equality rather than asserting field-by-field.

### Snapshot / Approval Test
**Problem shape:** Compare large output to gold copy; review changes intentionally.

### Property-Based Test (QuickCheck)
**Problem shape:** Specify invariants; generator finds counterexamples.

### Contract Test / Consumer-Driven Contract Test
**Problem shape:** Verify producer-consumer alignment without full integration.

### In-Memory Database / Fake Repository
**Problem shape:** Speed up persistence-heavy tests.

### Test Suite Hierarchies / Test Categorization
**Problem shape:** Separate fast unit tests from slow integration tests.

### Sociable vs Solitary Test
**Problem shape:** Test SUT with real collaborators (sociable) vs everything mocked (solitary).

### Inline Setup / Implicit Setup / Delegated Setup
**Problem shape:** Where setup lives — visible per test, in `@Before`, or in helpers.

### Inline / Implicit / Automated / Transaction Rollback Teardown
**Problem shape:** How to clean up after persistent fixtures.

### Guard Assertion
**Problem shape:** Assert preconditions at the start of a test to fail fast on bad fixture.

### Test Smells (catalog)
**Problem shape:** Recognizable bad-test patterns: Eager Test, Mystery Guest, Fragile Test, Slow Test, Conditional Test Logic, Flaky Test, Test Code Duplication, Obscure Test, Indirect Testing.

---

## 27. REFACTORING PRIMITIVES *(Source: Fowler, Refactoring 2nd ed.)*

These are mechanical transformations — recognizable shapes the agent can use as primitive *moves* during design.

### Composing Methods
- **Extract Function / Extract Method** — name a coherent fragment.
- **Inline Function** — dissolve unnecessary indirection.
- **Extract Variable / Inline Variable** — name expressions / dissolve aliases.
- **Change Function Declaration** — rename, reorder/add/remove parameters.

### Moving Features
- **Move Function / Move Field** — homing things to the right module.
- **Move Statements into Function / out of Function**.
- **Slide Statements** — group related code.
- **Split Loop** — one loop per concern.
- **Replace Loop with Pipeline** — collection-pipeline style.

### Organizing Data
- **Encapsulate Variable / Field**.
- **Replace Primitive with Object** — Tiny Type.
- **Replace Magic Literal**.
- **Replace Data Value with Object**.

### Simplifying Conditionals
- **Decompose Conditional**.
- **Consolidate Conditional**.
- **Replace Nested Conditional with Guard Clauses**.
- **Replace Conditional with Polymorphism** — frequent State/Strategy enabler.
- **Introduce Special Case (Null Object)**.
- **Introduce Assertion**.

### Refactoring APIs
- **Separate Query from Modifier** — CQS at method level.
- **Parameterize Function**.
- **Remove Flag Argument** — split into two methods.
- **Preserve Whole Object** vs **Pass Parameters** vs **Introduce Parameter Object**.
- **Replace Parameter with Query / Replace Query with Parameter**.
- **Replace Constructor with Factory Function**.
- **Replace Function with Command** (when a function gets complex).
- **Return Modified Value** — for FP-leaning interfaces.

### Dealing with Inheritance
- **Pull Up Method / Field / Constructor Body**.
- **Push Down Method / Field**.
- **Replace Subclass with Delegate**.
- **Replace Superclass with Delegate**.
- **Replace Inheritance with Composition**.
- **Extract Superclass / Subclass / Class**.
- **Collapse Hierarchy**.

### Splitting / Merging
- **Extract Class** / **Inline Class**.
- **Hide Delegate** / **Remove Middle Man**.
- **Substitute Algorithm**.

---

## 28. ANTI-PATTERNS & SMELL TRIGGERS

For the oracle: when these contract shapes appear, reach for the **counterpattern** rather than the named one.

### God Object / Blob
**Smell:** One class accumulates many responsibilities → recommend Extract Class, Move Method, Service Layer, or Bounded Context split.

### Anemic Domain Model
**Smell:** Domain objects are all getters/setters; logic in services → push behavior back into entities/aggregates.

### Feature Envy
**Smell:** Method uses another object's data more than its own → Move Method.

### Shotgun Surgery
**Smell:** Single change requires many edits across files → Move Function/Field to consolidate.

### Primitive Obsession
**Smell:** Strings/ints standing in for domain concepts → Value Object / Tiny Type.

### Big Ball of Mud
**Smell:** No discernible structure → Strangler Fig out, Bounded Contexts, Modular Monolith.

### Distributed Monolith
**Smell:** Microservices that must deploy together → re-evaluate boundaries; use async events; database per service.

### Chatty Interface
**Smell:** Many fine-grained remote calls per use case → Remote Facade / API Composition.

### Ambiguous Term
**Smell:** Same word used for different things in different contexts → Bounded Context / Ubiquitous Language.

### Dual Write
**Smell:** Code writes DB and publishes message in two steps → Transactional Outbox.

### Synchronous Chain of Doom
**Smell:** Service A → B → C → D all sync; latency and availability multiply → events / async / API Composition / Self-Contained Service.

### Singleton Abuse
**Smell:** Globals masquerading as Singletons → DI-scoped lifetime, Registry with explicit lifetime.

### Magic Container
**Smell:** Service Locator hides dependencies → prefer Constructor Injection.

### Leaky Abstraction
**Smell:** Abstraction's underlying details bleed through → Anti-Corruption Layer or honest re-design.

### Premature Optimization
**Smell:** Caching/sharding/queuing without measured need → defer; measure first.

---

## QUICK-REFERENCE CHEAT MAP (for the oracle's first pass)

| Contract clause | First-look pattern |
|---|---|
| "retry on failure" | Retry (+ Backoff/Jitter) |
| "stop calling failing X" | Circuit Breaker |
| "isolate failure" | Bulkhead |
| "deadline" / "max wait" | Timeout |
| "graceful degradation" | Fallback |
| "broadcast event" | Observer / Pub-Sub / Domain Event |
| "stack capabilities" | Decorator / Middleware |
| "swap implementation" | Strategy |
| "many optional params" | Builder |
| "lookup by key, lifecycle" | Registry |
| "queue work" | Producer-Consumer / Queue / Competing Consumers |
| "expensive resource reuse" | Object Pool / Connection Pool / Thread Pool |
| "translate interface" | Adapter / ACL / Gateway |
| "control access / lazy / remote" | Proxy |
| "single entry to subsystem" | Facade / API Gateway |
| "tree of leaves and groups" | Composite |
| "first-class request" | Command |
| "pluggable algorithm steps" | Template Method |
| "add op to closed hierarchy" | Visitor |
| "state machine" | State |
| "long-running multi-step txn" | Saga |
| "atomic write + publish" | Transactional Outbox |
| "dedupe redelivery" | Idempotent Receiver / Inbox |
| "shared truth across services" | Event Sourcing + CQRS |
| "split data per node" | Sharding |
| "fast read of derived data" | Materialized View / Read Model |
| "migrate legacy gradually" | Strangler Fig / Branch by Abstraction |
| "deploy without releasing" | Feature Toggle / Dark Launch |
| "test without dependency" | Test Double (Stub/Fake/Mock) |
| "test untestable layer" | Humble Object |
| "verify cross-service contract" | Consumer-Driven Contract |
| "domain ignorant of frameworks" | Hexagonal / Ports & Adapters |
| "boundary between models" | Bounded Context / ACL |
| "one-of-many handlers" | Chain of Responsibility / Selective Consumer |
| "fan out / fan in" | Scatter-Gather / Splitter+Aggregator / Fork-Join |
| "central workflow" | Process Manager / Saga Orchestrator |
| "out-of-process per-instance helper" | Sidecar / Ambassador |
| "service address book" | Service Registry / Discovery |
| "client-tailored gateway" | BFF |
| "dedupe in-flight identical work" | Single-Flight / Stampede Protection |
| "absent value" | Option/Maybe / Null Object |
| "errors as values" | Either/Result / Railway-Oriented |
| "describe program, interpret later" | Free Monad / Tagless Final / Command |
| "deeply nested immutable update" | Lens / Optics |
| "pass environment implicitly" | Reader Monad / Context Object |
