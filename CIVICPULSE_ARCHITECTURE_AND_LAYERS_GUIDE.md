# CivicPulse: Comprehensive System Architecture & 6-Layer Intelligence Guide

> **Official System Documentation**  
> **Platform Version:** 1.0.0 (Full 6-Layer Intelligence Stack)  
> **Target Audience:** Engineering Leads, Municipal Officers, AI Architects, and Developers

---

## 1. Executive Summary & Vision

Traditional municipal grievance portals are **passive, siloed ticketing databases**. A citizen reports a pothole; an asphalt patch crew is sent to fill it; two weeks later, the patch collapses because an underground water pipe joint was leaking, softening the roadbed. The road department blames the water board, the water board never saw the road complaint, and the citizen loses trust in local governance.

**CivicPulse** is built from the ground up to solve this systemic failure. It transforms civic operations from reactive, isolated ticket handling into a **proactive, intelligence-driven, and multi-disciplinary infrastructure platform**.

```
+---------------------------------------------------------------------------------------+
|                                    CIVICPULSE PLATFORM                                |
+---------------------------------------------------------------------------------------+
|  Layer 6: Officer Copilot (Morning Digest, Multi-turn Chat, Human-in-the-Loop Actions)|
+---------------------------------------------------------------------------------------+
|  Layer 5: Multi-Agent AI (7-Agent Orchestrator, Zero-Hallucination Grounding Validator)|
+---------------------------------------------------------------------------------------+
|  Layer 4: Civic Knowledge Graph (Multi-Hop PostgreSQL Graph, Non-Causal Guardrails)   |
+---------------------------------------------------------------------------------------+
|  Layer 3: Infrastructure Health (Deterministic 0-100 Condition Scoring, 5 Penalties)  |
+---------------------------------------------------------------------------------------+
|  Layer 2: Spatial Intelligence (PostGIS / DBSCAN Clustering, Cross-Category Overlaps) |
+---------------------------------------------------------------------------------------+
|  Layer 1: Complaint Understanding (Triage, Hybrid Duplicate Detection, Vector Search) |
+---------------------------------------------------------------------------------------+
|  Data Backbone: PostgreSQL (pgvector + PostGIS), Node.js Express v5, React + Vite     |
+---------------------------------------------------------------------------------------+
```

### Core Non-Negotiable Engineering Principles
1. **Deterministic Ground Truth**: All critical engineering metrics—such as health scores, spatial distances, penalty caps, and recurrence counts—are computed using pure mathematical functions, not unpredictable LLM outputs.
2. **Zero-Hallucination Grounding**: Every claim, asset code, score, or ticket citation output by AI agents is strictly validated against live database facts before being presented to human officers.
3. **Explicit Non-Causal Guardrails**: When physical assets are co-located (e.g., a burst pipe under an asphalt road), the platform flags this as a **"Potential Relationship (Non-Causal)"** requiring engineer verification rather than hallucinating automatic causality.
4. **Human-in-the-Loop Primacy**: AI recommends; human officers decide. No municipal dispatch, work order, or budget allocation occurs without explicit officer confirmation (`ACCEPTED`, `REJECTED`, or `MODIFIED`).

---

## 2. Deep-Dive: The 6-Layer Architecture

---

### Layer 1: Complaint Understanding & Multimodal Triage

Layer 1 acts as the intelligent intake gateway for all incoming civic grievances from web portals, mobile apps, or legacy hotlines.

```
Incoming Complaint (Raw Text + Photos + Coordinates)
                     │
                     ▼
        [Text Normalization Service]
        (Strips noise, maps colloquial local slang, extracts keywords)
                     │
                     ▼
        [Multimodal / Classification Service]
        (Maps raw complaint to canonical categories: ROAD, WATER, DRAINAGE, etc.)
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
 [Semantic Embeddings]     [Hybrid Duplicate Detection]
 - Gemini Text Embedding   - Lexical matching (trigrams/BM25)
 - Fallback Deterministic  - Cosine distance on vector embeddings
   Local Vector Provider   - Spatial catchment radius (e.g. 50-100m)
                           - Temporal decay window
```

#### Key Capabilities & Implementation:
1. **Colloquial & Slang Normalization (`text-normalization.service.js`)**:
   Citizens frequently use regional phrasing, abbreviations, or informal terms (e.g., "gadda" for pothole, "nal" for tap/pipe, "current cut" for power outage). The normalizer standardizes text into clean canonical tokens without losing raw citizen voice.
2. **Classification & Summarization (`classification.service.js`, `summarization.service.js`)**:
   Automatically categorizes issues into verified municipal departments (Roads, Water & Sewerage, Electricity, Solid Waste Management) and generates a one-sentence executive summary for rapid scanning.
3. **Dual-Mode Vector Embeddings (`embedding.provider.js`)**:
   - **Primary**: Google Gemini Embedding API generates dense vector embeddings stored in PostgreSQL via the `pgvector` extension.
   - **Fallback**: A local, deterministic frequency/hashing vector generator operates seamlessly if external AI APIs are unreachable or offline.
4. **Hybrid Duplicate Detection Engine (`duplicate.service.js`)**:
   Rather than simple text comparison, CivicPulse uses a multi-factor score:
   $$\text{DuplicateScore} = w_1 \cdot \text{VectorSimilarity} + w_2 \cdot \text{LexicalOverlap} + w_3 \cdot \text{SpatialProximity} + w_4 \cdot \text{TimeDecay}$$
   When a citizen reports an existing issue, the system alerts them and allows them to **upvote** the existing ticket (`#CP-YYYY-XXXXXX`) rather than clogging municipal queues with duplicate work orders.

---

### Layer 2: Spatial Intelligence & Geo-Clustering

Layer 2 contextualizes individual complaints within the city's physical geography.

```
       Individual Complaints Across City
                     │
                     ▼
      [Spatial Service & Geo-Resolver]
   (PostGIS geometry / ST_DWithin / Haversine)
                     │
                     ▼
         [Density-Based Clustering]
  (DBSCAN / Spatial Grid Clustering per category)
                     │
                     ▼
       ┌─────────────┴─────────────┐
       ▼                           ▼
[Hotspot Identification]   [Cross-Category Overlaps]
Active clusters with       Intersection of multiple
severity and ticket volume problem types in a single
above threshold            spatial catchment area
```

#### Key Capabilities & Implementation:
1. **Multi-City Support**:
   Seamlessly partitions and manages spatial layers across diverse metropolitan centers (Hyderabad, Bengaluru, Mumbai, Delhi) with localized ward geometries and coordinate bounding boxes.
2. **Density-Based Hotspot Detection (`hotspot.service.js`, `clustering.service.js`)**:
   Groups complaints that occur within a defined radius (e.g., 200m) and temporal window (e.g., past 14 days). Calculates:
   - **Cluster Density**: Number of complaints per unit area.
   - **Severity Velocity**: Rate of complaint arrival over 24h, 7d, and 30d.
   - **Bounding Geometries**: Computes convex hulls for map polygon rendering.
3. **Cross-Category Overlap Alerts (`spatial.service.js`)**:
   Identifies spatial co-occurrence between traditionally isolated municipal domains. For example, flagging when a **Drainage Overflow Hotspot** overlaps geographically with an **Asphalt Pavement Failure Hotspot**, signaling systemic sub-surface saturation.
4. **Ward-Level Analytics (`ward.resolver.js`)**:
   Aggregates complaint resolution times, active burdens, and infrastructure density across administrative municipal wards.

---

### Layer 3: Infrastructure Health Scores

Layer 3 shifts municipal operations from reacting to citizen calls to tracking the continuous physical condition of actual civil assets (roads, pipelines, drains, transformers, waste collection hubs).

```
   Physical Asset (e.g., Road Segment "RD-HYD-1024")
                     │
    ┌────────────────┼────────────────┐
    │ Associated Complaints (Volume, Recency, Severity)
    │ Historical Maintenance Records (Last serviced date)
    │ Cross-Infrastructure Co-location
    ▼
[Deterministic 0 - 100 Health Score Calculator]
Base Score: 100.0
Minus Penalties:
  ├── 1. Complaint Impact Penalty   (Cap: 28 pts)
  ├── 2. Recurrence Penalty         (Cap: 22 pts)
  ├── 3. Severity & Priority        (Cap: 20 pts)
  ├── 4. Unresolved Duration        (Cap: 15 pts)
  └── 5. Maintenance Age Penalty    (Cap: 15 pts)
                     │
                     ▼
       Calculated Score (e.g., 42.5 / 100)
       Health Grade: POOR (40-59) | Critical (<40) | Fair (60-79) | Good (80+)
```

#### Mathematical Model (`health-score.calculator.js`):
The condition of every municipal asset is governed by a deterministic scoring model:
$$\text{HealthScore} = \max\left(0, \; 100 - \sum_{i=1}^{5} \text{Penalty}_i\right)$$

The 5 Penalty Dimensions:
1. **Complaint Impact Penalty (Cap: 28 pts)**: Evaluates total complaint volume within the asset's spatial catchment radius, adjusted for closed vs. active tickets.
2. **Recurrence Penalty (Cap: 22 pts)**: Punishes repeat failures occurring within short intervals after a reported fix.
3. **Severity Penalty (Cap: 20 pts)**: Weighted by urgency level:
   - Critical = 7.5 pts
   - High = 4.8 pts
   - Medium = 2.2 pts
   - Low = 0.9 pts
4. **Unresolved Duration Penalty (Cap: 15 pts)**: Scales with the number of days open issues remain unaddressed.
5. **Maintenance Age Penalty (Cap: 15 pts)**: Time-decay penalty based on days elapsed since the last scheduled preventive inspection or overhaul.

#### Condition Grades:
- **GOOD (80 – 100)**: Normal operational condition; routine monitoring.
- **FAIR (60 – 79)**: Minor degradation; schedule non-urgent maintenance.
- **POOR (40 – 59)**: Significant distress; proactive field intervention recommended.
- **CRITICAL (0 – 39)**: Severe failure risk; immediate triage and priority dispatch.

---

### Layer 4: Civic Knowledge Graph

Layer 4 organizes all municipal data into an interconnected, multi-hop relationship graph stored natively in PostgreSQL.

```
(Ward 12) ──LOCATED_IN── (Road RD-HYD-1024) ──MAINTAINED_BY── (Roads Dept)
                                │
                        POTENTIALLY_IMPACTS (Non-Causal)
                                │
                     (Water Pipeline WP-HYD-204)
                                │
                          AFFECTS_ASSET
                                │
                       (Complaint #CP-2026-00042)
                                │
                           IN_HOTSPOT
                                │
                     (Hotspot HS-BANJARA-02)
```

#### Node Types (Entities):
- `COMPLAINT`: Individual grievances filed by citizens.
- `INFRASTRUCTURE_ASSET`: Physical road segments, pipes, culverts, streetlights.
- `HOTSPOT`: Spatially clustered geographic zones of distress.
- `MAINTENANCE_EVENT`: Historical work orders, resurfacing, repairs.
- `WARD`: Administrative civic boundaries.
- `DEPARTMENT`: Municipal departments responsible for execution.

#### Edge Types (Relationships):
- `MAINTAINED_BY`: Connects assets to responsible agencies.
- `LOCATED_IN`: Spatial inclusion of assets and complaints within wards.
- `AFFECTS_ASSET`: Direct link between a citizen complaint and a physical asset.
- `IN_HOTSPOT`: Spatial containment within an active complaint cluster.
- `HAS_MAINTENANCE`: Historical maintenance logged on an asset.
- `POTENTIALLY_IMPACTS`: **Non-Causal** inferred relationship between co-located infrastructure (e.g., water pipe running beneath road segment).
- `SIMILAR_TO`: Semantic or structural similarity between recurring complaints.

#### Engineering Guardrail: Non-Causal Framing
Municipal liability requires strict separation between **correlation** and **causation**. The Knowledge Graph builder (`graph-builder.service.js`) explicitly tags inferred co-location edges with `is_inferred: true` and `relationshipStatus: "POTENTIAL_NON_CAUSAL"`. This prevents automated systems from falsely attributing legal or operational blame without on-site engineer verification.

---

### Layer 5: Multi-Agent AI Orchestration

Layer 5 deploys a coordinated pipeline of 7 specialized AI agents to autonomously investigate municipal issues, trace root causes, and propose grounded interventions.

```
                   User Query or Morning Triage Trigger
                                     │
                                     ▼
                      [Agent Orchestrator Service]
                                     │
 ┌───────────────────────────────────┼───────────────────────────────────┐
 │                                   │                                   │
 ▼                                   ▼                                   ▼
1. PriorityAgent            2. InvestigationAgent       3. InfrastructureAgent
(Ranks urgent assets by     (Synthesizes multi-hop       (Audits asset health,
 risk and complaint spike)   evidence from graph)         penalties & maintenance)
         │                                   │                           │
         └───────────────────────────────────┼───────────────────────────┘
                                             │
 ┌───────────────────────────────────────────┴───────────────────────────┐
 │                                                                       │
 ▼                                                                       ▼
4. SpatialAgent                                                 5. ComplaintAgent
(Analyzes geographic catchment,                                 (Audits citizen ticket
 cluster density & overlap)                                      history & recurrence)
         │                                                               │
         └───────────────────────────────────┬───────────────────────────┘
                                             │
                                             ▼
                                   6. RecommendationAgent
                                   (Formulates concrete, actionable
                                    engineering work orders)
                                             │
                                             ▼
                                      7. ReportAgent
                                   (Compiles comprehensive briefing)
                                             │
                                             ▼
                             [Grounding Validator Service]
                             - Validates all entity codes against facts
                             - Confirms all numeric figures against tools
                             - Rejects unsupported hallucinations
```

#### Deterministic Tool Harness (`agent-tools.js`):
Agents do not guess. They have access to 14 read-only deterministic tools that query the backend directly:
1. `fetch_complaints`: Query filtered complaints by status, category, date.
2. `fetch_complaint_detail`: In-depth inspection of a specific ticket.
3. `understand_complaint_text`: Parse raw text for category and normalized tokens.
4. `semantic_search_complaints`: Vector similarity lookup across past grievances.
5. `find_related_complaints`: Retrieve duplicate candidates or co-located tickets.
6. `list_hotspots`: Retrieve active spatial hotspots in a ward or city.
7. `get_ward_analytics`: Summary metrics for an administrative ward.
8. `analyze_nearby_complaints`: Spatial proximity query around a coordinate.
9. `get_infrastructure_overview`: Retrieve city-wide asset condition distributions.
10. `get_asset_details`: Deep inspection of health scores, penalties, and specs.
11. `get_assets_for_complaint`: Identify physical assets matched to a complaint.
12. `investigate_asset_graph`: 1-to-3 hop Knowledge Graph traversal from an asset.
13. `investigate_complaint_graph`: Knowledge Graph traversal from a complaint.
14. `find_graph_path`: Shortest path discovery between any two entities in the city.

#### Zero-Hallucination Grounding Validator (`grounding.validator.js`):
Every agent output passes through automated validation before storage. The validator extracts every asset code (e.g., `RD-HYD-1024`), ticket reference (e.g., `#CP-2026-000001`), and numeric health score cited in the text and cross-references them against the exact data returned by the tools. Any mismatch increments `unsupportedClaimCount` and triggers grounding penalties.

---

### Layer 6: Officer Copilot

Layer 6 is the operational command center that bridges backend intelligence with human municipal decision-makers.

```
   Officer Copilot Interface (/officer/copilot & Morning Digest)
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
[Morning Digest]    [Conversational Query]  [Action Confirmation]
- Top urgent assets - "Why is RD-HYD-1024   - ACCEPT recommendation
- Active hotspots     failing repeatedly?"  - REJECT with note
- Pending actions   - Full explainability   - MODIFY action parameters
```

#### Key Features:
1. **Officer Morning Digest (`GET /api/v1/copilot/digest`)**:
   Provides an automated daily operational briefing at the start of every shift. Ranks top infrastructure risks requiring immediate attention, summarizes active spatial hotspots, and flags pending recommendations.
2. **Conversational Multi-Turn Investigations (`POST /api/v1/copilot/ask`)**:
   Officers can query the system in natural language (e.g., *"Why does Ward 12 have a spike in road complaints despite recent repaving?"*). The Copilot triggers the Layer 5 Multi-Agent Orchestrator, maintains conversation threads in `copilot_sessions`, and returns rich narrative responses paired with structured data.
3. **Structured Explainability Panels**:
   Every response contains four verifiable pillars:
   - **Score Breakdown**: Exact point deductions across the 5 health penalties.
   - **Knowledge Graph Evidence Chain**: Visualized traversal path between the complaint, asset, and related infrastructure.
   - **Citizen Ticket Citations**: Direct links to underlying complaints with verification timestamps.
   - **Agent Execution Trace**: Transparent log of which agents ran, what tools were called, and the grounding verification score.
4. **Human-in-the-Loop Confirmation Workflow (`PATCH /api/v1/copilot/recommendations/:id/decision`)**:
   AI recommendations are staged as `PENDING`. An officer reviews the recommendation and takes one of three explicit actions:
   - `ACCEPTED`: Confirms the recommendation; dispatches work orders.
   - `REJECTED`: Declines the recommendation with a logged administrative reason.
   - `MODIFIED`: Adjusts crew assignment, timeline, or engineering scope before approval.
   Every decision is permanently recorded in `ai_feedback_events` for model evaluation and municipal auditing.

---

## 3. Frontend Applications

### 1. Officer Dashboard (`http://localhost:5174`)
Designed specifically for departmental engineers, ward commissioners, and field supervisors.

- **Apple iOS Liquid Glass / Frosted Glassmorphism UI**:
  - Multi-layer frosted vibrancy using `backdrop-filter: blur(20px) saturate(190%) contrast(105%)`.
  - Specular bevel edge highlights (`box-shadow: inset 0 1px 1.5px rgba(255,255,255,0.85)`).
  - Ambient aurora background mesh with fluid chromatic orbs.
  - iPhone Control Center-inspired squircle widget cards with micro-trend indicators.
  - Spotlight-style search bar and iOS Segmented Controls.
- **Key Modules**:
  - `/officer/dashboard`: Morning Digest, quick stats, high-priority queue.
  - `/officer/complaints`: Grouped Inset frosted table with real status filtering.
  - `/officer/complaints/:id`: Detailed review with human-readable Reference ID (`#CP-YYYY-XXXXXX`), verified location, and workflow state transitions.
  - `/officer/copilot`: Interactive conversational investigation terminal.
  - `/officer/infrastructure`: Real-time asset health registry and degradation diagnostics.
  - `/officer/graph`: Interactive Knowledge Graph exploration.
  - `/officer/spatial`: Geospatial hotspot map with cross-category layer toggles.
  - `/officer/profile`: Dedicated read-only view of officer credentials and administrative clearance.

### 2. Citizen Portal (`http://localhost:5173`)
Designed for simplicity, accessibility, and transparency.

- **Frictionless Issue Reporting (`/report`)**:
  - Interactive Leaflet/Mapbox `LocationPicker` for pinpoint geographic accuracy.
  - Media upload for photographic evidence.
  - Real-time duplicate suggestion (allows citizens to upvote existing issues instead of creating duplicates).
- **Complaint Tracking (`/my-complaints`)**:
  - Live progress tracker showing official status (`SUBMITTED` → `UNDER_REVIEW` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED`).
  - Transparent resolution notes and officer timestamps.
- **Public Civic Map (`/map`)**:
  - City-wide transparency map displaying resolved and active public works in the citizen's neighborhood.

---

## 4. Database Schema & Migration Roadmap

The platform database is powered by PostgreSQL with 18 sequentially versioned migrations (`backend/db/migrations/`):

| Migration | Name | Core Responsibilities |
|---|---|---|
| `000` | `migration_tracking` | Migration execution registry and schema versioning |
| `001` | `create_core_tables` | Primary `users`, `departments`, `complaints` tables |
| `002` | `harden_users` | RBAC roles (`CITIZEN`, `OFFICER`, `ADMIN`) and hashed credentials |
| `003` | `add_updated_at_trigger` | Automated timestamp triggers for audit tracking |
| `004` | `remove_redundant_email_constraint` | Index optimization for authentication queries |
| `005` | `create_complaint_embeddings` | `pgvector` extension integration; complaint vector storage |
| `006` | `create_complaint_upvotes` | Citizen community upvoting for crowd-ranked severity |
| `007` | `extend_complaints_for_citizen_portal` | Adds human-readable `reference_id` (`#CP-YYYY-XXXXXX`) |
| `008` | `add_complaint_spatial_data` | `postgis` coordinates, spatial indices (`GIST`), geography types |
| `009` | `create_complaint_evidence` | File storage metadata for photo/video uploads |
| `010` | `create_complaint_history_and_assignment` | Audit log for workflow state machine transitions |
| `011` | `create_complaint_intelligence_and_jobs` | Background job queues for async AI classification |
| `012` | `complete_layer1_and_layer2` | Normalized categories, spatial catchment tables |
| `013` | `multi_city_and_phase2_complete` | Multi-city tenancy tables and ward boundary geometries |
| `014` | `create_infrastructure_health` | Physical assets, maintenance logs, health snapshots |
| `015` | `create_civic_knowledge_graph` | Graph nodes (`graph_nodes`) and edges (`graph_edges`) |
| `016` | `create_multi_agent_ai` | Agent execution runs (`agent_runs`) and recommendations |
| `017` | `create_officer_copilot` | Copilot session threads (`copilot_sessions`, `copilot_messages`) |

---

## 5. Quick Start & Execution Guide

### 1. Database Initialization
Ensure PostgreSQL is running locally on port `5432`:
```bash
cd backend
npm install
node setup-db.js
```
*`setup-db.js` creates the database, executes all 18 migrations, seeds demo infrastructure assets, and generates initial Knowledge Graph relationships.*

### 2. Backend Server
```bash
cd backend
npm run dev
# Server starts on http://localhost:5000
```

### 3. Officer Dashboard
```bash
cd frontend/officer-dashboard
npm install
npm run dev
# Dashboard launches on http://localhost:5174
# Default Login: officer@civicpulse.org / Officer@123
```

### 4. Citizen Portal
```bash
cd frontend/citizen-portal
npm install
npm run dev
# Portal launches on http://localhost:5173
# Default Login: citizen@civicpulse.org / Citizen@123
```

---

## 6. Verification & Quality Assurance

- **TypeScript Compilation**: Both frontends compile with `tsc --noEmit` and build via Vite with **0 errors**.
- **Deterministic Accuracy**: Mathematical scoring units and spatial clustering functions pass automated unit tests (`npm test` in backend).
- **Security & Privacy**: Citizen personal contact information is strictly segregated and masked from departmental review views to comply with data privacy regulations.
