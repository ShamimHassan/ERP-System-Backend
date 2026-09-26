import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'ERP Sales & Marketing API',
      version: '1.0.0',
      description:
        'Complete REST API for the ERP Sales & Marketing Management Module. ' +
        'All endpoints (except `/api/auth/login` and `/api/auth/refresh`) require a Bearer JWT token.',
      contact: { name: 'ERP Backend', email: 'admin@erp.com' },
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Development server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token obtained from POST /api/auth/login',
        },
      },
      schemas: {
        /* ── Envelopes ───────────────────────────────────────────────── */
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { description: 'Response payload' },
            meta: {
              type: 'object',
              properties: {
                page: { type: 'integer', example: 1 },
                limit: { type: 'integer', example: 20 },
                total: { type: 'integer', example: 143 },
                totalPages: { type: 'integer', example: 8 },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'NOT_FOUND' },
                message: { type: 'string', example: 'Resource not found' },
                details: { description: 'Field-level validation errors (array or object)' },
              },
            },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Request validation failed' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string', example: 'email' },
                      message: { type: 'string', example: 'Invalid email format' },
                    },
                  },
                },
              },
            },
          },
        },
        /* ── Enums ───────────────────────────────────────────────────── */
        Role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'MARKETING'] },
        LeadStatus: { type: 'string', enum: ['NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST'] },
        LeadSource: { type: 'string', enum: ['WEBSITE','FACEBOOK','GOOGLE','PHONE','EMAIL','REFERRAL','EXISTING_CUSTOMER','DIGITAL_MARKETING','PARTNER','OTHER'] },
        Priority: { type: 'string', enum: ['LOW','MEDIUM','HIGH'] },
        CustomerType: { type: 'string', enum: ['INDIVIDUAL','BUSINESS','CORPORATE','GOVERNMENT','PARTNER'] },
        OpportunityStage: { type: 'string', enum: ['QUALIFICATION','REQUIREMENT_ANALYSIS','SURVEY','PROPOSAL','NEGOTIATION','DECISION','WON','LOST'] },
        QuotationStatus: { type: 'string', enum: ['DRAFT','SENT','VIEWED','NEGOTIATION','APPROVED','REJECTED','EXPIRED','CONVERTED'] },
        SalesOrderStatus: { type: 'string', enum: ['DRAFT','CONFIRMED','PROCESSING','COMPLETED','CANCELLED'] },
        BillingType: { type: 'string', enum: ['MONTHLY','QUARTERLY','YEARLY','ONE_TIME'] },
        PeriodType: { type: 'string', enum: ['MONTHLY','QUARTERLY','YEARLY'] },
        Metric: { type: 'string', enum: ['NEW_LEADS','QUALIFIED_LEADS','CALLS','MEETINGS','SURVEYS','FOLLOW_UPS','QUOTATIONS','WON_DEALS','NEW_CUSTOMERS','REVENUE','COLLECTION','CONVERSION_RATE'] },
        AuditAction: { type: 'string', enum: ['CREATE','UPDATE','DELETE','ASSIGN','REASSIGN','PRICE_CHANGE','DISCOUNT_CHANGE','PRICE_APPROVAL','PRICE_APPROVAL_SUBMIT','QUOTATION_APPROVAL','QUOTATION_REJECTION','APPROVE','REJECT','ORDER_CREATE','ORDER_CANCEL','STATUS_CHANGE','CONVERT'] },
        AuditModule: { type: 'string', enum: ['USERS','LEADS','CUSTOMERS','OPPORTUNITIES','ACTIVITIES','SURVEYS','PRODUCTS','PRICES','QUOTATIONS','SALES_ORDERS','KPI_TARGETS','SYSTEM'] },
        /* ── Core Entities ───────────────────────────────────────────── */
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { $ref: '#/components/schemas/Role' },
            managerId: { type: 'string', format: 'uuid', nullable: true },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Lead: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            leadName: { type: 'string' },
            companyName: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string', format: 'email', nullable: true },
            leadSource: { $ref: '#/components/schemas/LeadSource' },
            priority: { $ref: '#/components/schemas/Priority' },
            status: { $ref: '#/components/schemas/LeadStatus' },
            estimatedValue: { type: 'number', nullable: true },
            managerId: { type: 'string', format: 'uuid' },
            marketingPersonId: { type: 'string', format: 'uuid' },
            nextFollowUp: { type: 'string', format: 'date', nullable: true },
            notes: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            customerType: { $ref: '#/components/schemas/CustomerType' },
            companyName: { type: 'string', nullable: true },
            contactPerson: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string', format: 'email', nullable: true },
            managerId: { type: 'string', format: 'uuid' },
            marketingPersonId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
            convertedFromLeadId: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        Opportunity: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            stage: { $ref: '#/components/schemas/OpportunityStage' },
            estimatedValue: { type: 'number', nullable: true },
            expectedClosingDate: { type: 'string', format: 'date', nullable: true },
            managerId: { type: 'string', format: 'uuid' },
            marketingPersonId: { type: 'string', format: 'uuid' },
          },
        },
        QuotationItem: {
          type: 'object',
          properties: {
            productId: { type: 'string', format: 'uuid' },
            quantity: { type: 'integer', minimum: 1 },
            unitPrice: { type: 'number', minimum: 0 },
            discount: { type: 'number', minimum: 0, maximum: 100 },
            tax: { type: 'number', minimum: 0, maximum: 100 },
            lineTotal: { type: 'number' },
          },
        },
        Quotation: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            quotationNumber: { type: 'string', example: 'QUO-20260926-0001' },
            customerId: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/QuotationStatus' },
            grandTotal: { type: 'number' },
            discountTotal: { type: 'number' },
            taxTotal: { type: 'number' },
            quotationDate: { type: 'string', format: 'date' },
            expiryDate: { type: 'string', format: 'date' },
            items: { type: 'array', items: { $ref: '#/components/schemas/QuotationItem' } },
          },
        },
        SalesOrder: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            orderNumber: { type: 'string', example: 'ORD-20260926-0001' },
            customerId: { type: 'string', format: 'uuid' },
            quotationId: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/SalesOrderStatus' },
            grandTotal: { type: 'number' },
            orderDate: { type: 'string', format: 'date' },
          },
        },
        Service: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            unit: { type: 'string' },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
            category: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                service: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
              },
            },
          },
        },
        ProductPrice: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            productId: { type: 'string', format: 'uuid' },
            regularPrice: { type: 'number' },
            sellingPrice: { type: 'number' },
            minimumPrice: { type: 'number' },
            billingType: { $ref: '#/components/schemas/BillingType' },
            effectiveDate: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            actor: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, role: { $ref: '#/components/schemas/Role' } } },
            module: { $ref: '#/components/schemas/AuditModule' },
            action: { $ref: '#/components/schemas/AuditAction' },
            entityId: { type: 'string', nullable: true },
            entityLabel: { type: 'string', nullable: true },
            summary: { type: 'string', nullable: true },
            details: { type: 'object', nullable: true, description: '{ old: {...}, new: {...}, changed: [...] }' },
            ipAddress: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      /* ── Reusable Parameters ─────────────────────────────────────────── */
      parameters: {
        pageParam: { in: 'query', name: 'page', schema: { type: 'integer', default: 1, minimum: 1 }, description: 'Page number' },
        limitParam: { in: 'query', name: 'limit', schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }, description: 'Items per page' },
        sortParam: { in: 'query', name: 'sort', schema: { type: 'string', example: '-createdAt' }, description: 'Sort field. Prefix with `-` for descending.' },
        searchParam: { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Case-insensitive text search' },
        statusParam: { in: 'query', name: 'status', schema: { type: 'string' }, description: 'Filter by status' },
        dateFromParam: { in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date' }, description: 'Filter createdAt >= date (YYYY-MM-DD)' },
        dateToParam: { in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date' }, description: 'Filter createdAt <= date (YYYY-MM-DD)' },
        idParam: { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Resource UUID' },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication — login, refresh, logout, profile, change password' },
      { name: 'Users', description: 'User management (Admin CRUD, Manager team read)' },
      { name: 'Services', description: 'Service catalog management' },
      { name: 'Categories', description: 'Product category management' },
      { name: 'Products', description: 'Product management' },
      { name: 'Prices', description: 'Product pricing and price history' },
      { name: 'Leads', description: 'Lead management with ownership and convert-to-customer' },
      { name: 'Customers', description: 'Customer management' },
      { name: 'Opportunities', description: 'Sales opportunity pipeline' },
      { name: 'Activities', description: 'Activity and follow-up tracking' },
      { name: 'Surveys', description: 'Site survey management' },
      { name: 'Quotations', description: 'Quotation lifecycle — create, approve, reject, convert' },
      { name: 'Orders', description: 'Sales orders and invoice management' },
      { name: 'Dashboard', description: 'Role-based dashboard summaries and team performance' },
      { name: 'KPIs', description: 'KPI targets and on-demand KPI computation' },
      { name: 'Reports', description: 'Sales and marketing reports' },
      { name: 'Audit Logs', description: 'Audit trail — Admin/Manager only' },
    ],
    paths: {
      /* ══════════════════════════════════════════════════════════════════
         AUTH
      ══════════════════════════════════════════════════════════════════ */
      '/api/auth/login': {
        post: {
          tags: ['Auth'], summary: 'Login', security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email','password'], properties: { email: { type: 'string', format: 'email', example: 'admin@erp.com' }, password: { type: 'string', example: 'Admin@123' } } } } } },
          responses: {
            200: { description: 'Login successful', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/SuccessResponse' }, { properties: { data: { type: 'object', properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' }, user: { $ref: '#/components/schemas/User' } } } } }] } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
            401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'], summary: 'Refresh access token', security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } },
          responses: { 200: { description: 'New access token' }, 401: { description: 'Invalid or expired refresh token' } },
        },
      },
      '/api/auth/logout': {
        post: { tags: ['Auth'], summary: 'Logout (revokes refresh token)', responses: { 200: { description: 'Logged out' } } },
      },
      '/api/auth/me': {
        get: { tags: ['Auth'], summary: 'Get current authenticated user', responses: { 200: { description: 'Current user profile', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/SuccessResponse' }, { properties: { data: { $ref: '#/components/schemas/User' } } }] } } } }, 401: { description: 'Unauthorized' } } },
      },
      '/api/auth/change-password': {
        post: {
          tags: ['Auth'], summary: 'Change own password',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['oldPassword','newPassword'], properties: { oldPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } } } } },
          responses: { 200: { description: 'Password changed' }, 400: { description: 'Invalid old password or validation error' } },
        },
      },
      /* ══════════════════════════════════════════════════════════════════
         USERS
      ══════════════════════════════════════════════════════════════════ */
      '/api/users': {
        get: {
          tags: ['Users'], summary: 'List users (scoped by role)',
          parameters: [
            { $ref: '#/components/parameters/pageParam' }, { $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/sortParam' }, { $ref: '#/components/parameters/searchParam' },
            { $ref: '#/components/parameters/statusParam' },
          ],
          responses: { 200: { description: 'Paginated user list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } } },
        },
        post: {
          tags: ['Users'], summary: 'Create user (Admin only)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name','email','password','role'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, role: { $ref: '#/components/schemas/Role' }, managerId: { type: 'string', format: 'uuid' } } } } } },
          responses: { 200: { description: 'User created' }, 400: { description: 'Validation error' }, 403: { description: 'Forbidden' }, 409: { description: 'Email already exists' } },
        },
      },
      '/api/users/{id}': {
        get: { tags: ['Users'], summary: 'Get user by ID (scoped)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'User' }, 404: { description: 'Not found' } } },
        patch: {
          tags: ['Users'], summary: 'Update user',
          parameters: [{ $ref: '#/components/parameters/idParam' }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string', minLength: 8 }, role: { $ref: '#/components/schemas/Role' }, status: { type: 'string' }, managerId: { type: 'string', format: 'uuid', nullable: true } } } } } },
          responses: { 200: { description: 'Updated user' }, 403: { description: 'Forbidden' }, 404: { description: 'Not found' } },
        },
        delete: { tags: ['Users'], summary: 'Soft-delete user (Admin only)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Deleted' }, 403: { description: 'Forbidden' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         SERVICES / CATEGORIES / PRODUCTS / PRICES
      ══════════════════════════════════════════════════════════════════ */
      '/api/services': {
        get: { tags: ['Services'], summary: 'List services', parameters: [{ $ref: '#/components/parameters/pageParam' },{ $ref: '#/components/parameters/limitParam' },{ $ref: '#/components/parameters/searchParam' },{ $ref: '#/components/parameters/statusParam' }], responses: { 200: { description: 'Service list' } } },
        post: { tags: ['Services'], summary: 'Create service (Admin only)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['ACTIVE','INACTIVE'] } } } } } }, responses: { 200: { description: 'Created' }, 403: { description: 'Forbidden' }, 409: { description: 'Duplicate name' } } },
      },
      '/api/services/{id}': {
        get: { tags: ['Services'], summary: 'Get service', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Service' }, 404: { description: 'Not found' } } },
        patch: { tags: ['Services'], summary: 'Update service (Admin only)', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, status: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['Services'], summary: 'Delete service (Admin only)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Deleted' } } },
      },
      '/api/categories': {
        get: { tags: ['Categories'], summary: 'List categories', parameters: [{ in: 'query', name: 'serviceId', schema: { type: 'string', format: 'uuid' }, description: 'Filter by service' },{ $ref: '#/components/parameters/pageParam' },{ $ref: '#/components/parameters/searchParam' }], responses: { 200: { description: 'Category list' } } },
        post: { tags: ['Categories'], summary: 'Create category (Admin only)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['serviceId','name'], properties: { serviceId: { type: 'string', format: 'uuid' }, name: { type: 'string' } } } } } }, responses: { 200: { description: 'Created' }, 409: { description: 'Duplicate name in service' } } },
      },
      '/api/categories/{id}': {
        get: { tags: ['Categories'], summary: 'Get category', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Category' } } },
        patch: { tags: ['Categories'], summary: 'Update category (Admin only)', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['Categories'], summary: 'Delete category (Admin only)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Deleted' } } },
      },
      '/api/products': {
        get: { tags: ['Products'], summary: 'List products', parameters: [{ in: 'query', name: 'categoryId', schema: { type: 'string' } },{ in: 'query', name: 'serviceId', schema: { type: 'string' } },{ $ref: '#/components/parameters/pageParam' },{ $ref: '#/components/parameters/searchParam' },{ $ref: '#/components/parameters/statusParam' }], responses: { 200: { description: 'Product list', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/SuccessResponse' },{ properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Product' } } } }] } } } } } },
        post: { tags: ['Products'], summary: 'Create product (Admin only)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['categoryId','name','unit'], properties: { categoryId: { type: 'string', format: 'uuid' }, name: { type: 'string' }, description: { type: 'string' }, unit: { type: 'string', example: 'Mbps' }, status: { type: 'string', enum: ['ACTIVE','INACTIVE'] } } } } } }, responses: { 200: { description: 'Created' }, 409: { description: 'Duplicate in category' } } },
      },
      '/api/products/{id}': {
        get: { tags: ['Products'], summary: 'Get product', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Product' } } },
        patch: { tags: ['Products'], summary: 'Update product (Admin only)', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['Products'], summary: 'Delete product (Admin only)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Deleted' }, 409: { description: 'Has active prices or order items' } } },
      },
      '/api/products/{productId}/prices': {
        get: { tags: ['Prices'], summary: 'List price history for a product', parameters: [{ in: 'path', name: 'productId', required: true, schema: { type: 'string', format: 'uuid' } },{ $ref: '#/components/parameters/pageParam' }], responses: { 200: { description: 'Price rows' } } },
        post: { tags: ['Prices'], summary: 'Add new price (Admin only — never updates old row)', parameters: [{ in: 'path', name: 'productId', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['regularPrice','sellingPrice','minimumPrice','billingType','effectiveDate'], properties: { regularPrice: { type: 'number' }, sellingPrice: { type: 'number' }, minimumPrice: { type: 'number' }, billingType: { $ref: '#/components/schemas/BillingType' }, effectiveDate: { type: 'string', format: 'date-time' } } } } } }, responses: { 200: { description: 'New price row created, old deactivated, history written' }, 400: { description: 'sellingPrice < minimumPrice' } } },
      },
      '/api/products/{productId}/prices/current': {
        get: { tags: ['Prices'], summary: 'Get current active price', parameters: [{ in: 'path', name: 'productId', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Current price' }, 404: { description: 'No active price' } } },
      },
      '/api/products/{productId}/prices/history': {
        get: { tags: ['Prices'], summary: 'Get price change history', parameters: [{ in: 'path', name: 'productId', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Price history rows' } } },
      },
      '/api/products/{productId}/prices/{priceId}': {
        patch: { tags: ['Prices'], summary: 'Update price row (Admin only — creates new row)', parameters: [{ in: 'path', name: 'productId', required: true, schema: { type: 'string', format: 'uuid' } },{ in: 'path', name: 'priceId', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'New price row with audit' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         LEADS
      ══════════════════════════════════════════════════════════════════ */
      '/api/leads': {
        get: {
          tags: ['Leads'], summary: 'List leads (scoped by role)',
          parameters: [
            { $ref: '#/components/parameters/pageParam' },{ $ref: '#/components/parameters/limitParam' },
            { $ref: '#/components/parameters/sortParam' },{ $ref: '#/components/parameters/searchParam' },
            { in: 'query', name: 'status', schema: { $ref: '#/components/schemas/LeadStatus' } },
            { in: 'query', name: 'priority', schema: { $ref: '#/components/schemas/Priority' } },
            { in: 'query', name: 'managerId', schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'marketingPersonId', schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/dateFromParam' },{ $ref: '#/components/parameters/dateToParam' },
          ],
          responses: { 200: { description: 'Paginated leads', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/SuccessResponse' },{ properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Lead' } } } }] } } } } },
        },
        post: {
          tags: ['Leads'], summary: 'Create lead',
          description: 'Marketing: marketingPersonId forced to own ID. Manager: can assign to own team. Admin: must supply both IDs.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['leadName','companyName','phone','leadSource','priority'], properties: { leadName: { type: 'string' }, companyName: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string', format: 'email' }, leadSource: { $ref: '#/components/schemas/LeadSource' }, priority: { $ref: '#/components/schemas/Priority' }, status: { $ref: '#/components/schemas/LeadStatus' }, estimatedValue: { type: 'number' }, managerId: { type: 'string', format: 'uuid' }, marketingPersonId: { type: 'string', format: 'uuid' }, nextFollowUp: { type: 'string', format: 'date' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Lead created' }, 400: { description: 'Validation error' } },
        },
      },
      '/api/leads/{id}': {
        get: { tags: ['Leads'], summary: 'Get lead (scoped — 404 for out-of-scope)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Lead' }, 404: { description: 'Not found or out of scope' } } },
        patch: { tags: ['Leads'], summary: 'Update lead', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' }, 403: { description: 'Cannot reassign to another person' } } },
        delete: { tags: ['Leads'], summary: 'Soft-delete lead (Manager/Admin only)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Deleted' }, 403: { description: 'Forbidden' } } },
      },
      '/api/leads/{id}/convert': {
        post: { tags: ['Leads'], summary: 'Convert lead to customer', description: 'Creates a Customer from the lead. Lead status advances to QUALIFIED if not already progressed. Prevents double-conversion.', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Customer created', content: { 'application/json': { schema: { type: 'object', properties: { customerId: { type: 'string' }, leadId: { type: 'string' }, leadStatus: { type: 'string' } } } } } }, 409: { description: 'Already converted' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         CUSTOMERS
      ══════════════════════════════════════════════════════════════════ */
      '/api/customers': {
        get: { tags: ['Customers'], summary: 'List customers (scoped)', parameters: [{ $ref: '#/components/parameters/pageParam' },{ $ref: '#/components/parameters/limitParam' },{ $ref: '#/components/parameters/searchParam' },{ in: 'query', name: 'customerType', schema: { $ref: '#/components/schemas/CustomerType' } },{ $ref: '#/components/parameters/dateFromParam' },{ $ref: '#/components/parameters/dateToParam' }], responses: { 200: { description: 'Customers' } } },
        post: { tags: ['Customers'], summary: 'Create customer', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['customerType','contactPerson','phone'], properties: { customerType: { $ref: '#/components/schemas/CustomerType' }, companyName: { type: 'string' }, contactPerson: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string', format: 'email' } } } } } }, responses: { 200: { description: 'Created' } } },
      },
      '/api/customers/{id}': {
        get: { tags: ['Customers'], summary: 'Get customer (scoped)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Customer' }, 404: { description: 'Not found' } } },
        patch: { tags: ['Customers'], summary: 'Update customer', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         OPPORTUNITIES
      ══════════════════════════════════════════════════════════════════ */
      '/api/opportunities': {
        get: { tags: ['Opportunities'], summary: 'List opportunities (scoped)', parameters: [{ $ref: '#/components/parameters/pageParam' },{ $ref: '#/components/parameters/limitParam' },{ $ref: '#/components/parameters/searchParam' },{ in: 'query', name: 'stage', schema: { $ref: '#/components/schemas/OpportunityStage' } },{ $ref: '#/components/parameters/dateFromParam' },{ $ref: '#/components/parameters/dateToParam' }], responses: { 200: { description: 'Opportunities' } } },
        post: { tags: ['Opportunities'], summary: 'Create opportunity', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name','stage'], properties: { name: { type: 'string' }, leadId: { type: 'string', format: 'uuid' }, customerId: { type: 'string', format: 'uuid' }, stage: { $ref: '#/components/schemas/OpportunityStage' }, estimatedValue: { type: 'number' }, expectedClosingDate: { type: 'string', format: 'date' } } } } } }, responses: { 200: { description: 'Created' } } },
      },
      '/api/opportunities/{id}': {
        get: { tags: ['Opportunities'], summary: 'Get opportunity (scoped)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Opportunity' } } },
        patch: { tags: ['Opportunities'], summary: 'Update opportunity', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         ACTIVITIES
      ══════════════════════════════════════════════════════════════════ */
      '/api/activities': {
        get: { tags: ['Activities'], summary: 'List activities (scoped)', parameters: [{ $ref: '#/components/parameters/pageParam' },{ in: 'query', name: 'relatedType', schema: { type: 'string', enum: ['LEAD','CUSTOMER','OPPORTUNITY'] } },{ in: 'query', name: 'relatedId', schema: { type: 'string', format: 'uuid' } },{ in: 'query', name: 'type', schema: { type: 'string' } },{ in: 'query', name: 'activityDateFrom', schema: { type: 'string', format: 'date' } },{ in: 'query', name: 'activityDateTo', schema: { type: 'string', format: 'date' } }], responses: { 200: { description: 'Activities' } } },
        post: { tags: ['Activities'], summary: 'Create activity', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['relatedType','relatedId','type','activityDate'], properties: { relatedType: { type: 'string', enum: ['LEAD','CUSTOMER','OPPORTUNITY'] }, relatedId: { type: 'string', format: 'uuid' }, type: { type: 'string' }, activityDate: { type: 'string', format: 'date' }, outcome: { type: 'string' }, nextFollowUp: { type: 'string', format: 'date' }, notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Created' } } },
      },
      '/api/activities/{id}': {
        get: { tags: ['Activities'], summary: 'Get activity', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Activity' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         SURVEYS
      ══════════════════════════════════════════════════════════════════ */
      '/api/surveys': {
        get: { tags: ['Surveys'], summary: 'List surveys (scoped)', parameters: [{ $ref: '#/components/parameters/pageParam' },{ in: 'query', name: 'status', schema: { type: 'string', enum: ['PENDING','SCHEDULED','COMPLETED','CANCELLED'] } },{ in: 'query', name: 'surveyDateFrom', schema: { type: 'string', format: 'date' } },{ in: 'query', name: 'surveyDateTo', schema: { type: 'string', format: 'date' } }], responses: { 200: { description: 'Surveys' } } },
        post: { tags: ['Surveys'], summary: 'Create survey', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['opportunityId','location','requirement','surveyDate'], properties: { opportunityId: { type: 'string', format: 'uuid' }, location: { type: 'string' }, requirement: { type: 'string' }, surveyDate: { type: 'string', format: 'date' }, status: { type: 'string', enum: ['PENDING','SCHEDULED','COMPLETED','CANCELLED'] } } } } } }, responses: { 200: { description: 'Created' } } },
      },
      '/api/surveys/{id}': {
        get: { tags: ['Surveys'], summary: 'Get survey (scoped)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Survey' } } },
        patch: { tags: ['Surveys'], summary: 'Update survey', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         QUOTATIONS
      ══════════════════════════════════════════════════════════════════ */
      '/api/quotations': {
        get: { tags: ['Quotations'], summary: 'List quotations (scoped)', parameters: [{ $ref: '#/components/parameters/pageParam' },{ $ref: '#/components/parameters/limitParam' },{ $ref: '#/components/parameters/searchParam' },{ in: 'query', name: 'status', schema: { $ref: '#/components/schemas/QuotationStatus' } },{ in: 'query', name: 'customerId', schema: { type: 'string' } },{ $ref: '#/components/parameters/dateFromParam' },{ $ref: '#/components/parameters/dateToParam' }], responses: { 200: { description: 'Quotations' } } },
        post: {
          tags: ['Quotations'], summary: 'Create quotation with line items',
          description: 'unitPrice defaults to current active product price if 0. grandTotal is ALWAYS server-computed. Snapshot: unitPrice is frozen — product price changes do not affect existing quotations.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['customerId','quotationDate','expiryDate','items'], properties: { customerId: { type: 'string', format: 'uuid' }, quotationDate: { type: 'string', format: 'date' }, expiryDate: { type: 'string', format: 'date' }, discountTotal: { type: 'number', default: 0 }, taxTotal: { type: 'number', default: 0 }, paymentTerms: { type: 'string' }, notes: { type: 'string' }, items: { type: 'array', minItems: 1, items: { type: 'object', required: ['productId','quantity'], properties: { productId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1 }, unitPrice: { type: 'number', default: 0, description: '0 = use current active price' }, discount: { type: 'number', default: 0 }, tax: { type: 'number', default: 0 } } } } } } } } },
          responses: { 200: { description: 'Quotation created', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/SuccessResponse' },{ properties: { data: { $ref: '#/components/schemas/Quotation' } } }] } } } }, 400: { description: 'Validation error' } },
        },
      },
      '/api/quotations/{id}': {
        get: { tags: ['Quotations'], summary: 'Get quotation (scoped)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Quotation with items' } } },
        patch: { tags: ['Quotations'], summary: 'Update quotation header', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      },
      '/api/quotations/{id}/items': {
        post: { tags: ['Quotations'], summary: 'Add line item to quotation', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['productId','quantity'], properties: { productId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer' }, unitPrice: { type: 'number' }, discount: { type: 'number' }, tax: { type: 'number' } } } } } }, responses: { 200: { description: 'Item added, grandTotal recalculated' } } },
      },
      '/api/quotations/{id}/items/{itemId}': {
        delete: { tags: ['Quotations'], summary: 'Remove line item', parameters: [{ $ref: '#/components/parameters/idParam' },{ in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Item removed' } } },
      },
      '/api/quotations/{id}/submit-approval': {
        post: { tags: ['Quotations'], summary: 'Submit below-minimum prices for approval', description: 'For each item where unitPrice < minimumPrice, creates a PENDING PriceApproval row. Marketing can submit, cannot approve.', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Approval rows created', content: { 'application/json': { schema: { type: 'object', properties: { submitted: { type: 'integer' }, created: { type: 'array' }, skipped: { type: 'array' } } } } } } } },
      },
      '/api/quotations/{id}/approve': {
        post: { tags: ['Quotations'], summary: 'Approve quotation (Manager/Admin only)', description: 'Sets all PENDING approvals to APPROVED and quotation.status to APPROVED. Validates all items meet min price or have approval.', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Quotation approved' }, 403: { description: 'Marketing cannot approve' }, 409: { description: 'Unapproved below-minimum items exist' } } },
      },
      '/api/quotations/{id}/reject': {
        post: { tags: ['Quotations'], summary: 'Reject quotation (Manager/Admin only)', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['remarks'], properties: { remarks: { type: 'string', maxLength: 1000 } } } } } }, responses: { 200: { description: 'Quotation rejected' }, 403: { description: 'Marketing cannot reject' } } },
      },
      '/api/quotations/{id}/convert-to-order': {
        post: { tags: ['Quotations'], summary: 'Convert APPROVED quotation to Sales Order', description: 'Only APPROVED quotations can be converted. Copies all items verbatim (price snapshot). Sets quotation.status=CONVERTED. Creates Invoice.', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Sales order created', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/SuccessResponse' },{ properties: { data: { $ref: '#/components/schemas/SalesOrder' } } }] } } } }, 400: { description: 'Not APPROVED' }, 409: { description: 'Already converted' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         SALES ORDERS
      ══════════════════════════════════════════════════════════════════ */
      '/api/sales-orders': {
        get: { tags: ['Orders'], summary: 'List sales orders (scoped)', parameters: [{ $ref: '#/components/parameters/pageParam' },{ $ref: '#/components/parameters/limitParam' },{ $ref: '#/components/parameters/searchParam' },{ in: 'query', name: 'status', schema: { $ref: '#/components/schemas/SalesOrderStatus' } },{ in: 'query', name: 'customerId', schema: { type: 'string' } },{ $ref: '#/components/parameters/dateFromParam' },{ $ref: '#/components/parameters/dateToParam' }], responses: { 200: { description: 'Sales orders' } } },
        post: { tags: ['Orders'], summary: 'Create sales order directly (or from quotation)', description: 'Can link an APPROVED/SENT quotation — items are copied verbatim. Or provide items directly.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['customerId','orderDate'], properties: { customerId: { type: 'string', format: 'uuid' }, quotationId: { type: 'string', format: 'uuid', description: 'Link existing quotation' }, orderDate: { type: 'string', format: 'date' }, discountTotal: { type: 'number', default: 0 }, taxTotal: { type: 'number', default: 0 } } } } } }, responses: { 200: { description: 'Order created' }, 409: { description: 'Order already exists for quotation' } } },
      },
      '/api/sales-orders/{id}': {
        get: { tags: ['Orders'], summary: 'Get sales order (scoped)', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Order with items and invoice' } } },
        patch: { tags: ['Orders'], summary: 'Update sales order header', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      },
      '/api/sales-orders/{id}/items': {
        post: { tags: ['Orders'], summary: 'Add item to sales order', parameters: [{ $ref: '#/components/parameters/idParam' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['productId','quantity'], properties: { productId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer' }, unitPrice: { type: 'number' }, discount: { type: 'number' }, tax: { type: 'number' } } } } } }, responses: { 200: { description: 'Item added' } } },
      },
      '/api/sales-orders/{id}/items/{itemId}': {
        delete: { tags: ['Orders'], summary: 'Remove item from sales order', parameters: [{ $ref: '#/components/parameters/idParam' },{ in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Removed' } } },
      },
      '/api/sales-orders/{id}/cancel': {
        post: { tags: ['Orders'], summary: 'Cancel sales order', description: 'Cannot cancel COMPLETED orders.', parameters: [{ $ref: '#/components/parameters/idParam' }], responses: { 200: { description: 'Cancelled' }, 400: { description: 'Cannot cancel completed order' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         DASHBOARD
      ══════════════════════════════════════════════════════════════════ */
      '/api/dashboard/summary': {
        get: {
          tags: ['Dashboard'], summary: 'Role-scoped dashboard summary',
          description: '**Marketing**: own leads/opptys/quotations/orders + revenue YTD + KPI achievement\n\n**Manager**: own + team aggregates + top performers\n\n**Admin**: org-wide totals',
          responses: { 200: { description: 'Dashboard summary', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', description: 'Shape varies by role' } } } } } } },
        },
      },
      '/api/dashboard/team-performance': {
        get: { tags: ['Dashboard'], summary: 'Team performance table (Manager/Admin)', description: 'Returns each team member row: leads, opptys, won deals, revenue, target, achievement%.', responses: { 200: { description: 'Team performance rows' } } },
      },
      /* ══════════════════════════════════════════════════════════════════
         KPIs
      ══════════════════════════════════════════════════════════════════ */
      '/api/kpis': {
        get: {
          tags: ['KPIs'], summary: 'Compute KPI actuals on-demand',
          description: 'Runs live Prisma aggregations for each metric. Never stale.',
          parameters: [{ in: 'query', name: 'userId', schema: { type: 'string', format: 'uuid' }, description: 'Filter by user (scoped)' },{ in: 'query', name: 'period', schema: { $ref: '#/components/schemas/PeriodType' } },{ in: 'query', name: 'periodStart', schema: { type: 'string', format: 'date' }, example: '2026-09-01' }],
          responses: { 200: { description: 'KPI rows', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/SuccessResponse' },{ properties: { data: { type: 'array', items: { type: 'object', properties: { userId: { type: 'string' }, userName: { type: 'string' }, metric: { $ref: '#/components/schemas/Metric' }, targetValue: { type: 'number' }, actualValue: { type: 'number' }, achievementPct: { type: 'number' } } } } } }] } } } } },
        },
      },
      '/api/kpis/targets': {
        get: { tags: ['KPIs'], summary: 'List stored KPI targets (scoped)', parameters: [{ $ref: '#/components/parameters/pageParam' },{ in: 'query', name: 'periodType', schema: { $ref: '#/components/schemas/PeriodType' } },{ in: 'query', name: 'userId', schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Targets' } } },
        post: {
          tags: ['KPIs'], summary: 'Set / upsert a KPI target (Manager/Admin only)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userId','periodType','periodStart','metric','targetValue'], properties: { userId: { type: 'string', format: 'uuid' }, periodType: { $ref: '#/components/schemas/PeriodType' }, periodStart: { type: 'string', format: 'date', example: '2026-09-01' }, metric: { $ref: '#/components/schemas/Metric' }, targetValue: { type: 'number', minimum: 0 } } } } } },
          responses: { 200: { description: 'Target upserted', content: { 'application/json': { schema: { type: 'object', properties: { created: { type: 'boolean' }, id: { type: 'string' }, targetValue: { type: 'number' } } } } } }, 403: { description: 'Marketing cannot set targets' } },
        },
      },
      /* ══════════════════════════════════════════════════════════════════
         REPORTS
      ══════════════════════════════════════════════════════════════════ */
      '/api/reports/sales': {
        get: {
          tags: ['Reports'], summary: 'Sales report with groupBy',
          parameters: [
            { in: 'query', name: 'groupBy', schema: { type: 'string', enum: ['month','product','service','category','person','manager','customer'] }, description: 'Aggregation dimension (default: month)' },
            { $ref: '#/components/parameters/dateFromParam' },{ $ref: '#/components/parameters/dateToParam' },
            { in: 'query', name: 'serviceId', schema: { type: 'string' } },{ in: 'query', name: 'categoryId', schema: { type: 'string' } },
            { in: 'query', name: 'productId', schema: { type: 'string' } },{ in: 'query', name: 'managerId', schema: { type: 'string' } },
            { in: 'query', name: 'marketingPersonId', schema: { type: 'string' } },{ in: 'query', name: 'customerId', schema: { type: 'string' } },
            { in: 'query', name: 'status', schema: { $ref: '#/components/schemas/SalesOrderStatus' } },
          ],
          responses: { 200: { description: 'Sales report rows + totals' } },
        },
      },
      '/api/reports/marketing': {
        get: {
          tags: ['Reports'], summary: 'Marketing report (leads, pipeline, conversion, funnel)',
          parameters: [{ $ref: '#/components/parameters/dateFromParam' },{ $ref: '#/components/parameters/dateToParam' },{ in: 'query', name: 'marketingPersonId', schema: { type: 'string' } }],
          responses: { 200: { description: 'Marketing report: leads by status, pipeline value, conversion rates, funnel, activities, surveys' } },
        },
      },
      /* ══════════════════════════════════════════════════════════════════
         AUDIT LOGS
      ══════════════════════════════════════════════════════════════════ */
      '/api/audit-logs': {
        get: {
          tags: ['Audit Logs'], summary: 'List audit logs (Admin=all, Manager=own team, Marketing=403)',
          parameters: [
            { $ref: '#/components/parameters/pageParam' },{ $ref: '#/components/parameters/limitParam' },
            { in: 'query', name: 'actorId', schema: { type: 'string', format: 'uuid' }, description: 'Filter by actor user' },
            { in: 'query', name: 'module', schema: { $ref: '#/components/schemas/AuditModule' } },
            { in: 'query', name: 'action', schema: { $ref: '#/components/schemas/AuditAction' } },
            { $ref: '#/components/parameters/dateFromParam' },{ $ref: '#/components/parameters/dateToParam' },
          ],
          responses: {
            200: { description: 'Audit log rows', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/SuccessResponse' },{ properties: { data: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } } } }] } } } },
            403: { description: 'Marketing users cannot access audit logs' },
          },
        },
      },
    },
  },
  apis: [], // paths defined inline above
};

export const swaggerSpec = swaggerJsdoc(options);
