# Daily Interview Drill

**User:** Anonymous  
**Created:** 9/7/2026 13:02:39  
**Updated:** 9/28/2026 14:01:34  
**Exported:** 9/28/2026 14:08:00  
**Link:** [https://chatgpt.com/c/6a9e688c-3fb8-83e8-ad91-a4f027628edf?automationId=6a9283d775ac8191a7c2abf8be78b4c8&messageId=finalAgentTurnStart](https://chatgpt.com/c/6a9e688c-3fb8-83e8-ad91-a4f027628edf?automationId=6a9283d775ac8191a7c2abf8be78b4c8&messageId=finalAgentTurnStart)  

## Prompt:
28/09/2026, 13:34:18

What do u think about this topic&#x20;

Design a [**Agentic Document Extraction**](https://ade.landing.ai/) (ADE) is a document intelligence platform that converts documents into reliable, structured data.

| Intelligent Layout          |  ✓  |  ✓  |  ✓  |
| :-------------------------- | :-: | :-: | :-: |
| Structured Field Extraction |  ✓  |  ✓  |  ✓  |
| List Extraction             |  ✓  |  ✓  |  ✓  |
| Table Extraction            |  ✓  |  ✓  |  ✓  |
| Figure Summaries            |  ✓  |  ✓  |  ✓  |
| Visual Grounding            |  ✓  |  ✓  |  ✓  |
| Document Splitting          |  ✓  |  ✓  |  ✓  |
| Multilingual Documents      |  ✓  |  ✓  |  ✓  |
| Custom Processing Pipeline  |     |     |  ✓  |

## Response:
28/09/2026, 13:34:19 · gpt-5-6

Yes - this is a **very strong SDE-2 → Senior system-design topic**, and I’d actually prefer it over another generic “design URL shortener / notification service” question.

A good interview framing would be:

> **Design an Agentic Document Extraction platform that accepts PDFs/images and converts them into reliable structured data while preserving document layout and visual grounding.**

The interesting part is that this isn't merely **“upload PDF → call LLM → return JSON.”** It forces you to reason across several engineering layers:

```text
PDF / Image / Scan
        ↓
Upload + Object Storage
        ↓
Document Validation
        ↓
Document Splitting
        ↓
Page Processing
        ↓
OCR / Visual Understanding
        ↓
Layout Detection
        ↓
┌─────────────────────────────┐
│ Paragraphs                  │
│ Tables                      │
│ Lists                       │
│ Figures                     │
│ Headers / Footers           │
│ Checkboxes                  │
└─────────────────────────────┘
        ↓
Structured Extraction
        ↓
Schema Validation
        ↓
Confidence / Grounding
        ↓
Final Structured JSON
```

And the requirements you pasted make the design substantially richer.

| Capability | What it tests in an interview |
|---|---|
| Intelligent Layout | OCR + vision pipeline, page representation |
| Structured Field Extraction | schema-driven extraction, validation |
| List Extraction | hierarchy and reading order |
| Table Extraction | complex layout reconstruction |
| Figure Summaries | multimodal/vision models |
| Visual Grounding | provenance + bounding boxes |
| Document Splitting | classification + segmentation |
| Multilingual | OCR/model routing/language detection |
| Custom Pipelines | extensible workflow architecture |

### The question I'd use

**Design an Agentic Document Extraction platform similar to ADE.**

Customers upload documents ranging from:

```text
1-page invoices
50-page insurance forms
500-page financial reports
2,000-page document packages

PDF
scanned PDF
PNG/JPEG
mixed-language documents
```

Scale:

```text
5M documents/day
~100M pages/day

Document size:
100 KB → 2 GB

API servers
Object storage
PostgreSQL
Redis
Kafka/SQS-like queue
hundreds/thousands of workers
GPU inference workers
```

The API might look like:

```http
POST /documents

POST /documents/{id}/extract
```

with a requested schema:

```json
{
  "customer_name": "string",
  "invoice_number": "string",
  "invoice_date": "date",
  "line_items": [
    {
      "description": "string",
      "quantity": "number",
      "price": "number"
    }
  ],
  "total": "number"
}
```

The response shouldn't merely contain values. It should support grounding:

```text
invoice_number:
    value: INV-481
    confidence: 0.98
    page: 3
    bounding_box: [...]
```

Then the interviewer starts attacking the design.

**Architecture:** How do you break extraction into stages without creating one enormous worker?

```text
Upload
  ↓
Parse
  ↓
Split
  ↓
OCR/Layout
  ↓
Extract
  ↓
Validate
  ↓
Aggregate
```

Which stages are synchronous versus asynchronous?

**Database design:** Model:

```text
documents
document_pages
processing_jobs
processing_attempts
extraction_schemas
extraction_results
extracted_fields
grounding_regions
```

What belongs in PostgreSQL versus object storage?

Would you really put thousands of bounding boxes and OCR tokens into normal relational rows?

**Parallelism:** A 1,000-page document arrives.

Can you process:

```text
Page 1
Page 2
Page 3
...
Page 1000
```

in parallel?

If yes, how do you reconstruct reading order, tables spanning pages, sections, lists and document-level context?

This becomes a great **fan-out/fan-in** discussion.

**Failure recovery:** Suppose:

```text
1,000 pages

Pages 1-734 complete
Page 735 fails
736-1000 complete
```

Do you rerun 1,000 pages?

Obviously you'd want page/stage-level checkpoints, retries and idempotency-but then you have to design them correctly.

**Duplicate processing:** Queue uses at-least-once delivery:

```text
Worker A → OCR page 481
          ↓
       finishes
          ↓
crashes before ACK

Worker B → receives page 481
```

OCR/VLM calls are expensive.

How do you prevent or minimize duplicate inference while still recovering from dead workers?

That's especially interesting because you've already studied the generic duplicate-job problem; here you'd apply it to an expensive real-world pipeline rather than repeat the same question.

**Model routing:** Not every page needs the expensive model.

You could have:

```text
Digital PDF
   ↓
native text extraction

Scanned PDF
   ↓
OCR

Simple invoice
   ↓
fast model

Complex table
   ↓
stronger vision model

Figure/chart
   ↓
multimodal model
```

Now architecture becomes partially **cost-aware**.

**Reliability:** The extraction says:

```text
Total: $18,421
```

But how does the customer know where that came from?

Your system should retain something like:

```text
value
confidence
page
bounding box
source text
model/version
```

That makes **visual grounding/provenance** an architectural concept rather than just an AI feature.

**Versioning:** This is another excellent Senior-level angle.

Suppose today:

```text
OCR model = v4
Extraction model = v7
Schema = v3
Prompt = v19
```

Tomorrow you upgrade the model.

A customer asks:

> Why did the same document produce a different invoice total today?

Your architecture needs reproducibility:

```text
Document
   +
Pipeline Version
   +
Model Version
   +
Prompt Version
   +
Schema Version
   =
Extraction Run
```

**Cost/scalability:** Now imagine one enterprise customer uploads:

```text
100,000 documents
×
300 pages

= 30M pages
```

You need tenant quotas, queue partitioning, weighted/fair scheduling, backpressure, GPU batching, concurrency limits and cost controls so one tenant doesn't starve everyone else.

---

I think this is **excellent for your Question 1 rotation** because it combines several things that are normally asked separately:

**distributed systems + databases + queues + idempotency + object storage + concurrency + GPU workloads + AI/LLM architecture + reliability + cost optimization + API design.**

And unlike another booking/inventory/rate-limiter problem, it gives you a genuinely modern **AI infrastructure system-design question**.

I'd add it to the **already-done list once we actually use it**, and when it comes up I'd make the interviewer progressively introduce **large documents → parallel processing → failures → duplicate inference → grounding → model versioning → noisy tenant → cost explosion** rather than dumping everything into the initial prompt.

## Prompt:
28/09/2026, 13:36:34

This is Very scalable approach let say we have to create MVP for this on small scale

## Response:
28/09/2026, 13:36:38 · gpt-5-6

Exactly. For an **MVP**, I would deliberately avoid the Kafka/Redis/microservices/GPU-cluster architecture. The key is to preserve the **same logical pipeline**, but implement it with far fewer moving pieces so it can evolve later.

Think:

```text
Production-scale ADE
≠
architecture you need on Day 1
```

For an MVP, I'd target something like **100-1,000 documents/day**, documents up to perhaps **100-200 pages**, and optimize for correctness, debuggability, and shipping speed.

### MVP architecture

```text
                    ┌───────────────┐
                    │   Next.js UI  │
                    └───────┬───────┘
                            │
                     Create Document
                            │
                            ▼
                    ┌───────────────┐
                    │   Next.js API │
                    │   / Backend   │
                    └───────┬───────┘
                            │
                   Presigned Upload URL
                            │
                            ▼
                    ┌───────────────┐
                    │      S3       │
                    │ Original PDF  │
                    └───────┬───────┘
                            │
                      Create Job
                            │
                            ▼
                    ┌───────────────┐
                    │   PostgreSQL  │
                    │ docs / jobs   │
                    │ results       │
                    └───────┬───────┘
                            │
                       Worker polls
                            │
                            ▼
              ┌─────────────────────────┐
              │     Python Worker       │
              │                         │
              │ PDF → pages             │
              │       ↓                 │
              │ Text / OCR / Vision     │
              │       ↓                 │
              │ Layout extraction       │
              │       ↓                 │
              │ Structured extraction   │
              │       ↓                 │
              │ Validation              │
              └───────────┬─────────────┘
                          │
                          ▼
                    PostgreSQL + S3
```

The important architectural decision is that **Next.js doesn't process documents**. It handles users, APIs, upload orchestration and result viewing. A separate Python worker owns the heavy document/AI work.

### Keep the data model small

I wouldn't start with 15 tables. Something around this is enough:

```text
documents
---------
id
user_id
filename
storage_key
mime_type
page_count
status
created_at

extraction_schemas
------------------
id
user_id
name
schema_json
created_at

extraction_jobs
---------------
id
document_id
schema_id
status
progress
pipeline_version
attempt_count
error
created_at
started_at
completed_at

extraction_results
------------------
id
job_id
result_json
model
model_version
created_at
```

And I'd initially put grounding directly inside `result_json`:

```json
{
  "invoice_number": {
    "value": "INV-481",
    "confidence": 0.97,
    "source": {
      "page": 1,
      "text": "Invoice Number: INV-481",
      "boundingBox": [110, 90, 270, 120]
    }
  }
}
```

No need for a `grounding_regions` table until you actually have query requirements that justify one.

---

### The processing pipeline can also stay simple

I'd make the worker execute a state machine:

```text
UPLOADED
   ↓
PARSING
   ↓
EXTRACTING
   ↓
VALIDATING
   ↓
COMPLETED
```

Failure:

```text
EXTRACTING
   ↓
FAILED

error:
"Model timeout"
```

Retry:

```text
FAILED
  ↓
PENDING
  ↓
EXTRACTING
```

For the first version, you don't necessarily need Kafka.

The worker can safely claim work from PostgreSQL:

```sql
SELECT id
FROM extraction_jobs
WHERE status = 'PENDING'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

Then atomically claim it.

That gives you multiple workers later without immediately operating another infrastructure component.

### The AI pipeline is where I'd spend the MVP effort

Instead of trying to build your own OCR/layout/model stack, compose existing capabilities.

```text
PDF
 │
 ├── digital PDF
 │      ↓
 │   extract native text/layout
 │
 └── scanned/image PDF
        ↓
     render page
        ↓
     OCR / Vision model

              ↓

      Normalized Document
              ↓
    ┌──────────────────────┐
    │ page                 │
    │ text                 │
    │ blocks               │
    │ tables               │
    │ bounding boxes       │
    │ images/figures       │
    └──────────────────────┘
              ↓
        LLM Extraction
              ↓
         JSON Schema
              ↓
          Validation
```

The **Normalized Document** representation is important. Don't tightly couple your product to one OCR/model provider.

Your internal format could roughly be:

```json
{
  "pages": [
    {
      "page": 1,
      "width": 1200,
      "height": 1600,
      "blocks": [
        {
          "type": "text",
          "text": "Invoice Number: INV-481",
          "bbox": [110, 90, 270, 120]
        },
        {
          "type": "table",
          "rows": []
        }
      ]
    }
  ]
}
```

Then later you can swap:

```text
Provider A
     ↓
Normalized Document
     ↓
Extraction

Provider B
     ↓
Normalized Document
     ↓
Extraction
```

without rewriting your whole product.

### Don't process 500 pages in one giant LLM call

Even at MVP scale I'd preserve page/chunk boundaries.

For example:

```text
100-page PDF

        ↓

Document Parser

        ↓

Pages 1-10
Pages 11-20
Pages 21-30
...
Pages 91-100

        ↓

Extract relevant information

        ↓

Merge

        ↓

Final validation
```

For a simple 5-page invoice packet, you might process the whole thing together. For larger documents, chunk.

You don't need sophisticated distributed fan-out/fan-in yet.

One worker can orchestrate:

```python
for chunk in document.chunks:
    result = extract(chunk)

final_result = merge(results)
```

Later that loop becomes parallel jobs without changing your conceptual pipeline.

### I'd also simplify visual grounding

You don't initially need pixel-perfect grounding for everything.

For MVP:

```text
Extracted value
     ↓
source text
page number
bounding box
```

Example:

```text
Total
$12,481.00

Page 7

┌────────────────────────────┐
│ Total          $12,481.00  │ ← highlighted
└────────────────────────────┘
```

That already creates a compelling UI because users can click an extracted field and immediately see **where the AI found it**.

### Reliability can stay boring

You still want idempotency, but not distributed-systems gymnastics.

Give each extraction a stable ID:

```text
document_id
+
schema_id
+
pipeline_version
=
extraction identity
```

And enforce an appropriate unique constraint.

Worker crashes?

```text
PROCESSING
started_at = 10:00

worker dies

10:15 cleanup detects:
PROCESSING for > timeout

        ↓

PENDING

        ↓

another worker retries
```

That's enough for an MVP.

---

## What I would explicitly NOT build yet

This is where MVP discipline matters most. I would skip:

```text
❌ Kafka
❌ Redis unless a concrete need appears
❌ Kubernetes
❌ Microservices
❌ Dedicated GPU infrastructure
❌ Multi-region
❌ Complex distributed locks
❌ Per-page distributed jobs
❌ CDC
❌ Event sourcing
❌ Separate vector database
❌ Elaborate workflow engine
❌ Custom OCR model
❌ Custom layout model
❌ Sophisticated model router
❌ 15+ processing services
```

You could realistically start with:

```text
┌──────────────────────────────┐
│ Next.js                      │
│ UI + API                     │
└─────────────┬────────────────┘
              │
      ┌───────┴────────┐
      ▼                ▼
 PostgreSQL            S3
      ▲
      │
┌─────┴────────────────────────┐
│ Python Worker                │
│                              │
│ PDF parsing                  │
│ OCR/Vision API               │
│ LLM extraction              │
│ JSON validation              │
└──────────────────────────────┘
```

That's basically **four major pieces**.

And this architecture isn't disposable. If the product succeeds:

```text
100 docs/day
    ↓
1,000 docs/day
    ↓
10,000 docs/day

Add more Python workers
```

Then:

```text
10k → 100k docs/day

Postgres polling
      ↓
real queue
```

Then:

```text
100k+ docs/day

Document Job
      ↓
Page/Chunk Jobs
      ↓
Worker Pool
      ↓
Aggregation
```

Then eventually:

```text
CPU Workers
OCR Workers
GPU/VLM Workers
Extraction Workers
Validation Workers

        ↓

Kafka/SQS

        ↓

autoscaling + tenant fairness
```

So the **MVP and large-scale architecture don't need to be two completely different systems**. The trick is to preserve clean boundaries-especially `Document → Normalized Representation → Extraction → Validation → Result`-while initially implementing those boundaries inside one worker rather than as separate distributed services.

For an MVP inspired by [LandingAI's Agentic Document Extraction](https://ade.landing.ai/?utm_source=chatgpt.com), that's the architecture I'd be comfortable actually building rather than merely drawing on a system-design whiteboard.

## Prompt:
28/09/2026, 13:40:23

For an MVP inspired by [LandingAI's Agentic Document Extraction](https://ade.landing.ai/?utm_source=chatgpt.com), that's the architecture I'd be comfortable actually building rather than merely drawing on a system-design whiteboard.

lets do this considering 100 docs/day , using powerful LLM vision model we have access to claude sonnet 5 access

## Prompt:
28/09/2026, 13:41:20

For an MVP inspired by [LandingAI's Agentic Document Extraction](https://ade.landing.ai/?utm_source=chatgpt.com), that's the architecture I'd be comfortable actually building rather than merely drawing on a system-design whiteboard.
lets do this considering 100 docs/day , using powerful LLM vision model we have access to claude sonnet 5 access via aws bedrok au region but for now we can test with api key but eventually we need to use via aws bedrok litellm

## Response:
28/09/2026, 13:41:22 · gpt-5-6

> **Searched 1 website**
>
> 
>
> Worked for a couple of seconds

Yes. With only **~100 docs/day**, I’d simplify even further and make **Claude Sonnet 5 vision the intelligence layer**, rather than building separate OCR/layout/table-extraction infrastructure prematurely.

One important deployment detail: AWS currently exposes Claude Sonnet 5 through an Australian geo inference profile, `au.anthropic.claude-sonnet-5`, which keeps processing within Australian regions. AWS recommends `bedrock-runtime` for new applications. ([AWS Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5.html?utm_source=chatgpt.com))

## MVP architecture I'd build

```text
                         ┌─────────────────┐
                         │     Next.js     │
                         │   Web App/API   │
                         └────────┬────────┘
                                  │
                     1. Create document
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   PostgreSQL    │
                         │ metadata/jobs   │
                         └─────────────────┘

                     2. Presigned URL
                                  │
                                  ▼
                         ┌─────────────────┐
                         │       S3        │
                         │ Original PDF    │
                         └────────┬────────┘
                                  │
                         3. Extraction Job
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │     Python Worker       │
                    │                         │
                    │ PDF preprocessing       │
                    │ Page rendering          │
                    │ Chunking                │
                    │ Prompt construction     │
                    │ Schema validation       │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │       LiteLLM           │
                    │    Provider Adapter     │
                    └────────────┬────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
          Development/Test              Production
           API key                       AWS Bedrock
                   │                           │
                   └─────────────┬─────────────┘
                                 ▼
                        Claude Sonnet 5
                         Vision + Text
                                 │
                                 ▼
                       Structured JSON
                                 │
                    ┌────────────┴──────────┐
                    ▼                       ▼
                PostgreSQL                  S3
             extracted data           artifacts/pages
```

The **LiteLLM boundary from day one** is especially important given your eventual deployment requirement.

Your application code shouldn't know whether Claude is coming from an API key or Bedrock.

Conceptually:

```python
result = llm.extract(
    model=settings.EXTRACTION_MODEL,
    document=pages,
    schema=schema,
)
```

Development:

```text
EXTRACTION_PROVIDER=anthropic
EXTRACTION_MODEL=claude-sonnet-5
```

Production:

```text
EXTRACTION_PROVIDER=bedrock
EXTRACTION_MODEL=au.anthropic.claude-sonnet-5
AWS_REGION=ap-southeast-2
```

So migration becomes configuration/provider work rather than rewriting the extraction pipeline.

AWS confirms that the AU geo profile keeps Sonnet 5 requests within Australian regions. One nuance: that's **Australian geographic residency**, not necessarily a guarantee of one particular AWS region. ([AWS Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5.html?utm_source=chatgpt.com))

---

# 1. What our MVP actually does

I'd define V1 around six capabilities:

```text
PDF/Image
   ↓
Understand document
   ↓
────────────────────────────
✓ Text extraction
✓ Structured field extraction
✓ Tables
✓ Lists
✓ Basic visual grounding
✓ Multi-page documents
────────────────────────────
   ↓
JSON
```

I'd **not** initially promise:

```text
complex document splitting
custom pipelines
perfect figure extraction
handwriting perfection
1000-page documents
pixel-perfect grounding
```

Those come later.

---

# 2. The killer feature: user-defined schema

The user shouldn't have to write prompts.

They upload:

```text
invoice.pdf
```

Then define what they want:

```json
{
  "invoice_number": "string",
  "invoice_date": "date",
  "vendor": {
    "name": "string",
    "address": "string"
  },
  "line_items": [
    {
      "description": "string",
      "quantity": "number",
      "unit_price": "number",
      "total": "number"
    }
  ],
  "subtotal": "number",
  "tax": "number",
  "total": "number"
}
```

Claude gets:

```text
DOCUMENT IMAGES/PDF
+
EXTRACTION INSTRUCTIONS
+
OUTPUT SCHEMA
```

and must return structured data.

But I'd make our internal response richer:

```json
{
  "invoice_number": {
    "value": "INV-2026-481",
    "confidence": 0.98,
    "source": {
      "page": 1,
      "text": "Invoice # INV-2026-481",
      "bbox": null
    }
  },

  "total": {
    "value": 18421.50,
    "confidence": 0.99,
    "source": {
      "page": 3,
      "text": "Total $18,421.50",
      "bbox": null
    }
  }
}
```

Notice that I'd initially allow:

```text
bbox = null
```

That matters.

Don't delay the MVP trying to create perfect LandingAI-style pixel grounding.

Start with:

```text
value
page
source text
confidence
```

Then add precise coordinates later.

---

# 3. Document processing strategy

For 100 documents/day, don't immediately invent an elaborate distributed page-processing system.

Suppose someone uploads:

```text
contract.pdf
27 pages
```

Worker:

```text
Download PDF
    ↓
Inspect PDF
    ↓
Render pages if necessary
    ↓
Create page/chunk groups
    ↓
Claude Sonnet 5
    ↓
Validate JSON
    ↓
Store result
```

For small documents:

```text
1-10 pages

PDF
 ↓
Claude
 ↓
JSON
```

Keep it extremely simple.

For larger documents:

```text
80 pages

        PDF
         │
         ▼
   Document analysis
         │
   ┌─────┼─────┐
   ▼     ▼     ▼
 1-10  11-20  21-30 ...
   │     │     │
   ▼     ▼     ▼
Claude Claude Claude
   │     │     │
   └─────┼─────┘
         ▼
       Merge
         ↓
Final Claude validation
         ↓
       Result
```

But even this should only be introduced when the simple approach starts hitting model/request constraints or quality problems.

---

# 4. Don't build OCR yet

This is where I'd take advantage of having a strong vision model.

Traditional architecture:

```text
PDF
 ↓
OCR
 ↓
Layout model
 ↓
Table detector
 ↓
Text extraction
 ↓
LLM
 ↓
JSON
```

Our MVP:

```text
PDF / Page Images
        ↓
 Claude Sonnet 5
        ↓
      JSON
```

Much simpler.

However, keep an interface:

```text
DocumentProcessor
```

rather than writing Claude calls everywhere.

Later:

```text
                    Document
                        │
                        ▼
                 DocumentRouter
                  /           \
                 /             \
        Digital PDF          Scan
             ↓                 ↓
      Native parsing         Vision
             \                 /
              \               /
               Normalized Doc
                    ↓
                Extraction
```

If native PDF text extraction later saves significant money, we add it without redesigning the application.

---

# 5. PostgreSQL schema

For V1 I'd probably stop at five core tables:

```text
users

documents
extraction_schemas
extraction_jobs
extraction_results
```

### `documents`

```text
id
user_id

filename
mime_type
file_size
s3_key

page_count

status

created_at
updated_at
```

Status:

```text
UPLOADING
UPLOADED
PROCESSING
COMPLETED
FAILED
```

### `extraction_schemas`

```text
id
user_id

name
schema_json

created_at
updated_at
```

For example:

```text
Invoice Extraction
```

can be reused against 5,000 invoices.

### `extraction_jobs`

This becomes operationally important.

```text
id
document_id
schema_id

status

attempt_count

model
pipeline_version

started_at
completed_at

error_code
error_message

created_at
```

### `extraction_results`

```text
id
job_id

result_json

input_tokens
output_tokens
model

processing_time_ms

created_at
```

I definitely want token counts and processing time from Day 1.

For an AI document product:

```text
Document
   ↓
pages
   ↓
tokens
   ↓
model calls
   ↓
$$$$
```

Cost observability is part of the product architecture.

---

# 6. PostgreSQL can be our queue

At **100 docs/day**, don't introduce SQS/Kafka because a system-design diagram says queues are good.

Workers can claim:

```sql
BEGIN;

SELECT id
FROM extraction_jobs
WHERE status = 'PENDING'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;

UPDATE extraction_jobs
SET status = 'PROCESSING',
    started_at = NOW()
WHERE id = ?;

COMMIT;
```

Worker processes it.

Then:

```text
PROCESSING
    ↓
COMPLETED
```

or:

```text
PROCESSING
    ↓
FAILED
```

Even with:

```text
3 Python workers
```

`SKIP LOCKED` means they can safely claim separate jobs.

---

# 7. Make extraction reproducible

This is one thing I **would not postpone**, even for an MVP.

Every extraction should record:

```text
document
schema
model
prompt version
pipeline version
```

Example:

```json
{
  "pipeline_version": "1.0",
  "prompt_version": "invoice-v3",
  "model": "claude-sonnet-5",
  "schema_version": "4"
}
```

Because six months later:

```text
Same PDF

January result:
total = $8,481

September result:
total = $8,431
```

You'll immediately want to know:

> What changed?

Without version metadata, debugging AI extraction becomes horrible.

---

# 8. Validation after Claude

Never blindly trust:

```text
Claude → JSON → Database
```

Instead:

```text
Claude
   ↓
JSON
   ↓
Schema Validator
   ↓
Business Validation
   ↓
Result
```

For Python I'd likely use Pydantic.

Imagine invoice extraction:

```text
subtotal = 100
tax      = 18
total    = 918
```

Valid JSON?

Yes.

Logically suspicious?

Absolutely.

So validation has two levels:

```text
Structural validation

"is total a number?"
```

and:

```text
Semantic validation

subtotal + tax ≈ total?
```

That second layer can become one of the differentiators of the product.

---

# 9. Confidence shouldn't blindly mean "Claude said 98%"

I'd be careful here.

Eventually I'd want confidence based on multiple signals:

```text
Extraction confidence
        │
        ├── Model confidence/self-assessment
        ├── Source found?
        ├── Schema validation
        ├── Business validation
        ├── Cross-field consistency
        └── Maybe second-pass verification
```

Then classify:

```text
HIGH
MEDIUM
LOW
```

rather than pretending:

```text
97.2834%
```

is scientifically calibrated.

---

# 10. Second-pass verification is worth testing

For important fields:

```text
bank account
invoice total
policy number
date
tax amount
```

we can potentially do:

```text
PASS 1
──────
Extract

       ↓

{
   total: "$18,481"
}

       ↓

PASS 2
──────
Verify against source

       ↓

SUPPORTED
page 3
"Total: $18,481"
```

The second call doesn't need to redo the entire extraction.

It asks:

> Verify these extracted values against the supplied document. Identify unsupported or contradictory values.

That could significantly improve reliability.

But I'd benchmark it because it doubles some inference cost.

---

# 11. UI should make the intelligence visible

The frontend shouldn't just display:

```text
Extraction Complete

Download JSON
```

That's boring.

I'd build:

```text
┌──────────────────────────────────────────────────────────┐
│ invoice-481.pdf                         Extraction ✓     │
├──────────────────────────┬───────────────────────────────┤
│                          │ Extracted Data                │
│       PDF Viewer         │                               │
│                          │ Invoice #                     │
│                          │ INV-481                       │
│                          │ High confidence               │
│                          │                               │
│                          │ Vendor                        │
│                          │ Apple Inc.                    │
│                          │                               │
│                          │ Total                         │
│                          │ $18,481.00                    │
│                          │                               │
│                          │ Line Items                    │
│                          │ ┌───────────────────────────┐ │
│                          │ │ MacBook  2 × $2000       │ │
│                          │ │ Monitor  4 × $800        │ │
│                          │ └───────────────────────────┘ │
└──────────────────────────┴───────────────────────────────┘
```

Click:

```text
Total
$18,481
```

and jump to:

```text
Page 7
```

with the source area highlighted once grounding coordinates are available.

That immediately makes the system feel trustworthy.

---

# 12. API surface

Keep it boring.

```text
POST   /api/documents
POST   /api/documents/:id/upload-complete

GET    /api/documents/:id

POST   /api/schemas
GET    /api/schemas

POST   /api/documents/:id/extract

GET    /api/jobs/:id

GET    /api/documents/:id/result
```

Flow:

```text
POST /documents
       ↓
presigned S3 URL

       ↓

Browser ──────────────→ S3

       ↓

upload-complete

       ↓

POST /extract

       ↓

job_id

       ↓

Frontend polls

GET /jobs/481

PROCESSING
PROCESSING
COMPLETED

       ↓

GET /documents/123/result
```

At 100 docs/day, polling every 2-3 seconds while the result screen is open is perfectly acceptable.

No WebSockets needed.

---

# 13. Local development → production

This is where your LiteLLM requirement fits beautifully.

### Stage 1 - fastest development

```text
Local
 │
 ▼
LiteLLM
 │
 ▼
Claude API key
```

We develop:

```text
prompting
schema extraction
chunking
validation
grounding
UI
retry behavior
```

without AWS complexity getting in our way.

### Stage 2 - staging

```text
Application
     ↓
LiteLLM
     ↓
AWS Bedrock
     ↓
AU Claude Sonnet 5
```

AWS documents `au.anthropic.claude-sonnet-5` as the Australian geographic inference profile. ([AWS Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5.html?utm_source=chatgpt.com))

### Stage 3 - production

```text
                  Application
                       │
                       ▼
                    LiteLLM
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
 Claude Sonnet 5              Future Model
   Bedrock AU                  / fallback
```

Now provider/model selection is configuration.

---

# 14. Deployment

At this volume I would keep deployment similarly boring:

```text
AWS

┌────────────────────────────────────────┐
│                                        │
│ Next.js App                            │
│                                        │
│ Python Worker                          │
│                                        │
│ PostgreSQL / RDS                       │
│                                        │
│ S3                                     │
│                                        │
│ Bedrock                                │
│                                        │
└────────────────────────────────────────┘
```

Dockerize:

```text
web
worker
```

Initially you could literally run:

```text
1 × web container

1 × worker container
```

Worker concurrency maybe:

```text
2-5 jobs
```

depending on API rate limits and document sizes.

100 documents/day is only:

```text
~4 docs/hour average
```

Even if traffic is bursty, this is tiny infrastructure-wise.

---

# 15. The architecture boundary I'd protect

This is the part I'd consider the **real architecture**:

```text
                 Document
                    │
                    ▼
          ┌──────────────────┐
          │ Document Loader  │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │ Preprocessor     │
          │ PDF/pages/images │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │ Extraction       │
          │ Engine           │
          └────────┬─────────┘
                   │
              LiteLLM
                   │
             Claude Sonnet
                   │
                   ▼
          ┌──────────────────┐
          │ Validator        │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │ Grounding /      │
          │ Verification     │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │ Result           │
          └──────────────────┘
```

Everything else can evolve.

## And I'd keep V1 brutally small

**Stack:**

```text
Frontend/API      Next.js + TypeScript
Worker            Python
DB                PostgreSQL
Files             S3
Validation        Pydantic
AI abstraction    LiteLLM
AI                Claude Sonnet 5 Vision
Production AI     AWS Bedrock AU
Queue             PostgreSQL initially
Deployment        Docker
```

No Kafka. No Redis. No Kubernetes. No vector DB. No separate OCR service. No custom ML. No microservices.

At **100 docs/day**, our engineering effort should go into **extraction accuracy, grounding, schema flexibility, evaluation datasets, retries, cost tracking and an excellent review UI**-not infrastructure.

And one thing I'd add very early that we haven't discussed yet is an **evaluation harness**:

```text
50-100 representative documents
          +
expected ground-truth JSON
          ↓
Run extraction
          ↓
Compare field-by-field
          ↓
Accuracy report

Invoice Number    99%
Date              98%
Vendor            97%
Line Items        91%
Checkboxes        83%
Tables            94%
```

For an AI extraction product, **that evaluation suite is arguably more important than Redis/Kafka at this stage**. It tells us whether changing the prompt, Claude model, chunking strategy, image resolution, or verification pass actually made the product better or quietly broke extraction.

I would make that a **first-class part of the MVP architecture from Day 1**.

---

**Sources:**

- [Claude Sonnet 5 - Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5.html?utm_source=chatgpt.com)

## Prompt:
28/09/2026, 13:54:54

for ur understanding this is PDF we need to parse and extract end to end without missing anything and being accurate specifically for checkboxes

[Attachment: 8d37cb98-e853-42ce-ac47-62cec36fcc5b-source.pdf]

## Response:
28/09/2026, 13:54:56 · gpt-5-6

> **Analyzed document pages and embedded images**
>
> 
>
> Worked for 11s

Yes - **this PDF changes the MVP design materially**. I understand the requirement much better now.

This isn't primarily an OCR problem. It is a **high-fidelity form/document understanding problem**, where a wrong checkbox can change the meaning of an entire section.

Your 48-page sample mixes:

- typed text and structured application forms,
- checkboxes with checked and unchecked states,
- tables,
- handwritten values/signatures/dates,
- scanned identity documents,
- externally generated reports,
- corporate/trust documents,
- repeated/supporting evidence from different sources.

For example, the application includes company/trust/entity details and later supporting records that can be cross-checked against those values. `8d37cb98-e853-42ce-ac47-62cec36fcc5b-source.pdf` The supporting Super Fund Lookup identifies the fund, ABN, regulatory type and status, giving us evidence that can be compared with the application rather than merely extracted independently. `8d37cb98-e853-42ce-ac47-62cec36fcc5b-source.pdf`

And I agree with your priority:

> **Checkbox accuracy is one of the highest-risk parts of this system.**

So I would change our earlier architecture.

## Don't do this

```text
48-page PDF
     ↓
Claude Sonnet 5
     ↓
"Extract everything"
     ↓
one giant JSON
```

It may look impressive in demos, but I wouldn't trust it for this document.

Instead:

```text
                     48-page PDF
                          │
                          ▼
                ┌───────────────────┐
                │ PDF Preprocessor  │
                └─────────┬─────────┘
                          │
                    Render EVERY page
                   high resolution
                          │
                          ▼
                ┌───────────────────┐
                │ Page Understanding│
                │ Claude Vision     │
                └─────────┬─────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
           text        fields       controls
                                   /   |    \
                                  /    |     \
                                 ▼     ▼      ▼
                                ☑      ☐    radio
                          │
                          ▼
                 Page-level JSON
                          │
                          ▼
                Document Aggregator
                          │
                          ▼
                 Cross-page validation
                          │
                          ▼
                   Verification Pass
                          │
                          ▼
                    FINAL JSON
```

### Most importantly: checkbox ≠ boolean

I would **not** represent a checkbox internally as:

```json
{
  "new_investment": true
}
```

We lose too much information.

Instead:

```json
{
  "id": "investment_type.new_investment",
  "label": "New investment",
  "control_type": "checkbox",
  "state": "CHECKED",
  "page": 6,
  "confidence": "HIGH",
  "bbox": [31, 94, 45, 108],
  "evidence": {
    "visual_mark_detected": true,
    "label": "New investment"
  }
}
```

And unchecked:

```json
{
  "id": "investment_type.additional_investment",
  "label": "Additional investment",
  "control_type": "checkbox",
  "state": "UNCHECKED",
  "page": 6,
  "confidence": "HIGH",
  "bbox": [...]
}
```

I'd actually use **four states**:

```text
CHECKED
UNCHECKED
AMBIGUOUS
NOT_VISIBLE
```

not merely:

```text
true / false
```

That distinction is critical.

If Claude cannot confidently distinguish:

```text
☐
☑
☒
✓ drawn beside box
faint handwritten tick
scribble crossing box
```

we should output:

```text
AMBIGUOUS
```

rather than inventing an answer.

---

## Your PDF demonstrates exactly why

Look at the checklist around pages 2-3. The text extraction successfully sees labels such as investment funds selected, signed and dated, minimum investment amounts, payment methods, DOB, holder type, contact details and source of funds. `8d37cb98-e853-42ce-ac47-62cec36fcc5b-source.pdf`

But **plain PDF text extraction cannot reliably tell us which corresponding boxes are visually ticked**.

That's a huge distinction:

```text
OCR/Text extraction:

"Source of Funds"
```

versus:

```text
Document understanding:

Source of Funds
    ☑ Income from employment
    ☐ Business income
    ☑ Investment income
    ☐ Sale of assets
```

The latter is what we need.

So **we cannot use OCR/text extraction as ground truth for controls**.

The rendered page image must be part of the extraction.

---

# I would use Claude twice

This is where having Sonnet 5 vision becomes useful.

### Pass 1 - exhaustive extraction

Claude receives the high-resolution page image and strict instructions:

> Identify every visible form control on this page. Do not infer state from surrounding text. Determine state exclusively from the visual appearance of the control. Return CHECKED, UNCHECKED, AMBIGUOUS or NOT_VISIBLE. Every checkbox must include its associated label and approximate location.

Output:

```text
Page 14

controls: 17

1. Source of Funds
   Employment           CHECKED
   Business             UNCHECKED
   Investment income    CHECKED
   Sale of assets       UNCHECKED
   Other                UNCHECKED

2. Payment
   Direct Debit         CHECKED
   Electronic Transfer  UNCHECKED
...
```

### Pass 2 - checkbox auditor

Then I'd make a **separate vision call whose only job is checking controls**.

It doesn't extract names, ABNs, addresses or tables.

It receives:

```text
PAGE IMAGE

+

Pass-1 detected controls
```

and answers:

```json
{
  "verified": [
    {
      "id": "source_funds.employment",
      "pass_1": "CHECKED",
      "pass_2": "CHECKED",
      "agreement": true
    },
    {
      "id": "source_funds.investment",
      "pass_1": "CHECKED",
      "pass_2": "AMBIGUOUS",
      "agreement": false
    }
  ]
}
```

Now:

```text
Pass 1 = CHECKED
Pass 2 = CHECKED
        ↓
HIGH confidence

Pass 1 = CHECKED
Pass 2 = UNCHECKED
        ↓
REVIEW REQUIRED

Pass 1 = CHECKED
Pass 2 = AMBIGUOUS
        ↓
REVIEW REQUIRED
```

At 100 documents/day, **I happily spend additional model calls for accuracy**.

We're not optimizing for 100M pages/day.

We're optimizing for:

> **Do not incorrectly say an unchecked box was checked.**

---

# I'd add a third mechanism: crop verification

For especially important checkboxes, don't ask Claude to inspect an entire A4 page again.

Crop:

```text
┌─────────────────────────────────────┐
│ Source of funds                     │
│                                     │
│ ☒ Income from employment            │
│ ☐ Business income                   │
│ ☒ Investment income                 │
│ ☐ Sale of assets                    │
└─────────────────────────────────────┘
```

Then send that high-resolution crop to vision.

This gives the model far more pixels around the control.

Architecture becomes:

```text
Full Page
   │
   ├── extraction
   │
   ▼
Detected controls
   │
   ▼
bbox
   │
   ▼
Crop original page
   │
   ▼
        ┌─────────────────┐
        │ ☑ Employment   │
        │ ☐ Business     │
        │ ☑ Investment   │
        └─────────────────┘
                 │
                 ▼
          Vision verification
```

This is something I'd benchmark aggressively.

---

# We also need hierarchy

Another easy mistake would be extracting all checkboxes as unrelated controls.

Your forms contain conditional logic.

Conceptually:

```text
Australian entity type

☐ Company
☐ Custodian
☑ Superannuation fund
☐ Unregulated trust
```

That isn't four unrelated booleans.

It's closer to:

```json
{
  "field": "australian_entity_type",
  "type": "single_choice",
  "options": [
    {"label": "Company", "state": "UNCHECKED"},
    {"label": "Custodian", "state": "UNCHECKED"},
    {"label": "Superannuation Fund", "state": "CHECKED"},
    {"label": "Unregulated Trust", "state": "UNCHECKED"}
  ],
  "selected_value": "Superannuation Fund"
}
```

Then validation can detect impossible situations:

```text
single-choice group

☑ Company
☑ Superannuation Fund

        ↓

Potential extraction/form problem
```

That's much stronger than blindly accepting both.

---

# And this document needs cross-document reasoning

This 48-page PDF isn't really one homogeneous document.

It's a **document package**.

Roughly:

```text
Batch Header
      ↓
Application Checklist
      ↓
Application Form
      ↓
Signing/Audit evidence
      ↓
Jira/supporting material
      ↓
Identity evidence
      ↓
Super Fund Lookup
      ↓
Trustee documents
      ↓
ASIC information
      ↓
Screening/compliance reports
      ↓
other supporting evidence
```

For example, the Jira material explicitly records that the old application was originally rejected and later accepted as a one-off exception. `8d37cb98-e853-42ce-ac47-62cec36fcc5b-source.pdf`

So eventually our system shouldn't just output:

```json
{
  "abn": "33 078 098 634"
}
```

It should know:

```text
ABN

Application:
33 078 098 634

Super Fund Lookup:
33 078 098 634

Result:
MATCH ✓
```

The Super Fund Lookup explicitly reports that ABN and the fund as active/compliant. `8d37cb98-e853-42ce-ac47-62cec36fcc5b-source.pdf`

That's where this becomes **agentic document intelligence**, rather than OCR.

---

# Revised MVP pipeline

For **this actual use case**, I'd now build:

```text
                        PDF
                         │
                         ▼
                ┌─────────────────┐
                │ PDF Inspection  │
                └────────┬────────┘
                         │
                         ▼
               Render pages @ high DPI
                         │
                         ▼
                Page Classification
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
    Form Page        Evidence Page     Text/Report
       │                 │                 │
       ▼                 ▼                 ▼
Claude Vision       Claude Vision      Claude/Text
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
                 Page Extraction JSON
                         │
             ┌───────────┴────────────┐
             ▼                        ▼
       Field Validator          Checkbox Auditor
                                      │
                                      ▼
                                Crop verification
                                      │
             └───────────┬────────────┘
                         ▼
                Document Aggregator
                         │
                         ▼
               Cross-page Validation
                         │
                         ▼
                  Final Extraction
                         │
              ┌──────────┴─────────┐
              ▼                    ▼
        Structured JSON        Review UI
```

## And one requirement becomes non-negotiable

We build a **golden dataset before we build the fancy UI**.

Take maybe:

```text
20-50 PDFs
```

like this one.

Humans annotate:

```text
Every checkbox
Every radio button
Every important field
Every table
Every signature-present field
Every handwritten value
```

For checkboxes specifically:

```text
Total controls:       1,842
Checked:                391
Unchecked:            1,427
Ambiguous:               24
```

Then our benchmark reports separately:

```text
CHECKBOX METRICS

Checked precision       99.8%
Checked recall          99.5%

Unchecked precision     99.9%
Unchecked recall        99.8%

False checked rate      0.1%

Ambiguous detection     96.2%
```

I care especially about:

**false checked rate**.

Because generic:

```text
98% checkbox accuracy
```

can hide the exact failure that matters.

If 95% of boxes are unchecked, a stupid system that says **UNCHECKED for everything** can appear highly accurate.

So we evaluate checked/unchecked separately.

---

For **this PDF and this business requirement**, I'd therefore change one thing from my previous recommendation: **Claude Sonnet 5 should absolutely be the core extraction engine, but I would not trust a single Sonnet call as the source of truth.**

I'd build the MVP around **page-level vision extraction → dedicated checkbox verification → crop-level verification for uncertain/critical controls → schema/business validation → cross-document reconciliation → human review only for unresolved ambiguity**.

At 100 docs/day, that's the right trade-off: spend compute to buy accuracy rather than spend engineering effort building distributed infrastructure.

## Prompt:
28/09/2026, 13:56:19

Can we create One small POC on client side only no backend involved ill add my claude api key , what do u say ?

## Response:
28/09/2026, 13:56:26 · gpt-5-6

Yes. For a **POC whose only goal is to prove “Can Claude Vision accurately understand this 48-page PDF, especially the checkboxes?”**, I’d absolutely build it **client-side only** first.

No database, S3, auth, queue, worker, LiteLLM, or Bedrock yet.

```text
React / Next.js browser app
        │
        │ Select PDF
        ▼
   PDF.js locally
        │
        ├── Render pages → images
        │
        ▼
 Claude API directly
        │
        ├── Pass 1: extraction
        │
        └── Pass 2: checkbox verification
        │
        ▼
 Structured JSON
        │
        ▼
 PDF + extracted results UI
```

Your sample is ideal for this experiment because it contains forms with visually selected/unselected controls alongside normal fields, tables and supporting documents. The text layer alone doesn't capture all of that reliably; e.g. the checklist has many requirements whose actual visual tick state matters. `8d37cb98-e853-42ce-ac47-62cec36fcc5b-source.pdf`

### What I'd build

A single Next.js app with essentially one screen:

```text
┌──────────────────────────────────────────────────────────────┐
│ Agentic Document Extraction POC                             │
│                                                             │
│ Claude API Key: [ sk-ant-************************ ]          │
│                                                             │
│ [ Select PDF ]                                              │
│                                                             │
│ source.pdf                          48 pages                 │
│                                                             │
│ [ Extract Document ]                                        │
├───────────────────────────────┬──────────────────────────────┤
│ PDF / PAGE                    │ EXTRACTION                   │
│                               │                              │
│ ┌───────────────────────────┐ │ Page 6                       │
│ │                           │ │                              │
│ │        PAGE IMAGE         │ │ Investment type             │
│ │                           │ │ ☑ New investment   HIGH     │
│ │    ☑ New investment      │ │ ☐ Additional       HIGH     │
│ │    ☐ Additional          │ │                              │
│ │                           │ │ Australian entity            │
│ └───────────────────────────┘ │ ☐ Company          HIGH     │
│                               │ ☐ Custodian        HIGH     │
│ Page 6 / 48                   │ ☑ Super Fund       HIGH     │
│                               │                              │
│ ◀ Previous       Next ▶       │ Fields                       │
│                               │ Name: Strategic...           │
│                               │ ...                          │
├───────────────────────────────┴──────────────────────────────┤
│ [ Raw JSON ] [ Download JSON ]                              │
└──────────────────────────────────────────────────────────────┘
```

And I'd keep the POC focused on **three questions**:

1. Can Sonnet extract every field without missing important content?
2. Can it correctly distinguish **checked / unchecked / ambiguous** controls?
3. Does a second verification pass materially improve checkbox accuracy?

### Browser pipeline

Use PDF.js entirely locally:

```text
User selects PDF
       ↓
File stays in browser
       ↓
PDF.js
       ↓
page 1 → canvas → JPEG/PNG
page 2 → canvas → JPEG/PNG
...
page 48 → canvas → JPEG/PNG
       ↓
process sequentially / small concurrency
```

I'd initially do perhaps:

```text
2 pages concurrently
```

rather than firing 48 Claude requests simultaneously.

Each page becomes:

```text
Page image
+
strict extraction prompt
+
JSON schema
```

### Pass 1 should be exhaustive

Don't start with a user-defined invoice schema for this POC.

We want to test **general document understanding**.

Something conceptually like:

```json
{
  "page": 6,

  "sections": [],

  "fields": [
    {
      "label": "Existing account name",
      "value": "...",
      "type": "text"
    }
  ],

  "controls": [
    {
      "id": "control_1",
      "type": "checkbox",
      "label": "New investment",
      "state": "CHECKED",
      "confidence": "HIGH"
    },
    {
      "id": "control_2",
      "type": "checkbox",
      "label": "Additional investment",
      "state": "UNCHECKED",
      "confidence": "HIGH"
    }
  ],

  "tables": [],

  "handwriting": [],

  "signatures": [],

  "other_content": []
}
```

And **every visible checkbox must appear**, including unchecked ones.

That's critical.

Otherwise the model may naturally report:

```text
☑ selected things
```

and omit:

```text
☐ unselected things
```

which would make our extraction incomplete.

### Then checkbox-only verification

After Pass 1:

```text
Page image
+
controls detected by Pass 1
        ↓
Claude call #2
```

This prompt has exactly one job:

> Independently inspect every checkbox/radio control visible on this page. Verify the proposed label and state. Do not extract other document content.

Return:

```json
{
  "controls": [
    {
      "id": "control_1",
      "original_state": "CHECKED",
      "verified_state": "CHECKED",
      "confidence": "HIGH"
    },

    {
      "id": "control_7",
      "original_state": "CHECKED",
      "verified_state": "AMBIGUOUS",
      "confidence": "LOW"
    }
  ]
}
```

UI:

```text
☑ New investment
   Pass 1: CHECKED
   Verify: CHECKED
   ✓ HIGH

☑ Something else
   Pass 1: CHECKED
   Verify: AMBIGUOUS
   ⚠ REVIEW
```

That alone will tell us a lot.

### Even better: build a POC accuracy screen

Because we're testing rather than shipping:

```text
Page 6

Model             Human
─────────────────────────────
New Investment
CHECKED            CHECKED     ✓

Additional
UNCHECKED          UNCHECKED   ✓

Super Fund
CHECKED            CHECKED     ✓

Company
UNCHECKED          UNCHECKED   ✓
```

You manually correct mistakes:

```text
Model: CHECKED

Human:
○ CHECKED
● UNCHECKED
○ AMBIGUOUS
```

Then after the whole PDF:

```text
══════════════════════════════
     POC ACCURACY REPORT
══════════════════════════════

Pages                    48

Fields detected          287
Tables                     14
Checkboxes                164

Checkbox accuracy        98.8%

Checked
Precision                99.1%
Recall                   97.8%

Unchecked
Precision                99.5%
Recall                   99.7%

False CHECKED               1

Ambiguous                   3

Pass-1 disagreements         7
Pass-2 corrected             5
Still ambiguous              2
```

**That is the result I'd want from this POC**, not merely a pretty JSON output.

It answers whether the approach is viable.

### One important warning about the API key

For **your local POC**, putting your Claude API key into the browser is acceptable as a temporary experiment **only if you understand it is exposed to the browser environment**.

Don't deploy that architecture publicly.

```text
LOCAL POC

Browser
  ↓
your API key
  ↓
Claude

✓ acceptable for controlled experimentation
```

Production becomes:

```text
Browser
   ↓
Our backend
   ↓
LiteLLM
   ↓
AWS Bedrock AU
   ↓
Claude Sonnet 5
```

The production credential should never be shipped to browser JavaScript.

### And I wouldn't involve Bedrock yet

You already know the eventual target:

```text
Production

App
 ↓
Backend
 ↓
LiteLLM
 ↓
Bedrock AU
 ↓
Claude Sonnet 5
```

But Bedrock isn't the thing we're trying to validate today.

We're trying to answer:

> **Can this model reliably extract this kind of document, with checkbox accuracy high enough for our use case?**

So the POC should eliminate everything unrelated to that question.

```text
Next.js
+
PDF.js
+
Claude API
+
structured output
+
checkbox verification
+
manual accuracy comparison
```

That's it.

If the POC gets **99%+ checkbox performance with an acceptably tiny false-positive rate**, then we have evidence to justify building the proper backend architecture. If it performs poorly, we haven't wasted time building S3, queues, DB schemas and Bedrock integration around an extraction approach that doesn't work.

## Prompt:
28/09/2026, 13:57:24

lets do it and give me final zip donwload ill run and test in my local

## Response:
28/09/2026, 13:57:29 · gpt-5-6

> **Searched 1 website**
>
> 
>
> **Creating ADE client document extraction POC**
>
>
> **Built and packaged the ADE client document extraction POC**
>
> 
>
> Worked for 1m 58s

Done. I built the **client-only Agentic Document Extraction POC** focused specifically on exhaustive extraction + checkbox accuracy.

[Download the POC ZIP](sandbox:/mnt/data/ade-client-poc.zip)

Run it with:

```bash
unzip ade-client-poc.zip
cd ade-client-poc

npm install
npm run dev
```

Then open the localhost URL, paste your Claude API key, upload the 48-page PDF, and click **Extract all pages**.

The POC does two Claude Sonnet 5 vision passes per page: first an exhaustive extraction of fields, checkboxes/radios, tables, handwriting and signatures; then an independent checkbox/radio audit. Any disagreement between the two passes is highlighted. You can inspect every page beside its extracted data and export the complete result as JSON.

I used the current `claude-sonnet-5` model identifier, which Anthropic currently lists as active. ([Claude Platform Docs](https://docs.anthropic.com/en/docs/about-claude/model-deprecations?utm_source=chatgpt.com))

One important point: this build intentionally uses Anthropic's browser-access mechanism because you specifically wanted **zero backend**. Your API key is therefore accessible to browser JavaScript. Use a limited/revocable testing key and **don't deploy this POC publicly**.

Once we see its results on your actual PDF-especially checked vs unchecked detection-we can use the failures to build **POC V2 with crop-level re-verification and an accuracy benchmark**, rather than guessing what improvements are necessary.

---

**Sources:**

- [Model deprecations - Claude Platform Docs](https://docs.anthropic.com/en/docs/about-claude/model-deprecations?utm_source=chatgpt.com)



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)