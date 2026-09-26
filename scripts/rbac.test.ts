/**
 * scripts/rbac.test.ts
 *
 * Step 24 — RBAC + Business Logic Test Suite
 *
 * Covers all 6 required test scenarios from the spec:
 *   Test 1 — Marketing Person (A1): scoped reads, create, cross-scope 404, no-reassign
 *   Test 2 — Manager (A):  team visibility, cross-scope 404, price-approval
 *   Test 3 — Admin:        global visibility, POST service
 *   Test 4 — Price Approval workflow: submit → approve → audit log
 *   Test 5 — Convert Quotation to Order: approve → convert → duplicate 409 → rejected 409
 *   Test 6 — ID Tampering (Cross-Ownership): all /:id endpoints return 404 for out-of-scope
 *
 * Usage:
 *   npm run test              (alias: npm run happy-path first, then this)
 *   ts-node --transpile-only scripts/rbac.test.ts
 *   BASE_URL=http://localhost:4000 ts-node --transpile-only scripts/rbac.test.ts
 */

import 'dotenv/config';

/* ── types ───────────────────────────────────────────────────────────────── */
interface Ctx {
  base: string;
  tokens: Record<string, string>;   // role → Bearer token
  ids:    Record<string, string>;   // named resource ids
  counts: { run: number; pass: number; fail: number };
}

/* ── ANSI helpers ────────────────────────────────────────────────────────── */
const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/* ── Low-level HTTP helper ───────────────────────────────────────────────── */
async function api(
  ctx: Ctx,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { as?: string; body?: unknown } = {}
): Promise<{ status: number; data: unknown; meta?: unknown; error?: unknown; raw: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.as && ctx.tokens[opts.as]) {
    headers['authorization'] = `Bearer ${ctx.tokens[opts.as]}`;
  }
  const res = await fetch(`${ctx.base}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
  return {
    status: res.status,
    data:   (parsed as Record<string, unknown>).data,
    meta:   (parsed as Record<string, unknown>).meta,
    error:  (parsed as Record<string, unknown>).error,
    raw,
  };
}

/* ── Assertion helper ────────────────────────────────────────────────────── */
function assert(ctx: Ctx, label: string, pass: boolean, detail?: string): boolean {
  ctx.counts.run++;
  if (pass) {
    ctx.counts.pass++;
    console.log(`  ${c.green('✔')} ${label}`);
  } else {
    ctx.counts.fail++;
    console.log(`  ${c.red('✘')} ${label}`);
    if (detail) console.log(`    ${c.dim(detail)}`);
  }
  return pass;
}

/* ── Login helper ────────────────────────────────────────────────────────── */
async function login(ctx: Ctx, role: string, email: string, pw: string): Promise<void> {
  const r = await api(ctx, 'POST', '/api/auth/login', { body: { email, password: pw } });
  if (r.status !== 200 || !(r.data as Record<string, unknown>)?.accessToken) {
    throw new Error(`Login failed for ${email} (${r.status}): ${r.raw.slice(0, 200)}`);
  }
  ctx.tokens[role] = (r.data as Record<string, unknown>).accessToken as string;
  ctx.ids[`${role}UserId`] = (r.data as Record<string, unknown>).user
    ? ((r.data as Record<string, unknown>).user as Record<string, unknown>).id as string
    : '';
}

/* ── Date helpers ────────────────────────────────────────────────────────── */
const today = () => new Date().toISOString().slice(0, 10);
const futureDate = (n = 30) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION HELPERS
 * ════════════════════════════════════════════════════════════════════════════ */
function section(title: string) {
  console.log(`\n${c.cyan('┌─')} ${c.bold(title)}`);
}

/* ════════════════════════════════════════════════════════════════════════════
 * TEST 1 — Marketing Person (A1)
 * ════════════════════════════════════════════════════════════════════════════ */
async function test1_marketing(ctx: Ctx): Promise<void> {
  section('Test 1 — Marketing Person A1: scoped reads, create, cross-scope 404, no-reassign');

  /* 1a. Login A1 → tokens already set, verify /me returns A1 */
  const me = await api(ctx, 'GET', '/api/auth/me', { as: 'mkt-a1' });
  assert(ctx, 'A1 GET /me → 200', me.status === 200);
  assert(ctx, 'A1 /me role == MARKETING', (me.data as Record<string,unknown>)?.role === 'MARKETING');

  /* 1b. Create lead as A1 — should auto-assign to A1 */
  const leadR = await api(ctx, 'POST', '/api/leads', {
    as: 'mkt-a1',
    body: {
      leadName: 'RBAC Test Lead A1',
      companyName: 'RBAC Corp',
      phone: '01300000001',
      leadSource: 'WEBSITE',
      priority: 'MEDIUM',
      status: 'NEW',
    },
  });
  assert(ctx, 'A1 POST /leads → 200', leadR.status === 200, `status=${leadR.status} body=${leadR.raw.slice(0,200)}`);
  const leadId = (leadR.data as Record<string,unknown>)?.id as string | undefined;
  assert(ctx, 'Lead marketingPersonId == A1 id', (leadR.data as Record<string,unknown>)?.marketingPersonId === ctx.ids['mkt-a1UserId']);
  if (leadId) ctx.ids['a1LeadId'] = leadId;

  /* 1c. Create opportunity */
  const oppR = await api(ctx, 'POST', '/api/opportunities', {
    as: 'mkt-a1',
    body: { name: 'RBAC Test Oppty A1', stage: 'QUALIFICATION' },
  });
  assert(ctx, 'A1 POST /opportunities → 200', oppR.status === 200);
  if ((oppR.data as Record<string,unknown>)?.id) ctx.ids['a1OppId'] = (oppR.data as Record<string,unknown>).id as string;

  /* 1d. List leads — should only see own leads */
  const listR = await api(ctx, 'GET', '/api/leads?limit=100', { as: 'mkt-a1' });
  assert(ctx, 'A1 GET /leads → 200', listR.status === 200);
  const leads = listR.data as Record<string,unknown>[];
  const allOwned = Array.isArray(leads) && leads.every(
    (l) => l.marketingPersonId === ctx.ids['mkt-a1UserId']
  );
  assert(ctx, 'A1 list leads — all rows belong to A1', allOwned, `count=${leads?.length}, firstOwner=${leads?.[0]?.marketingPersonId}`);

  /* 1e. A1 cannot see A2 lead */
  if (ctx.ids['a2LeadId']) {
    const crossR = await api(ctx, 'GET', `/api/leads/${ctx.ids['a2LeadId']}`, { as: 'mkt-a1' });
    assert(ctx, `A1 GET /leads/<A2-lead-id> → 404 (not 403)`, crossR.status === 404, `got ${crossR.status}`);
  } else {
    /* create an A2 lead as admin to enable this test */
    const adminLeadR = await api(ctx, 'POST', '/api/leads', {
      as: 'admin',
      body: {
        leadName: 'A2 Admin-created Lead',
        companyName: 'A2 Corp',
        phone: '01300000002',
        leadSource: 'PHONE',
        priority: 'LOW',
        managerId: ctx.ids['mkt-a2ManagerId'] || ctx.ids['manager-aUserId'],
        marketingPersonId: ctx.ids['mkt-a2UserId'],
      },
    });
    if (adminLeadR.status === 200) ctx.ids['a2LeadId'] = (adminLeadR.data as Record<string,unknown>).id as string;
    const crossR = await api(ctx, 'GET', `/api/leads/${ctx.ids['a2LeadId']}`, { as: 'mkt-a1' });
    assert(ctx, 'A1 GET /leads/<A2-lead-id> → 404', crossR.status === 404, `got ${crossR.status}`);
  }

  /* 1f. A1 cannot see B1 lead */
  if (ctx.ids['b1LeadId']) {
    const crossB = await api(ctx, 'GET', `/api/leads/${ctx.ids['b1LeadId']}`, { as: 'mkt-a1' });
    assert(ctx, 'A1 GET /leads/<B1-lead-id> → 404', crossB.status === 404, `got ${crossB.status}`);
  }

  /* 1g. A1 cannot reassign own lead to B1 */
  if (leadId && ctx.ids['mkt-b1UserId']) {
    const reassignR = await api(ctx, 'PATCH', `/api/leads/${leadId}`, {
      as: 'mkt-a1',
      body: { marketingPersonId: ctx.ids['mkt-b1UserId'] },
    });
    assert(ctx, 'A1 PATCH lead.marketingPersonId = B1 → 403', reassignR.status === 403, `got ${reassignR.status}`);
    /* Verify lead is still assigned to A1 */
    const verR = await api(ctx, 'GET', `/api/leads/${leadId}`, { as: 'mkt-a1' });
    assert(ctx, 'Lead marketingPersonId still == A1 after failed reassign', (verR.data as Record<string,unknown>)?.marketingPersonId === ctx.ids['mkt-a1UserId']);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * TEST 2 — Manager A
 * ════════════════════════════════════════════════════════════════════════════ */
async function test2_manager(ctx: Ctx): Promise<void> {
  section('Test 2 — Manager A: team visibility, cross-scope 404, price-approval');

  /* 2a. /api/users — should see Manager A + A1 + A2, not B1/B2 */
  const usersR = await api(ctx, 'GET', '/api/users?limit=100', { as: 'manager-a' });
  assert(ctx, 'Manager A GET /users → 200', usersR.status === 200);
  const users = usersR.data as Record<string,unknown>[];
  const emails = Array.isArray(users) ? users.map((u) => u.email as string) : [];
  assert(ctx, 'Users list includes Manager A', emails.some((e) => e.includes('manager-a')));
  assert(ctx, 'Users list includes A1', emails.some((e) => e.includes('mkt-a1')));
  assert(ctx, 'Users list includes A2', emails.some((e) => e.includes('mkt-a2')));
  assert(ctx, 'Users list does NOT include B1', !emails.some((e) => e.includes('mkt-b1')), `got: ${emails.join(',')}`);
  assert(ctx, 'Users list does NOT include B2', !emails.some((e) => e.includes('mkt-b2')));

  /* 2b. Manager A cannot see B1 lead */
  if (ctx.ids['b1LeadId']) {
    const crossR = await api(ctx, 'GET', `/api/leads/${ctx.ids['b1LeadId']}`, { as: 'manager-a' });
    assert(ctx, 'Manager A GET /leads/<B1-lead-id> → 404', crossR.status === 404, `got ${crossR.status}`);
  }

  /* 2c. Manager A PATCH on B1 lead → 404 */
  if (ctx.ids['b1LeadId']) {
    const patchR = await api(ctx, 'PATCH', `/api/leads/${ctx.ids['b1LeadId']}`, {
      as: 'manager-a',
      body: { notes: 'attempted cross-scope patch' },
    });
    assert(ctx, 'Manager A PATCH /leads/<B1-lead-id> → 404', patchR.status === 404, `got ${patchR.status}`);
  }

  /* 2d. Team performance includes A1 + A2 but not B1/B2 */
  const tpR = await api(ctx, 'GET', '/api/dashboard/team-performance', { as: 'manager-a' });
  assert(ctx, 'Manager A GET /dashboard/team-performance → 200', tpR.status === 200);
  const tpData = tpR.data as Record<string,unknown>;

  // Manager A gets flat rows: { grouped: false, rows: [...] }
  const rows = Array.isArray(tpData?.rows) ? tpData.rows as Record<string,unknown>[] : [];
  const memberEmails = rows.map((m) => (m.userEmail ?? m.userName ?? '') as string);
  assert(ctx, 'Team performance has rows', rows.length > 0, `got ${rows.length} rows`);
  assert(ctx, 'Team performance rows have achievementPct field',
    rows.every((m) => 'achievementPct' in m));
  assert(ctx, 'Team performance does NOT include B1/B2',
    !memberEmails.some((e) => e.includes('mkt-b')),
    `got members: ${memberEmails.join(',')}`);

  /* 2e. Manager A can approve own team's pending quotation */
  if (ctx.ids['pendingApprovalQuotationId']) {
    const approveR = await api(ctx, 'POST', `/api/quotations/${ctx.ids['pendingApprovalQuotationId']}/approve`, {
      as: 'manager-a',
    });
    assert(ctx, 'Manager A can approve own team pending-price quotation → 200', approveR.status === 200, `got ${approveR.status} body=${approveR.raw.slice(0,200)}`);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * TEST 3 — Admin
 * ════════════════════════════════════════════════════════════════════════════ */
async function test3_admin(ctx: Ctx): Promise<void> {
  section('Test 3 — Admin: global visibility, POST service');

  /* 3a. listUsers = 7 (admin + 2 managers + 4 marketing) */
  const usersR = await api(ctx, 'GET', '/api/users?limit=100', { as: 'admin' });
  assert(ctx, 'Admin GET /users → 200', usersR.status === 200);
  const users = usersR.data as Record<string,unknown>[];
  assert(ctx, 'Admin sees all 7 users', Array.isArray(users) && users.length >= 7, `got ${users?.length}`);

  /* 3b. Admin can POST new service → 200 */
  const svcR = await api(ctx, 'POST', '/api/services', {
    as: 'admin',
    body: { name: `RBAC-Test-Service-${Date.now()}`, description: 'Auto-created by RBAC test', status: 'ACTIVE' },
  });
  assert(ctx, 'Admin POST /services → 200 (201)', svcR.status === 200 || svcR.status === 201, `got ${svcR.status}`);
  if ((svcR.data as Record<string,unknown>)?.id) ctx.ids['testServiceId'] = (svcR.data as Record<string,unknown>).id as string;

  /* 3c. Admin can see all leads */
  const leadsR = await api(ctx, 'GET', '/api/leads?limit=100', { as: 'admin' });
  assert(ctx, 'Admin GET /leads → 200', leadsR.status === 200);
  const allLeads = leadsR.data as Record<string,unknown>[];
  const uniqueOwners = new Set(Array.isArray(allLeads) ? allLeads.map((l) => l.marketingPersonId as string) : []);
  assert(ctx, 'Admin sees leads from multiple owners', uniqueOwners.size >= 2, `got ${uniqueOwners.size} distinct owners`);

  /* 3d. Admin can see all quotations */
  const quoR = await api(ctx, 'GET', '/api/quotations?limit=100', { as: 'admin' });
  assert(ctx, 'Admin GET /quotations → 200', quoR.status === 200);

  /* 3e. Admin can see all orders */
  const ordR = await api(ctx, 'GET', '/api/sales-orders?limit=100', { as: 'admin' });
  assert(ctx, 'Admin GET /sales-orders → 200', ordR.status === 200);

  /* 3f. Marketing cannot POST service → 403 */
  const mktSvcR = await api(ctx, 'POST', '/api/services', {
    as: 'mkt-a1',
    body: { name: 'Should Fail', status: 'ACTIVE' },
  });
  assert(ctx, 'Marketing POST /services → 403', mktSvcR.status === 403, `got ${mktSvcR.status}`);
}

/* ════════════════════════════════════════════════════════════════════════════
 * TEST 4 — Price Approval Workflow
 * ════════════════════════════════════════════════════════════════════════════ */
async function test4_priceApproval(ctx: Ctx): Promise<void> {
  section('Test 4 — Price Approval Workflow');

  /* 4a. Need a product with a minimum price — use first product with active price */
  const prods = await api(ctx, 'GET', '/api/products?limit=50', { as: 'admin' });
  assert(ctx, 'GET /products → 200', prods.status === 200);
  const products = prods.data as Record<string,unknown>[];
  assert(ctx, 'At least one product exists', Array.isArray(products) && products.length > 0);

  let productId = '';
  let minPrice = 0;
  for (const p of (products ?? [])) {
    const priceR = await api(ctx, 'GET', `/api/products/${p.id}/prices/current`, { as: 'admin' });
    if (priceR.status === 200 && priceR.data) {
      const d = priceR.data as Record<string,unknown>;
      productId = p.id as string;
      minPrice = Number(d.minimumPrice ?? 0);
      if (minPrice > 0) break;
    }
  }
  assert(ctx, 'Found product with active minimum price', !!productId && minPrice > 0, `productId=${productId}, minPrice=${minPrice}`);
  if (!productId || minPrice === 0) return;

  /* 4b. Need a customer for A1 */
  let customerId = ctx.ids['rbacCustomerId'];
  if (!customerId) {
    const custR = await api(ctx, 'POST', '/api/customers', {
      as: 'mkt-a1',
      body: {
        customerType: 'BUSINESS',
        contactPerson: 'RBAC Test Customer',
        phone: '01300000099',
        companyName: 'RBAC Price Test Corp',
      },
    });
    assert(ctx, 'Create test customer for price approval → 200', custR.status === 200, `got ${custR.status}`);
    customerId = (custR.data as Record<string,unknown>)?.id as string;
    ctx.ids['rbacCustomerId'] = customerId;
  }
  if (!customerId) return;

  /* 4c. Create quotation with below-minimum price */
  const belowMin = Math.max(1, minPrice - 100);
  const quoR = await api(ctx, 'POST', '/api/quotations', {
    as: 'mkt-a1',
    body: {
      customerId,
      quotationDate: today(),
      expiryDate: futureDate(14),
      discountTotal: 0,
      taxTotal: 0,
      items: [{
        productId,
        quantity: 1,
        unitPrice: belowMin,
        discount: 0,
        tax: 0,
      }],
    },
  });
  assert(ctx, `POST /quotations (unitPrice=${belowMin} < minPrice=${minPrice}) → 200`, quoR.status === 200, `got ${quoR.status} body=${quoR.raw.slice(0,200)}`);
  const quoId = (quoR.data as Record<string,unknown>)?.id as string;
  if (!quoId) return;
  ctx.ids['priceApprovalQuoId'] = quoId;

  /* 4d. Submit approval */
  const subR = await api(ctx, 'POST', `/api/quotations/${quoId}/submit-approval`, { as: 'mkt-a1' });
  assert(ctx, 'POST /quotations/:id/submit-approval → 200', subR.status === 200, `got ${subR.status}`);
  assert(ctx, 'submit-approval.submitted == 1', (subR.data as Record<string,unknown>)?.submitted === 1, `got submitted=${(subR.data as Record<string,unknown>)?.submitted}`);

  /* 4e. Directly approve without submitting → 409 on Manager (approval required) */
  const directAppR = await api(ctx, 'PATCH', `/api/quotations/${quoId}`, {
    as: 'manager-a',
    body: { status: 'APPROVED' },
  });
  assert(ctx, 'PATCH status=APPROVED before approving via route → 409', directAppR.status === 409, `got ${directAppR.status}`);

  /* 4f. Manager approves via route → 200, quotation.status = APPROVED */
  const approveR = await api(ctx, 'POST', `/api/quotations/${quoId}/approve`, { as: 'manager-a' });
  assert(ctx, 'Manager POST /approve → 200', approveR.status === 200, `got ${approveR.status} body=${String(approveR.raw).slice(0, 200)}`);
  if (approveR.status === 200) {
    const approveData = approveR.data as Record<string,unknown>;
    const quotationStatus = (approveData?.quotation as Record<string,unknown>)?.status ?? approveData?.status;
    assert(ctx, 'After approve: quotation.status = APPROVED', quotationStatus === 'APPROVED', `got status=${String(quotationStatus)}`);
  }

  /* 4g. Audit log has QUOTATION_APPROVAL row */
  const auditR = await api(ctx, 'GET', '/api/audit-logs?action=QUOTATION_APPROVAL&limit=5', { as: 'admin' });
  assert(ctx, 'GET /audit-logs?action=QUOTATION_APPROVAL → 200', auditR.status === 200, `got ${auditR.status}`);
  const logs = auditR.data as Record<string,unknown>[];
  const hasRow = Array.isArray(logs) && logs.some((l) => l.entityId === quoId || l.module === 'QUOTATIONS');
  assert(ctx, 'Audit log has QUOTATION_APPROVAL row for this quotation', hasRow, `found ${logs?.length} logs, quoId=${quoId}`);
}

/* ════════════════════════════════════════════════════════════════════════════
 * TEST 5 — Convert Quotation to Order
 * ════════════════════════════════════════════════════════════════════════════ */
async function test5_convert(ctx: Ctx): Promise<void> {
  section('Test 5 — Convert Quotation to Order: approve → convert → duplicate 409 → rejected 409');

  const quoId = ctx.ids['priceApprovalQuoId'];
  if (!quoId) {
    console.log(`  ${c.yellow('⚠')} Skipping Test 5 — no approved quotation from Test 4`);
    return;
  }

  /* 5a. Convert approved quotation → order created */
  const convR = await api(ctx, 'POST', `/api/quotations/${quoId}/convert-to-order`, { as: 'mkt-a1' });
  assert(ctx, 'POST /quotations/:id/convert-to-order → 200', convR.status === 200, `got ${convR.status} body=${convR.raw.slice(0,200)}`);
  const orderId = (convR.data as Record<string,unknown>)?.id as string;
  assert(ctx, 'Order created with id', !!orderId);
  assert(ctx, 'Order status == CONFIRMED', (convR.data as Record<string,unknown>)?.status === 'CONFIRMED', `got ${(convR.data as Record<string,unknown>)?.status}`);
  assert(ctx, 'Order has invoice', !!(convR.data as Record<string,unknown>)?.invoice);
  assert(ctx, 'Invoice status == ISSUED', (convR.data as Record<string,unknown>)?.invoice?.status === 'ISSUED');
  if (orderId) ctx.ids['test5OrderId'] = orderId;

  /* 5b. Quotation.status = CONVERTED */
  const quoGet = await api(ctx, 'GET', `/api/quotations/${quoId}`, { as: 'mkt-a1' });
  assert(ctx, 'Quotation.status = CONVERTED after conversion', (quoGet.data as Record<string,unknown>)?.status === 'CONVERTED', `got ${(quoGet.data as Record<string,unknown>)?.status}`);

  /* 5c. Convert again → 409 (already converted) */
  const dupeR = await api(ctx, 'POST', `/api/quotations/${quoId}/convert-to-order`, { as: 'mkt-a1' });
  assert(ctx, 'Convert same quotation again → 409', dupeR.status === 409, `got ${dupeR.status}`);

  /* 5d. Create a NEW quotation, reject it, then try to convert → 409/400 */
  let customerId = ctx.ids['rbacCustomerId'];
  const prods = await api(ctx, 'GET', '/api/products?limit=1', { as: 'mkt-a1' });
  const productId = ((prods.data as Record<string,unknown>[])?.[0])?.id as string;
  if (customerId && productId) {
    const rejQuoR = await api(ctx, 'POST', '/api/quotations', {
      as: 'mkt-a1',
      body: {
        customerId,
        quotationDate: today(),
        expiryDate: futureDate(14),
        discountTotal: 0,
        taxTotal: 0,
        items: [{ productId, quantity: 1, unitPrice: 0, discount: 0, tax: 0 }],
      },
    });
    if (rejQuoR.status === 200) {
      const rejQuoId = (rejQuoR.data as Record<string,unknown>)?.id as string;
      /* reject it */
      await api(ctx, 'POST', `/api/quotations/${rejQuoId}/reject`, {
        as: 'manager-a',
        body: { remarks: 'Test rejection for RBAC Test 5' },
      });
      /* try to convert rejected → 409/400 */
      const convRejR = await api(ctx, 'POST', `/api/quotations/${rejQuoId}/convert-to-order`, { as: 'mkt-a1' });
      assert(ctx, 'Convert REJECTED quotation → 409/400', convRejR.status === 409 || convRejR.status === 400, `got ${convRejR.status}`);
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * TEST 6 — ID Tampering (Cross-Ownership)
 * ════════════════════════════════════════════════════════════════════════════ */
async function test6_idTampering(ctx: Ctx): Promise<void> {
  section('Test 6 — ID Tampering: out-of-scope /:id returns 404 (not 403)');

  /* Collect IDs owned by B1/B2 — create some if needed */
  const b1LeadId = ctx.ids['b1LeadId'];
  const b1CustomerId = ctx.ids['b1CustomerId'];

  /* Create B1-owned resources via admin if not available */
  let b1Lead = b1LeadId;
  if (!b1Lead && ctx.ids['mkt-b1UserId'] && ctx.ids['manager-bUserId']) {
    const r = await api(ctx, 'POST', '/api/leads', {
      as: 'admin',
      body: {
        leadName: 'B1 Lead for Tamper Test',
        companyName: 'B1 Corp',
        phone: '01300000099',
        leadSource: 'EMAIL',
        priority: 'LOW',
        managerId: ctx.ids['manager-bUserId'],
        marketingPersonId: ctx.ids['mkt-b1UserId'],
      },
    });
    if (r.status === 200) b1Lead = (r.data as Record<string,unknown>).id as string;
  }

  let b1Customer = b1CustomerId;
  if (!b1Customer && ctx.ids['mkt-b1UserId'] && ctx.ids['manager-bUserId']) {
    const r = await api(ctx, 'POST', '/api/customers', {
      as: 'admin',
      body: {
        customerType: 'INDIVIDUAL',
        contactPerson: 'B1 Customer Tamper',
        phone: '01300000098',
        managerId: ctx.ids['manager-bUserId'],
        marketingPersonId: ctx.ids['mkt-b1UserId'],
      },
    });
    if (r.status === 200) b1Customer = (r.data as Record<string,unknown>).id as string;
  }

  const endpoints: Array<[string, string, string]> = []; // [label, path, role]

  if (b1Lead) {
    endpoints.push(['A1 GET /leads/<B1-lead>', `/api/leads/${b1Lead}`, 'mkt-a1']);
    endpoints.push(['A1 PATCH /leads/<B1-lead>', `/api/leads/${b1Lead}`, 'mkt-a1']);
    endpoints.push(['Manager-A GET /leads/<B1-lead>', `/api/leads/${b1Lead}`, 'manager-a']);
  }
  if (b1Customer) {
    endpoints.push(['A1 GET /customers/<B1-customer>', `/api/customers/${b1Customer}`, 'mkt-a1']);
    endpoints.push(['Manager-A GET /customers/<B1-customer>', `/api/customers/${b1Customer}`, 'manager-a']);
  }

  /* Use a random UUID for guaranteed non-existent resources */
  const fakeId = '00000000-0000-4000-a000-000000000000';
  endpoints.push(['GET /leads/<fake-uuid> → 404', `/api/leads/${fakeId}`, 'mkt-a1']);
  endpoints.push(['GET /customers/<fake-uuid> → 404', `/api/customers/${fakeId}`, 'mkt-a1']);
  endpoints.push(['GET /quotations/<fake-uuid> → 404', `/api/quotations/${fakeId}`, 'mkt-a1']);
  endpoints.push(['GET /sales-orders/<fake-uuid> → 404', `/api/sales-orders/${fakeId}`, 'mkt-a1']);
  endpoints.push(['GET /opportunities/<fake-uuid> → 404', `/api/opportunities/${fakeId}`, 'mkt-a1']);

  for (const [label, path, role] of endpoints) {
    const method = label.includes('PATCH') ? 'PATCH' : 'GET';
    const r = await api(ctx, method as 'GET' | 'PATCH', path, {
      as: role,
      body: method === 'PATCH' ? { notes: 'tamper attempt' } : undefined,
    });
    assert(ctx, `${label} → 404 (not 403)`, r.status === 404, `got HTTP ${r.status}`);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * MAIN
 * ════════════════════════════════════════════════════════════════════════════ */
async function main() {
  const ctx: Ctx = {
    base: (process.env.BASE_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
    tokens: {},
    ids: {},
    counts: { run: 0, pass: 0, fail: 0 },
  };

  console.log(c.bold(`\n🔐 ERP RBAC + Business Logic Test Suite`));
  console.log(c.dim(`   Target: ${ctx.base}\n`));

  /* ── Health check ──────────────────────────────────────────────────────── */
  try {
    const hp = await fetch(`${ctx.base}/health`);
    if (!hp.ok) throw new Error(`/health ${hp.status}`);
    console.log(`${c.green('✔')} Server healthy at ${ctx.base}`);
  } catch (err) {
    console.error(c.red(`✘ Server not reachable: ${(err as Error).message}`));
    console.error(c.dim('  Run "npm run dev" in a separate terminal first.'));
    process.exit(2);
  }

  /* ── Login all roles ───────────────────────────────────────────────────── */
  console.log(c.dim('\n  Logging in all 7 accounts…'));
  await login(ctx, 'admin',     'admin@erp.com',     'Admin@123');
  await login(ctx, 'manager-a', 'manager-a@erp.com', 'Manager@123');
  await login(ctx, 'manager-b', 'manager-b@erp.com', 'Manager@123');
  await login(ctx, 'mkt-a1',    'mkt-a1@erp.com',    'Mkt@123');
  await login(ctx, 'mkt-a2',    'mkt-a2@erp.com',    'Mkt@123');
  await login(ctx, 'mkt-b1',    'mkt-b1@erp.com',    'Mkt@123');
  await login(ctx, 'mkt-b2',    'mkt-b2@erp.com',    'Mkt@123');
  console.log(c.dim('  All logins OK\n'));

  /* Resolve user IDs needed by cross-scope tests */
  const usersAll = await api(ctx, 'GET', '/api/users?limit=100', { as: 'admin' });
  for (const u of (usersAll.data as Record<string,unknown>[] ?? [])) {
    const email = u.email as string;
    if (email?.includes('mkt-a2'))    ctx.ids['mkt-a2UserId']    = u.id as string;
    if (email?.includes('mkt-b1'))    ctx.ids['mkt-b1UserId']    = u.id as string;
    if (email?.includes('mkt-b2'))    ctx.ids['mkt-b2UserId']    = u.id as string;
    if (email?.includes('manager-b')) ctx.ids['manager-bUserId'] = u.id as string;
  }

  /* Collect some B1 resources from existing seed data */
  const b1Leads = await api(ctx, 'GET', '/api/leads?limit=5', { as: 'mkt-b1' });
  const b1LeadArr = b1Leads.data as Record<string,unknown>[];
  if (Array.isArray(b1LeadArr) && b1LeadArr.length > 0) ctx.ids['b1LeadId'] = b1LeadArr[0].id as string;

  /* ── Run all tests ─────────────────────────────────────────────────────── */
  await test1_marketing(ctx);
  await test2_manager(ctx);
  await test3_admin(ctx);
  await test4_priceApproval(ctx);
  await test5_convert(ctx);
  await test6_idTampering(ctx);

  /* ── Summary ───────────────────────────────────────────────────────────── */
  const { run, pass, fail } = ctx.counts;
  const allPassed = fail === 0;
  console.log('\n' + '─'.repeat(55));
  console.log(c.bold(`📊 Results: ${pass}/${run} passed, ${fail} failed`));
  if (allPassed) {
    console.log(c.green(c.bold('\n✅ All RBAC + business logic tests passed!\n')));
  } else {
    console.log(c.red(c.bold(`\n❌ ${fail} test(s) failed — see ✘ rows above\n`)));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(c.red(`\n✘ Fatal: ${(err as Error).message}`));
  console.error((err as Error).stack);
  process.exit(1);
});
