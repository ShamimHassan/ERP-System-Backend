# ERP Sales & Marketing Management Module

## 📌 Project Overview

A fully functional **Sales & Marketing Management ERP backend** built for a telecom/IT services company. The system manages the complete sales lifecycle — from lead capture through qualification, survey, quotation with price approval, sales order conversion, KPI tracking, and audit logging — all enforced with strict role-based access control at the API level.

**Live API:** `https://erp-system-backend-coral.vercel.app`  
**API Docs (Swagger UI):** `https://erp-system-backend-coral.vercel.app/api-docs`

---

## 👥 Roles & Permissions

| Role | Key Capabilities |
|------|-----------------|
| **ADMIN** | Full access — manage users, services, products, pricing, see all data org-wide, view audit logs |
| **MANAGER** | Team-level access — manage own team's leads/customers/quotations/orders, approve price requests, view team KPIs |
| **MARKETING** | Self-only access — own leads, customers, opportunities, quotations, orders, activities, surveys |

**Key Rule:** Every `/:id` endpoint enforces ownership scoping — out-of-scope records return **404**, not 403, to prevent ID enumeration.

---

## 🛠️ Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js v5
- **ORM:** Prisma
- **Database:** PostgreSQL (Prisma Accelerate pooled)
- **Auth:** JWT (access 15m + refresh 7d) + bcrypt
- **Validation:** Zod on every route (body + query)
- **Security:** Helmet CSP, CORS whitelist, express-rate-limit
- **Docs:** Swagger UI (OpenAPI 3.0)
- **Deployment:** Vercel (serverless)

---

## ✨ Features

### Core Business Modules
- **User Hierarchy** — Admin → Manager → Marketing with team-scoped data isolation
- **Product Catalog** — Services → Categories → Products → Prices with immutable price history
- **Lead Management** — Full lifecycle with lead source tracking, priority, status, and convert-to-customer
- **Customer Management** — Converted from leads or created directly, ownership-enforced
- **Opportunity Pipeline** — 8-stage pipeline (Qualification → WON/LOST)
- **Activity & Survey Tracking** — Follow-ups, calls, meetings, site surveys linked to leads/customers/opportunities
- **Quotation with Price Approval** — Below-minimum prices require Manager/Admin approval before quotation can be approved
- **Sales Order Conversion** — Approved quotations convert to CONFIRMED orders with auto-generated invoice
- **Dashboard** — Role-shaped summaries (Marketing = own, Manager = team, Admin = org-wide)
- **KPI Targets & Actuals** — 12 metrics, on-demand live computation via Prisma aggregations
- **Reports** — Sales (7 groupBy modes) + Marketing (funnel, conversion rates, pipeline)
- **Audit Logs** — Every mutation logged with `{ old: {...}, new: {...} }` structure + IP address

---

## 📡 API Endpoints

**Base URL:** `https://erp-system-backend-coral.vercel.app`  
**API Docs (Swagger UI):** `https://erp-system-backend-coral.vercel.app/api-docs`

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | Public | Login, returns JWT access + refresh tokens |
| POST | `/api/auth/refresh` | Public | Refresh access token |
| POST | `/api/auth/logout` | Any | Logout (revokes refresh token) |
| GET | `/api/auth/me` | Any | Get current user profile |
| POST | `/api/auth/change-password` | Any | Change own password (min 8 chars) |

### Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users` | Any (scoped) | List users — Admin=all, Manager=team, Marketing=self |
| POST | `/api/users` | ADMIN | Create user |
| GET | `/api/users/:id` | Any (scoped) | Get user |
| PATCH | `/api/users/:id` | ADMIN / scoped MANAGER | Update user |
| DELETE | `/api/users/:id` | ADMIN | Soft-delete user |

### Services
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/services` | Any | List services |
| POST | `/api/services` | ADMIN | Create service |
| GET | `/api/services/:id` | Any | Get service |
| PATCH | `/api/services/:id` | ADMIN | Update service |
| DELETE | `/api/services/:id` | ADMIN | Delete service; blocked while categories exist |

### Categories
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/categories` | Any | List categories; supports `serviceId` filter |
| POST | `/api/categories` | ADMIN | Create category |
| GET | `/api/categories/:id` | Any | Get category |
| PATCH | `/api/categories/:id` | ADMIN | Update category |
| DELETE | `/api/categories/:id` | ADMIN | Delete category; blocked while products exist |

### Products
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/products` | Any | List products; supports `categoryId` and `serviceId` filters |
| POST | `/api/products` | ADMIN | Create product |
| GET | `/api/products/:id` | Any | Get product |
| PATCH | `/api/products/:id` | ADMIN | Update product |
| DELETE | `/api/products/:id` | ADMIN | Delete product; blocked while active prices or quote/order items exist |

### Prices
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/products/:productId/prices` | Any | List product price rows |
| POST | `/api/products/:productId/prices` | ADMIN | Add price row; writes price history |
| GET | `/api/products/:productId/prices/current` | Any | Get current active price |
| GET | `/api/products/:productId/prices/history` | Any | Get price change history |
| PATCH | `/api/products/:productId/prices/:priceId` | ADMIN | Change price by creating a new row and history |

In `/api/products/:productId/prices`, `:productId` is the product UUID (the API overview may refer to this as `:id`).

### Leads
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/leads` | Any (scoped) | List leads with filters |
| POST | `/api/leads` | Any | Create lead (ownership auto-assigned by role) |
| GET | `/api/leads/:id` | Any (scoped) | Get lead — 404 if out of scope |
| PATCH | `/api/leads/:id` | Any (scoped) | Update lead |
| DELETE | `/api/leads/:id` | Manager/Admin | Soft-delete |
| POST | `/api/leads/:id/convert` | Any (scoped) | Convert lead → customer |

### Customers
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/customers` | Any (scoped) | List or create customers |
| GET/PATCH | `/api/customers/:id` | Any (scoped) | Get or update |

### Opportunities
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/opportunities` | Any (scoped) | List or create opportunities |
| GET/PATCH | `/api/opportunities/:id` | Any (scoped) | Get or update |

### Activities
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/activities` | Any (scoped) | List or create activities |
| GET | `/api/activities/:id` | Any (scoped) | Get activity |

### Surveys
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/surveys` | Any (scoped) | List or create surveys |
| GET/PATCH | `/api/surveys/:id` | Any (scoped) | Get or update |

### Quotations
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/quotations` | Any (scoped) | List or create (with line items) |
| GET/PATCH | `/api/quotations/:id` | Any (scoped) | Get or update header |
| POST | `/api/quotations/:id/items` | Any (scoped) | Add line item |
| DELETE | `/api/quotations/:id/items/:itemId` | Any (scoped) | Remove line item |
| POST | `/api/quotations/:id/submit-approval` | Any (scoped) | Submit below-minimum prices for approval |
| POST | `/api/quotations/:id/approve` | Manager/Admin | Approve quotation |
| POST | `/api/quotations/:id/reject` | Manager/Admin | Reject with remarks |
| POST | `/api/quotations/:id/convert-to-order` | Any (scoped) | Convert APPROVED → Sales Order |

### Sales Orders
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/sales-orders` | Any (scoped) | List or create orders |
| GET/PATCH | `/api/sales-orders/:id` | Any (scoped) | Get or update |
| POST | `/api/sales-orders/:id/items` | Any (scoped) | Add order line item |
| DELETE | `/api/sales-orders/:id/items/:itemId` | Any (scoped) | Remove order line item |
| POST | `/api/sales-orders/:id/cancel` | Any (scoped) | Cancel order |

### Dashboard
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/summary` | Any | Role-shaped dashboard summary |
| GET | `/api/dashboard/team-performance` | Manager/Admin | Team performance table |

### KPIs
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/kpis` | Any (scoped) | Live KPI computation for all 12 metrics |
| GET/POST | `/api/kpis/targets` | Any / Manager+Admin | List or set KPI targets |

### Reports
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/reports/sales` | Any (scoped) | Sales report (7 groupBy modes) |
| GET | `/api/reports/marketing` | Any (scoped) | Marketing funnel, pipeline, conversion |

### Audit Logs
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/audit-logs` | Admin/Manager | Audit trail with `{ old, new }` diffs |

---

## 🔑 All Test Credentials

| Email | Password | Role |
|---|---|---|
| `admin@erp.com` | `Admin@123` | ADMIN — full access |
| `manager-a@erp.com` | `Manager@123` | MANAGER — Team A |
| `manager-b@erp.com` | `Manager@123` | MANAGER — Team B |
| `mkt-a1@erp.com` | `Mkt@123` | MARKETING — under Manager A |
| `mkt-a2@erp.com` | `Mkt@123` | MARKETING — under Manager A |
| `mkt-b1@erp.com` | `Mkt@123` | MARKETING — under Manager B |
| `mkt-b2@erp.com` | `Mkt@123` | MARKETING — under Manager B |

---

## 🗄️ Database Schema

**19 models, 14 enums, full relational design:**

| Model | Key Fields |
|-------|-----------|
| `User` | id, name, email, passwordHash, role (ADMIN/MANAGER/MARKETING), managerId (self-ref → team hierarchy), status, deletedAt |
| `Service` | id, name (unique), description, status |
| `ProductCategory` | id, serviceId → Service, name, status · unique(serviceId, name) |
| `Product` | id, categoryId → ProductCategory, serviceId → Service, name, unit, description, status |
| `ProductPrice` | id, productId → Product, regularPrice, sellingPrice, minimumPrice, billingType (MONTHLY/QUARTERLY/YEARLY/ONE_TIME), effectiveDate, status, createdById → User |
| `ProductPriceHistory` | id, productPriceId → ProductPrice, oldPrice, newPrice, changedById → User, changedAt |
| `Lead` | id, leadName, companyName, phone, email, leadSource (10 values), priority (LOW/MEDIUM/HIGH), status (7 values), serviceId, categoryId, productId, managerId → User, marketingPersonId → User, estimatedValue, nextFollowUp, notes, deletedAt |
| `Customer` | id, customerType (5 values), companyName, contactPerson, phone, email, address, billingAddress, taxVatNo, managerId → User, marketingPersonId → User, convertedFromLeadId → Lead (unique), status, deletedAt |
| `Opportunity` | id, name, leadId → Lead, customerId → Customer, serviceId, categoryId, productId, stage (8 values), estimatedValue, expectedClosingDate, managerId → User, marketingPersonId → User, notes |
| `Activity` | id, relatedType (LEAD/CUSTOMER/OPPORTUNITY), relatedId, assignedUserId → User, type (8 values), activityDate, activityTime, outcome, nextFollowUp, notes, status |
| `Survey` | id, opportunityId → Opportunity, customerId → Customer, leadId → Lead, serviceId, productId, location, requirement, technicalRequirement, quantity, budget, surveyDate, assignedPersonId → User, result, notes, attachments (JSON), status (4 values) |
| `Quotation` | id, quotationNumber (unique), customerId → Customer, opportunityId → Opportunity, managerId → User, marketingPersonId → User, quotationDate, expiryDate, discountTotal, taxTotal, grandTotal, paymentTerms, notes, status (8 values) |
| `QuotationItem` | id, quotationId → Quotation, productId → Product, quantity, unitPrice (snapshot), discount, tax, lineTotal |
| `PriceApproval` | id, quotationItemId → QuotationItem, productPriceId → ProductPrice, requestedPrice, minimumPrice, requestedById → User, approverId → User, status (PENDING/APPROVED/REJECTED), requestedAt, decidedAt, remarks |
| `SalesOrder` | id, orderNumber (unique), customerId → Customer, quotationId → Quotation (unique), managerId → User, marketingPersonId → User, orderDate, expectedActivationDate, discountTotal, taxTotal, grandTotal, paymentTerms, status (5 values) |
| `SalesOrderItem` | id, salesOrderId → SalesOrder, productId → Product, quantity, unitPrice (snapshot), discount, tax, lineTotal |
| `Invoice` | id, salesOrderId → SalesOrder (unique), invoiceNumber (unique), amount, status (ISSUED/PAID/OVERDUE/CANCELLED), issuedAt, paidAt |
| `Target` | id, userId → User, periodType (MONTHLY/QUARTERLY/YEARLY), periodStart, periodEnd, metric (12 values), targetValue · unique(userId, periodType, periodStart, metric) |
| `Kpi` | id, userId → User, periodStart, periodEnd, metric (12 values), actualValue, computedAt |
| `AuditLog` | id, actorId → User, actorRole, module (12 values), action (18 values), entityId, entityLabel, summary, details (JSON: {old, new}), relatedUserId → User, ipAddress, createdAt |

---

## 🔗 Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ User : "manages (team)"
    User ||--o{ Lead : "manages"
    User ||--o{ Lead : "owns (marketing)"
    User ||--o{ Customer : "manages"
    User ||--o{ Customer : "owns (marketing)"
    User ||--o{ Opportunity : "manages"
    User ||--o{ Opportunity : "owns (marketing)"
    User ||--o{ Quotation : "manages"
    User ||--o{ Quotation : "owns (marketing)"
    User ||--o{ SalesOrder : "manages"
    User ||--o{ SalesOrder : "owns (marketing)"
    User ||--o{ Activity : "assigned"
    User ||--o{ Survey : "assigned"
    User ||--o{ ProductPrice : "created by"
    User ||--o{ ProductPriceHistory : "changed by"
    User ||--o{ PriceApproval : "requested by"
    User ||--o{ PriceApproval : "approved by"
    User ||--o{ Target : "has"
    User ||--o{ Kpi : "has"
    User ||--o{ AuditLog : "actor"
    User ||--o{ AuditLog : "related user"

    Service ||--o{ ProductCategory : "has"
    Service ||--o{ Product : "linked"
    Service ||--o{ Lead : "linked"
    Service ||--o{ Opportunity : "linked"
    Service ||--o{ Survey : "linked"

    ProductCategory ||--o{ Product : "contains"
    ProductCategory ||--o{ Lead : "linked"
    ProductCategory ||--o{ Opportunity : "linked"

    Product ||--o{ ProductPrice : "has prices"
    Product ||--o{ QuotationItem : "in quotations"
    Product ||--o{ SalesOrderItem : "in orders"
    Product ||--o{ Lead : "linked"
    Product ||--o{ Opportunity : "linked"
    Product ||--o{ Survey : "linked"

    ProductPrice ||--o{ ProductPriceHistory : "history"
    ProductPrice ||--o{ PriceApproval : "approval ref"

    Lead ||--o| Customer : "converts to"
    Lead ||--o{ Opportunity : "linked"
    Lead ||--o{ Survey : "linked"

    Customer ||--o{ Opportunity : "linked"
    Customer ||--o{ Quotation : "has"
    Customer ||--o{ SalesOrder : "has"
    Customer ||--o{ Survey : "linked"

    Opportunity ||--o{ Quotation : "linked"
    Opportunity ||--o{ Survey : "linked"

    Quotation ||--o{ QuotationItem : "contains"
    Quotation ||--o| SalesOrder : "converts to (1:1)"

    QuotationItem ||--o{ PriceApproval : "may require"

    SalesOrder ||--o{ SalesOrderItem : "contains"
    SalesOrder ||--o| Invoice : "has (1:1)"

    User {
        uuid   id           PK
        string name
        string email        UK
        string passwordHash
        enum   role         "ADMIN|MANAGER|MARKETING"
        uuid   managerId    FK
        enum   status       "ACTIVE|INACTIVE"
        date   deletedAt
    }

    Service {
        uuid   id          PK
        string name        UK
        string description
        enum   status
    }

    ProductCategory {
        uuid   id        PK
        uuid   serviceId FK
        string name
        enum   status
    }

    Product {
        uuid   id         PK
        uuid   categoryId FK
        uuid   serviceId  FK
        string name
        string unit
        enum   status
    }

    ProductPrice {
        uuid    id            PK
        uuid    productId     FK
        decimal regularPrice
        decimal sellingPrice
        decimal minimumPrice
        enum    billingType   "MONTHLY|QUARTERLY|YEARLY|ONE_TIME"
        date    effectiveDate
        enum    status
        uuid    createdById   FK
    }

    ProductPriceHistory {
        uuid    id             PK
        uuid    productPriceId FK
        decimal oldPrice
        decimal newPrice
        uuid    changedById    FK
        date    changedAt
    }

    Lead {
        uuid    id                PK
        string  leadName
        string  companyName
        string  phone
        enum    leadSource        "10 values"
        enum    priority          "LOW|MEDIUM|HIGH"
        enum    status            "7 values"
        uuid    serviceId         FK
        uuid    categoryId        FK
        uuid    productId         FK
        decimal estimatedValue
        uuid    managerId         FK
        uuid    marketingPersonId FK
        date    nextFollowUp
        date    deletedAt
    }

    Customer {
        uuid   id                  PK
        enum   customerType        "5 values"
        string contactPerson
        string companyName
        uuid   managerId           FK
        uuid   marketingPersonId   FK
        uuid   convertedFromLeadId UK
        enum   status
        date   deletedAt
    }

    Opportunity {
        uuid    id                  PK
        string  name
        uuid    leadId              FK
        uuid    customerId          FK
        uuid    serviceId           FK
        uuid    categoryId          FK
        uuid    productId           FK
        enum    stage               "8 values"
        decimal estimatedValue
        date    expectedClosingDate
        uuid    managerId           FK
        uuid    marketingPersonId   FK
    }

    Activity {
        uuid   id             PK
        enum   relatedType    "LEAD|CUSTOMER|OPPORTUNITY"
        uuid   relatedId
        uuid   assignedUserId FK
        enum   type           "8 values"
        date   activityDate
        string activityTime
        string outcome
        date   nextFollowUp
        enum   status
    }

    Survey {
        uuid    id               PK
        uuid    opportunityId    FK
        uuid    customerId       FK
        uuid    leadId           FK
        uuid    serviceId        FK
        uuid    productId        FK
        string  location
        string  requirement
        date    surveyDate
        uuid    assignedPersonId FK
        json    attachments
        enum    status           "PENDING|SCHEDULED|COMPLETED|CANCELLED"
    }

    Quotation {
        uuid    id                PK
        string  quotationNumber   UK
        uuid    customerId        FK
        uuid    opportunityId     FK
        uuid    managerId         FK
        uuid    marketingPersonId FK
        date    quotationDate
        date    expiryDate
        decimal discountTotal
        decimal taxTotal
        decimal grandTotal
        enum    status            "8 values"
    }

    QuotationItem {
        uuid    id          PK
        uuid    quotationId FK
        uuid    productId   FK
        int     quantity
        decimal unitPrice   "price snapshot"
        decimal discount
        decimal tax
        decimal lineTotal
    }

    PriceApproval {
        uuid    id              PK
        uuid    quotationItemId FK
        uuid    productPriceId  FK
        decimal requestedPrice
        decimal minimumPrice
        uuid    requestedById   FK
        uuid    approverId      FK
        enum    status          "PENDING|APPROVED|REJECTED"
        date    requestedAt
        date    decidedAt
        string  remarks
    }

    SalesOrder {
        uuid    id                     PK
        string  orderNumber            UK
        uuid    customerId             FK
        uuid    quotationId            UK
        uuid    managerId              FK
        uuid    marketingPersonId      FK
        date    orderDate
        date    expectedActivationDate
        decimal grandTotal
        enum    status                 "5 values"
    }

    SalesOrderItem {
        uuid    id           PK
        uuid    salesOrderId FK
        uuid    productId    FK
        int     quantity
        decimal unitPrice    "price snapshot"
        decimal lineTotal
    }

    Invoice {
        uuid    id            PK
        uuid    salesOrderId  UK
        string  invoiceNumber UK
        decimal amount
        enum    status        "ISSUED|PAID|OVERDUE|CANCELLED"
        date    issuedAt
        date    paidAt
    }

    Target {
        uuid    id          PK
        uuid    userId      FK
        enum    periodType  "MONTHLY|QUARTERLY|YEARLY"
        date    periodStart
        date    periodEnd
        enum    metric      "12 values"
        decimal targetValue
    }

    Kpi {
        uuid    id          PK
        uuid    userId      FK
        date    periodStart
        date    periodEnd
        enum    metric      "12 values"
        decimal actualValue
        date    computedAt
    }

    AuditLog {
        uuid   id            PK
        uuid   actorId       FK
        enum   actorRole
        enum   module        "12 values"
        enum   action        "18 values"
        uuid   entityId
        string entityLabel
        string summary
        json   details       "old+new diff"
        uuid   relatedUserId FK
        string ipAddress
        date   createdAt
    }
```

---

## 🏗️ Project Structure

```
ERP-System-Backend/
├── api/
│   └── index.ts                    # Vercel serverless entry point (wraps Express app)
├── prisma/
│   ├── schema.prisma               # 19 models, 14 enums, indexes
│   ├── seed.ts                     # 7 users, 4 services, 20 products, leads, orders, KPI targets
│   └── migrations/                 # Prisma migration history
├── scripts/
│   ├── happy-path.test.ts          # 46-assertion E2E sales lifecycle test
│   ├── rbac.test.ts                # 61-assertion RBAC + business logic test
│   └── check-seed.ts               # Verifies seed data integrity
├── src/
│   ├── app.ts                      # Express setup, rate limiting, Helmet, CORS, Swagger, routes
│   ├── server.ts                   # Local dev entry point (listens on PORT)
│   ├── config/
│   │   ├── env.ts                  # Zod-validated env config (DATABASE_URL, JWT secrets, etc.)
│   │   └── jwt.ts                  # JWT sign/verify helpers (access + refresh)
│   ├── docs/
│   │   └── swagger.ts              # Full OpenAPI 3.0 spec (inline, CDN-served on Vercel)
│   ├── lib/
│   │   ├── audit.ts                # audit() helper — writes AuditLog with { old, new } diff
│   │   ├── handle-error.ts         # Shared route error handler (maps codes → HTTP status)
│   │   ├── list-query.ts           # applyListQuery() — pagination, sort, search, date range
│   │   ├── prisma.ts               # Singleton PrismaClient (serverless-safe global guard)
│   │   ├── rbac.ts                 # getVisibleUserIds(), ownerFilter() — data scoping
│   │   └── response.ts             # ok() / fail() envelope helpers
│   ├── middleware/
│   │   ├── auth.ts                 # authenticate, authorize, scopeData middlewares
│   │   └── validate.ts             # validate(schema, target) — Zod body/query middleware
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts      # login, refresh, logout, me, change-password
│   │   │   └── auth.service.ts
│   │   ├── users/
│   │   │   ├── users.routes.ts     # CRUD + soft-delete
│   │   │   └── users.service.ts
│   │   ├── catalog/
│   │   │   ├── catalog.helpers.ts  # Shared catalog validation helpers
│   │   │   ├── services.routes.ts
│   │   │   ├── services.service.ts
│   │   │   ├── categories.routes.ts
│   │   │   ├── categories.service.ts
│   │   │   ├── products.routes.ts
│   │   │   ├── products.service.ts
│   │   │   ├── prices.routes.ts    # + current, history, PATCH price
│   │   │   └── prices.service.ts
│   │   ├── leads/
│   │   │   ├── leads.routes.ts     # CRUD + convert-to-customer
│   │   │   └── leads.service.ts
│   │   ├── customers/
│   │   │   ├── customers.routes.ts
│   │   │   └── customers.service.ts
│   │   ├── opportunities/
│   │   │   ├── opportunities.routes.ts
│   │   │   └── opportunities.service.ts
│   │   ├── activities/
│   │   │   ├── activities.routes.ts
│   │   │   └── activities.service.ts
│   │   ├── surveys/
│   │   │   ├── surveys.routes.ts
│   │   │   └── surveys.service.ts
│   │   ├── quotations/
│   │   │   ├── quotations.routes.ts  # + items, submit-approval, approve, reject, convert-to-order
│   │   │   └── quotations.service.ts
│   │   ├── sales-orders/
│   │   │   ├── sales-orders.routes.ts  # + items, cancel
│   │   │   └── sales-orders.service.ts
│   │   ├── dashboard/
│   │   │   ├── dashboard.routes.ts  # summary + team-performance
│   │   │   └── dashboard.service.ts
│   │   ├── kpis/
│   │   │   ├── kpis.routes.ts       # live computation + targets
│   │   │   └── kpis.service.ts
│   │   ├── reports/
│   │   │   ├── reports.routes.ts    # sales (7 groupBy) + marketing funnel
│   │   │   └── reports.service.ts
│   │   └── audit-logs/
│   │       ├── audit-logs.routes.ts
│   │       └── audit-logs.service.ts
│   └── types/
│       └── express.d.ts            # req.user, req.visibleUserIds, req.parsedQuery typings
├── .env.example
├── eslint.config.mjs
├── tsconfig.json
├── vercel.json
└── package.json
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Client (Next.js Frontend / Postman / Swagger UI)        │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS (Bearer JWT)
┌───────────────────────▼─────────────────────────────────┐
│  Express API  (src/app.ts)                               │
│  ├── Rate Limiting (express-rate-limit)                  │
│  ├── Helmet CSP + CORS whitelist                         │
│  ├── authenticate() → verifies JWT, attaches req.user   │
│  ├── authorize([roles]) → 403 if role not allowed        │
│  └── scopeData() → resolves req.visibleUserIds           │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  Modules (src/modules/*)                                 │
│  Each module: routes.ts → service.ts → prisma           │
│  ├── validate() middleware — Zod schema on every route   │
│  ├── ownerFilter() — enforces data scoping               │
│  └── audit() — fire-and-forget audit log on mutations    │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  PostgreSQL via Prisma ORM                               │
│  19 models · 4 migrations · indexes on ownership fields  │
└─────────────────────────────────────────────────────────┘
```

### Authentication Flow

1. `POST /api/auth/login` → bcrypt compare → sign `accessToken` (15m) + `refreshToken` (7d)
2. Every protected route → `authenticate` middleware verifies JWT → `req.user = { id, role, managerId }`
3. `POST /api/auth/refresh` → verify refresh token → new access token
4. Rate limited: 10 login attempts / 15 min per IP → `429 Too Many Requests`

### RBAC Data Scoping

```
scopeData() resolves req.visibleUserIds:
  ADMIN     → null          (no filter = sees everything)
  MANAGER   → [self, ...team members]
  MARKETING → [self only]

Every list query: WHERE marketingPersonId IN (visibleUserIds)
Every get-by-id:  findFirst(...) returns null = 404  (prevents ID enumeration)
```

---

## 🔑 Key Design Decisions

### 1. Price Snapshot — quotation unitPrice is frozen

When a `QuotationItem` is created, `unitPrice` is snapshotted from the current active `ProductPrice`. If the product price changes later, old quotations and orders are **never affected** — the snapshot is immutable.

### 2. Price Approval Workflow

If `unitPrice < product.minimumPrice`, a `PENDING` `PriceApproval` row must be created via `POST /quotations/:id/submit-approval`. A Manager/Admin then calls `/approve`. The quotation cannot be set to `APPROVED` unless all items either:
- Have `unitPrice >= minimumPrice`, OR
- Have an `APPROVED` `PriceApproval` row

### 3. KPI Actuals — computed on-demand, never editable

`GET /api/kpis` runs live Prisma aggregations (count/sum) against actual transaction tables. No cached or manually-set actuals — users cannot manipulate KPI figures.

### 4. Audit Log `{ old, new }` convention

Every audit `details` JSON uses `{ old: {...}, new: {...} }` structure so a single row is self-contained for full traceability — no cross-referencing needed.

### 5. Manager audit log access (extension beyond spec)

Spec allows only Admin to view audit logs. This implementation also allows Managers, scoped to their own team (`actorId` or `relatedUserId` in team). Revert by removing `MANAGER` from `authorize(['ADMIN', 'MANAGER'])` in `audit-logs.routes.ts`.

---

## ✅ Requirements Checklist

| Requirement | Status | Details |
|-------------|--------|---------|
| **Authentication (JWT)** | ✅ | Access (15m) + Refresh (7d) tokens, bcrypt hashing |
| **Role-Based Access Control** | ✅ | Admin / Manager / Marketing with data scoping |
| **User Hierarchy** | ✅ | Admin → Manager → Marketing team structure |
| **Product Pricing** | ✅ | Price history, min price enforcement, billing types |
| **Price Approval Workflow** | ✅ | Below-min prices require Manager/Admin approval |
| **Lead Management** | ✅ | Full lifecycle + convert to customer |
| **Sales Pipeline** | ✅ | Lead → Customer → Opportunity → Survey → Quotation → Order |
| **Quotation with Line Items** | ✅ | Price snapshot, server-computed totals, item CRUD |
| **Sales Order + Invoice** | ✅ | Auto-generated order/invoice numbers |
| **Role-Based Dashboard** | ✅ | Different shape per role, team performance table |
| **KPI Targets & Actuals** | ✅ | 12 metrics, live Prisma aggregation, not manually editable |
| **Reports** | ✅ | Sales (7 groupBy) + Marketing funnel/pipeline |
| **Audit Logging** | ✅ | All mutations with `{ old, new }` diff + IP address |
| **Request Validation (Zod)** | ✅ | Every POST/PATCH body + every GET query |
| **Pagination + Filtering** | ✅ | Standard envelope `{ data, meta: { page, limit, total, totalPages } }` |
| **API Documentation** | ✅ | Swagger UI at `/api-docs`, OpenAPI JSON at `/api-docs.json` |
| **Rate Limiting** | ✅ | 10 req/15min on auth, 500 req/15min on API |
| **Security Headers** | ✅ | Helmet CSP, HSTS, CORS whitelist, X-Powered-By hidden |
| **Test Suite** | ✅ | 107 assertions — happy-path (46) + RBAC (61), all passing |
| **Production Build** | ✅ | `npm run build` → 284KB bundle, Vercel deployed |

---

## 💡 Key Technical Implementations

### 1. RBAC Data Scoping with `ownerFilter()`
Every list query and `findFirst` call uses `ownerFilter()` so records outside a user's scope silently return 404 — preventing ID enumeration:
```ts
export const ownerFilter = (field: string, ids: string[] | null) =>
  ids === null ? {} : { [field]: { in: ids } };

// Usage in every list:
const where = { AND: [{ deletedAt: null }, ownerFilter('marketingPersonId', visibleUserIds)] };
```

### 2. Price Snapshot — unitPrice is Immutable
When a `QuotationItem` is saved, the current product price is snapshotted. Product price changes never affect existing quotations or orders:
```ts
// unitPrice = 0 means "use current active price as default"
// Once saved, it is frozen — product price changes don't affect this row
const unitPrice = input.unitPrice === 0 ? currentActivePrice : input.unitPrice;
```

### 3. Price Approval — Transaction-Safe
The approve route uses Prisma transactions and passes `tx` to `validateApprovalReadiness` to avoid reading stale (pre-commit) state:
```ts
const result = await prisma.$transaction(async (tx) => {
  await tx.priceApproval.updateMany({ where: { id: { in: pendingIds } }, data: { status: 'APPROVED' } });
  const readiness = await validateApprovalReadiness(quotationId, tx); // pass tx!
  if (!readiness.ok) throw new Error('Approval required');
  return tx.quotation.update({ data: { status: 'APPROVED' } });
});
```

### 4. KPI Actuals — Always Fresh, Never Stored
```ts
// GET /api/kpis runs this for each metric on every request:
case 'REVENUE':
  return Number((await prisma.salesOrder.aggregate({
    where: { status: 'COMPLETED', marketingPersonId: userId, orderDate: { gte: start, lte: end } },
    _sum: { grandTotal: true }
  }))._sum.grandTotal ?? 0);
```

### 5. Audit Log `{ old, new }` Convention
Every mutation writes a self-contained audit row — no cross-referencing needed:
```ts
await audit({
  actor, module: 'QUOTATIONS', action: 'QUOTATION_APPROVAL',
  entityId: quotationId,
  details: {
    old: { status: 'SENT' },
    new: { status: 'APPROVED', approvedPriceItems: 1 }
  }
});
```

### 6. Prisma Singleton for Serverless
Prevents connection pool exhaustion on Vercel cold starts:
```ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

---

## 🚀 Quick Setup (Backend)

> **Backend:** Node.js + Express + TypeScript + Prisma + PostgreSQL  
> **API Docs:** `http://localhost:4000/api-docs`  

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or use Docker)
- npm 9+

### 1. Clone & Install

```bash
git clone <repo-url>
cd ERP-System-Backend
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```env
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erp_sales?schema=public"
JWT_ACCESS_SECRET=your-access-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
BCRYPT_ROUNDS=12
```

### 3. Database Setup

Using Docker (optional):
```bash
docker run --name erp-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16-alpine
```

Run migrations:
```bash
npx prisma migrate dev
```

### 4. Seed Demo Data

```bash
npm run seed
```

This creates **7 demo accounts**, 4 services, 16+ products, 10+ leads, quotations, orders, and 84 KPI targets.

### 5. Start Development Server

```bash
npm run dev
# Server: http://localhost:4000
# API docs: http://localhost:4000/api-docs
```

### 6. Production Build

```bash
npm run build
NODE_ENV=production node dist/server.js
```

---

## 🔑 All Test Credentials

| Email | Password | Role |
|---|---|---|
| `admin@erp.com` | `Admin@123` | ADMIN — full access |
| `manager-a@erp.com` | `Manager@123` | MANAGER — Team A |
| `manager-b@erp.com` | `Manager@123` | MANAGER — Team B |
| `mkt-a1@erp.com` | `Mkt@123` | MARKETING — under Manager A |
| `mkt-a2@erp.com` | `Mkt@123` | MARKETING — under Manager A |
| `mkt-b1@erp.com` | `Mkt@123` | MARKETING — under Manager B |
| `mkt-b2@erp.com` | `Mkt@123` | MARKETING — under Manager B |

---

## 🧪 Running Tests

```bash
# Full test suite (happy-path E2E + RBAC)
npm test

# Individual suites
npm run happy-path        # 46 assertions — full sales lifecycle
npm run test:rbac         # 61 assertions — RBAC + business logic

# Lint
npm run lint              # ESLint (0 warnings target)
npm run lint:fix          # Auto-fix
```

**Test coverage:**
- Marketing A1: scoped reads, auto-assign ownership, cross-scope 404, no-reassign guard
- Manager A: team visibility (A+A1+A2 ≠ B1/B2), cross-scope 404, price approval
- Admin: 7 users visible, POST service, all data accessible
- Price approval: submit → 409 on direct PATCH → approve via route → audit log
- Convert: approve → convert → 409 on duplicate → 409/400 on REJECTED
- ID Tampering: 10 out-of-scope endpoints → all 404, never 403
