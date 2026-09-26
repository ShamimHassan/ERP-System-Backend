/**
 * scripts/happy-path.test.ts
 *
 * Full end-to-end happy path for the ERP Sales & Marketing lifecycle.
 *
 * Flow:
 *   1. Login Marketing (mkt-a1)
 *   2. Marketing creates new customer (GreenField Agro)
 *   3. Marketing creates new Lead → converts to Opportunity
 *   4. Marketing creates DRAFT quotation using Broadband 50 at price BELOW minimum
 *   5. Marketing tries /approve directly → MUST FAIL 403 (only Manager/Admin can)
 *   6. Marketing tries PATCH status=APPROVED → MUST FAIL 409 (approval required)
 *   7. Marketing calls /submit-approval for the quotation
 *   8. Login Manager-A, calls /approve → quotation now APPROVED
 *   9. Marketing calls /convert-to-order → Sales Order created, Invoice ISSUED
 *  10. Login Admin, calls GET /dashboard/summary → role-shaped summary
 *  11. Admin calls GET /dashboard/team-performance → nested grouped structure
 *
 * Usage:
 *   npm run happy-path            # uses default BASE_URL http://localhost:4000
 *   BASE_URL=http://x:y npm run happy-path
 */

import 'dotenv/config';

type TestCtx = {
  base: string;
  logins: Record<string, { token: string; userId: string }>;
  created: {
    quotationId?: string;
    customerId?: string;
    leadId?: string;
    opportunityId?: string;
    orderId?: string;
    invoiceId?: string;
  };
};

const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✘\x1b[0m';
const STEP = '\x1b[36m▸\x1b[0m';
const INFO = '\x1b[90m·\x1b[0m';

let stepsRun = 0;
let stepsPassed = 0;

async function request(
  ctx: TestCtx,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { as?: string; body?: unknown; expectedStatus?: number; tolerateNonJson?: boolean; label?: string; important?: boolean } = {}
): Promise<{ status: number; json: any; raw: string }> {
  const token = opts.as ? ctx.logins[opts.as]?.token : undefined;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${ctx.base}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const raw = await res.text();
  let json: any;
  try { json = raw ? JSON.parse(raw) : null; } catch { json = undefined; }

  const statusOk = opts.expectedStatus == null
    ? res.status >= 200 && res.status < 300
    : res.status === opts.expectedStatus;

  if (opts.label) {
    stepsRun++;
    const prefix = statusOk ? PASS : FAIL;
    const statHint = opts.expectedStatus
      ? `(HTTP ${res.status} == ${opts.expectedStatus})`
      : `(HTTP ${res.status})`;
    console.log(`${prefix} [${String(stepsRun).padStart(2, '0')}] ${opts.label} ${statHint}`);
    if (!statusOk) {
      console.log(`   ${INFO} response: ${raw.slice(0, 300)}${raw.length > 300 ? '…' : ''}`);
    }
    if (statusOk) stepsPassed++;
  }

  return { status: res.status, json, raw };
}

function expect(label: string, cond: boolean, info?: string) {
  stepsRun++;
  if (cond) {
    stepsPassed++;
    console.log(`${PASS} [${String(stepsRun).padStart(2, '0')}] ${label}`);
  } else {
    console.log(`${FAIL} [${String(stepsRun).padStart(2, '0')}] ${label}`);
    if (info) console.log(`   ${INFO} ${info}`);
  }
}

async function login(ctx: TestCtx, role: string, email: string, password: string) {
  const r = await request(ctx, 'POST', '/api/auth/login', {
    body: { email, password },
    expectedStatus: 200,
    label: `Login ${role} (${email})`,
  });
  if (!r.json?.success || !r.json?.data?.accessToken) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(r.json ?? r.raw)}`);
  }
  ctx.logins[role] = {
    token: r.json.data.accessToken as string,
    userId: r.json.data.user?.id as string,
  };
}

function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function plusDaysIso(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

async function main() {
  const ctx: TestCtx = {
    base: process.env.BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:4000',
    logins: {},
    created: {},
  };

  console.log(`\n\x1b[1m🛤  ERP Happy Path — running against ${ctx.base}\x1b[0m`);
  console.log(`${INFO} Tip: start server in another terminal with "npm run dev"\n`);

  // Quick health ping
  try {
    const hp = await fetch(`${ctx.base}/health`);
    if (!hp.ok) throw new Error(`/health returned ${hp.status}`);
    console.log(`${PASS} [--] Server healthy\n`);
  } catch (err) {
    console.error(`${FAIL} Could not reach server at ${ctx.base}:`, (err as Error).message);
    console.error(`\n   Hint: run \x1b[1mnpm run dev\x1b[0m in a separate terminal before this test, or set BASE_URL=...\n`);
    process.exit(2);
  }

  /* ────────────────────────────────────────────────────────────────────── *
   *  1. Log in three distinct roles
   * ────────────────────────────────────────────────────────────────────── */
  await login(ctx, 'marketing', 'mkt-a1@erp.com', 'Mkt@123');
  await login(ctx, 'manager',   'manager-a@erp.com', 'Manager@123');
  await login(ctx, 'admin',     'admin@erp.com',     'Admin@123');

  /* ────────────────────────────────────────────────────────────────────── *
   *  2. Marketing creates a new customer
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 2 — customer creation`);
  const cust = await request(ctx, 'POST', '/api/customers', {
    as: 'marketing',
    expectedStatus: 200,
    label: 'Marketing POST /api/customers → 200',
    body: {
      customerType: 'CORPORATE',
      companyName: 'HappyPath Test Co Ltd',
      contactPerson: 'Ms. Sharmin Akter',
      phone: '01319999999',
      email: 'sharmin@happypath.test',
      address: '22, Mirpur Road, Dhaka',
      billingAddress: '22, Mirpur Road, Dhaka',
    },
  });
  ctx.created.customerId = cust.json.data.id;
  expect('New customer id present', !!ctx.created.customerId);

  /* ────────────────────────────────────────────────────────────────────── *
   *  3. Marketing creates a Lead + Opportunity
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 3 — lead + opportunity`);
  const lead = await request(ctx, 'POST', '/api/leads', {
    as: 'marketing',
    expectedStatus: 200,
    label: 'Marketing POST /api/leads → 200',
    body: {
      leadName: 'HappyPath Lead',
      companyName: 'HappyPath Test Co Ltd',
      phone: '01319999999',
      email: 'sharmin@happypath.test',
      leadSource: 'WEBSITE',
      status: 'QUALIFIED',
      priority: 'HIGH',
      estimatedValue: 80000,
      nextFollowUp: plusDaysIso(7),
    },
  });
  ctx.created.leadId = lead.json.data.id;
  expect('New lead id present', !!ctx.created.leadId);

  const opp = await request(ctx, 'POST', '/api/opportunities', {
    as: 'marketing',
    expectedStatus: 200,
    label: 'Marketing POST /api/opportunities → 200',
    body: {
      name: 'HappyPath Broadband Deal',
      leadId: ctx.created.leadId,
      estimatedValue: 80000,
      expectedClosingDate: plusDaysIso(30),
      stage: 'PROPOSAL',
      notes: 'Customer requested 6 x Broadband 50 at special price',
    },
  });
  ctx.created.opportunityId = opp.json.data.id;
  expect('New opportunity id present', !!ctx.created.opportunityId);

  /* ────────────────────────────────────────────────────────────────────── *
   *  4. Marketing creates DRAFT quotation — Broadband 50 x 6 @ unitPrice 3500 (< min 4000)
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 4 — create quotation (below minimum price)`);
  const prodList = await request(ctx, 'GET', '/api/products?limit=100', {
    as: 'marketing',
    expectedStatus: 200,
    label: 'Marketing list products → find Broadband 50',
  });
  const bb50 = prodList.json.data.find((p: any) => /50\s*Mbps/i.test(String(p.name || ''))) ?? prodList.json.data[0];
  expect('Found Broadband 50 product', !!bb50, `got id=${bb50?.id ?? 'null'}`);

  const quo = await request(ctx, 'POST', '/api/quotations', {
    as: 'marketing',
    expectedStatus: 200,
    label: 'Marketing POST /api/quotations (Broadband 50 x6 @ 3500 < min 4000) → 200',
    body: {
      customerId: ctx.created.customerId,
      opportunityId: ctx.created.opportunityId,
      quotationDate: todayIso(),
      expiryDate: plusDaysIso(14),
      status: 'DRAFT',
      discountTotal: 0,
      taxTotal: 0,
      paymentTerms: 'Net 30',
      notes: 'HappyPath E2E: below-min quotation approval flow',
      items: [{
        productId: bb50.id,
        quantity: 6,
        unitPrice: 3500,
        discount: 0,
        tax: 0,
      }],
    },
  });
  ctx.created.quotationId = quo.json.data.id;
  expect('Created quotation status is DRAFT', quo.json.data.status === 'DRAFT');
  expect('Quotation has exactly one item', (quo.json.data.items?.length ?? 0) === 1);
  expect('Quotation item unitPrice = 3500 (below minimum)', quo.json.data.items?.[0]?.unitPrice === 3500);

  /* ────────────────────────────────────────────────────────────────────── *
   *  5. Marketing tries /approve directly → MUST BE 403
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 5 — role guard on /approve (Marketing → 403)`);
  await request(ctx, 'POST', `/api/quotations/${ctx.created.quotationId}/approve`, {
    as: 'marketing',
    expectedStatus: 403,
    label: 'Marketing POST /quotations/:id/approve → 403 Forbidden',
  });

  /* ────────────────────────────────────────────────────────────────────── *
   *  6. Manager tries PATCH status=APPROVED directly → 409 Approval required
   *     Marketing tries PATCH status=APPROVED → 403 Forbidden
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 6 — approval-readiness gate (PATCH status)`);
  await request(ctx, 'PATCH', `/api/quotations/${ctx.created.quotationId}`, {
    as: 'manager',
    body: { status: 'APPROVED' },
    expectedStatus: 409,
    label: 'Manager PATCH quotation status=APPROVED → 409 Approval required',
  });
  await request(ctx, 'PATCH', `/api/quotations/${ctx.created.quotationId}`, {
    as: 'marketing',
    body: { status: 'APPROVED' },
    expectedStatus: 403,
    label: 'Marketing PATCH quotation status=APPROVED → 403 Forbidden',
  });

  /* ────────────────────────────────────────────────────────────────────── *
   *  7. Marketing calls /submit-approval
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 7 — submit-approval`);
  const sub = await request(ctx, 'POST', `/api/quotations/${ctx.created.quotationId}/submit-approval`, {
    as: 'marketing',
    expectedStatus: 200,
    label: 'Marketing POST /quotations/:id/submit-approval → submitted=1',
  });
  expect('submit-approval submitted == 1', sub.json.data.submitted === 1, `got submitted=${sub.json.data.submitted}`);
  expect('submit-approval created array present', Array.isArray(sub.json.data.created) && sub.json.data.created.length === 1);

  /* ────────────────────────────────────────────────────────────────────── *
   *  8. Manager calls /approve → quotation becomes APPROVED
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 8 — manager approve`);
  const app = await request(ctx, 'POST', `/api/quotations/${ctx.created.quotationId}/approve`, {
    as: 'manager',
    expectedStatus: 200,
    label: 'Manager POST /quotations/:id/approve → quotation APPROVED',
  });
  expect('After manager approve, quotation.status = APPROVED', app.json.data.quotation?.status === 'APPROVED');
  expect('Number of rows approved == 1', app.json.data.approved === 1);

  /* ────────────────────────────────────────────────────────────────────── *
   *  9. Marketing calls /convert-to-order → Sales Order + Invoice created
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 9 — convert approved quotation → Sales Order + Invoice`);
  const conv = await request(ctx, 'POST', `/api/quotations/${ctx.created.quotationId}/convert-to-order`, {
    as: 'marketing',
    expectedStatus: 200,
    label: 'Marketing POST /quotations/:id/convert-to-order → Order + Invoice created',
  });
  ctx.created.orderId = conv.json.data.id;
  ctx.created.invoiceId = conv.json.data.invoice?.id;
  expect('New sales order id present', !!ctx.created.orderId);
  expect('Sales order.orderNumber starts with ORD-', (conv.json.data.orderNumber as string)?.startsWith('ORD-'));
  expect('Sales order status == CONFIRMED', conv.json.data.status === 'CONFIRMED');
  expect('Sales order.grandTotal == 21000 (3500 * 6)', Number(conv.json.data.grandTotal) === 21000);
  expect('Quotation status set to CONVERTED', await quotationStatus(ctx, ctx.created.quotationId, 'CONVERTED'));
  expect('Invoice row created (ISSUED)', !!ctx.created.invoiceId && conv.json.data.invoice?.status === 'ISSUED');
  expect('Invoice.invoiceNumber starts with INV-', (conv.json.data.invoice?.invoiceNumber as string)?.startsWith('INV-'));
  expect('Invoice amount == order grandTotal', Number(conv.json.data.invoice?.amount) === 21000);

  /* ────────────────────────────────────────────────────────────────────── *
   * 10. Admin /dashboard/summary + team-performance (role-scoped shapes)
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 10 — Admin dashboard endpoints`);
  const sum = await request(ctx, 'GET', '/api/dashboard/summary', {
    as: 'admin',
    expectedStatus: 200,
    label: 'Admin GET /dashboard/summary → shape ok',
  });
  expect('Summary role == ADMIN', sum.json.data.role === 'ADMIN');
  expect('Summary.counts.leads is a number', typeof sum.json.data.counts.leads === 'number');
  expect('Summary.counts.quotationsApproved is a number', typeof sum.json.data.counts.quotationsApproved === 'number');
  expect('Summary.revenueYtd is a number >= 0', typeof sum.json.data.revenueYtd === 'number' && sum.json.data.revenueYtd >= 0);
  expect('Summary.upcomingActivities is an array (len <= 10)', Array.isArray(sum.json.data.upcomingActivities) && sum.json.data.upcomingActivities.length <= 10);
  expect('Summary.teamAggs present for Admin', !!sum.json.data.teamAggs);
  expect('Summary.teamAggs.topPerformers an array', Array.isArray(sum.json.data.teamAggs.topPerformers));

  const tp = await request(ctx, 'GET', '/api/dashboard/team-performance', {
    as: 'admin',
    expectedStatus: 200,
    label: 'Admin GET /dashboard/team-performance → grouped tree',
  });
  expect('team-performance grouped=true', tp.json.data.grouped === true);
  expect('managerGroups + orphanMembers present', Array.isArray(tp.json.data.managerGroups) && Array.isArray(tp.json.data.orphanMembers));
  expect('Each group has members array with achievementPct fields', tp.json.data.managerGroups.every((g: any) => Array.isArray(g.members) && g.members.every((m: any) => 'achievementPct' in m && 'revenueYtd' in m)));

  /* ────────────────────────────────────────────────────────────────────── *
   * 11. Marketing /team-performance → 403 forbidden
   * ────────────────────────────────────────────────────────────────────── */
  console.log(`\n${STEP} Step 11 — team-performance role guard`);
  await request(ctx, 'GET', '/api/dashboard/team-performance', {
    as: 'marketing',
    expectedStatus: 403,
    label: 'Marketing GET /team-performance → 403 Forbidden',
  });

  /* ────────────────────────────────────────────────────────────────────── */
  console.log(`\n\n\x1b[1m📊 Result: ${stepsPassed}/${stepsRun} assertions passed\x1b[0m`);
  if (stepsPassed < stepsRun) {
    console.log(`\n${FAIL} Some assertions failed — see ${FAIL} rows above.\n`);
    process.exit(1);
  } else {
    console.log(`\n${PASS} All happy-path assertions passed — ERP sales cycle E2E ok.\n`);
  }
}

async function quotationStatus(ctx: TestCtx, id: string, expected: string): Promise<boolean> {
  const r = await request(ctx, 'GET', `/api/quotations/${id}`, { as: 'marketing', expectedStatus: 200 });
  return r.json.data.status === expected;
}

main().catch((e) => {
  console.error(`\n${FAIL} Fatal error in happy-path test:`, e);
  process.exit(1);
});
