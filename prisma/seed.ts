/**
 * prisma/seed.ts — Full Demo Seed for ERP Sales & Marketing
 *
 * Accounts:
 *   admin@erp.com       / Admin@123      (ADMIN)
 *   manager-a@erp.com   / Manager@123    (MANAGER)
 *   manager-b@erp.com   / Manager@123    (MANAGER)
 *   mkt-a1@erp.com      / Mkt@123        (MARKETING, under Manager A)
 *   mkt-a2@erp.com      / Mkt@123        (MARKETING, under Manager A)
 *   mkt-b1@erp.com      / Mkt@123        (MARKETING, under Manager B)
 *   mkt-b2@erp.com      / Mkt@123        (MARKETING, under Manager B)
 *
 * Run:  npx prisma migrate reset -f && npm run seed
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient, LeadSource, LeadStatus, Priority, OpportunityStage, QuotationStatus, SalesOrderStatus, InvoiceStatus, BillingType, CustomerType, PeriodType, Metric } from '@prisma/client';

const prisma = new PrismaClient();
const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);

/* ─────────────────────────────────── helpers ─────────────────────────────── */
const hash = (pw: string) => bcrypt.hash(pw, ROUNDS);

function today(): Date {
  return new Date();
}
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/* ─────────────────────────────────── main ────────────────────────────────── */
async function main() {
  console.log('🌱 Starting seed…');

  /* ── 1. Users ─────────────────────────────────────────────────────────── */
  const [
    adminHash,
    managerHash,
    mktHash,
  ] = await Promise.all([
    hash('Admin@123'),
    hash('Manager@123'),
    hash('Mkt@123'),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@erp.com' },
    update: {},
    create: { name: 'System Admin', email: 'admin@erp.com', passwordHash: adminHash, role: 'ADMIN' },
  });

  const managerA = await prisma.user.upsert({
    where: { email: 'manager-a@erp.com' },
    update: {},
    create: { name: 'Manager A', email: 'manager-a@erp.com', passwordHash: managerHash, role: 'MANAGER' },
  });

  const managerB = await prisma.user.upsert({
    where: { email: 'manager-b@erp.com' },
    update: {},
    create: { name: 'Manager B', email: 'manager-b@erp.com', passwordHash: managerHash, role: 'MANAGER' },
  });

  const mktA1 = await prisma.user.upsert({
    where: { email: 'mkt-a1@erp.com' },
    update: {},
    create: { name: 'Marketing A1', email: 'mkt-a1@erp.com', passwordHash: mktHash, role: 'MARKETING', managerId: managerA.id },
  });

  const mktA2 = await prisma.user.upsert({
    where: { email: 'mkt-a2@erp.com' },
    update: {},
    create: { name: 'Marketing A2', email: 'mkt-a2@erp.com', passwordHash: mktHash, role: 'MARKETING', managerId: managerA.id },
  });

  const mktB1 = await prisma.user.upsert({
    where: { email: 'mkt-b1@erp.com' },
    update: {},
    create: { name: 'Marketing B1', email: 'mkt-b1@erp.com', passwordHash: mktHash, role: 'MARKETING', managerId: managerB.id },
  });

  const mktB2 = await prisma.user.upsert({
    where: { email: 'mkt-b2@erp.com' },
    update: {},
    create: { name: 'Marketing B2', email: 'mkt-b2@erp.com', passwordHash: mktHash, role: 'MARKETING', managerId: managerB.id },
  });

  console.log('  ✅ Users seeded (7)');

  /* ── 2. Services ──────────────────────────────────────────────────────── */
  const svcInternet = await prisma.service.upsert({
    where: { name: 'Internet' },
    update: {},
    create: { name: 'Internet', description: 'Broadband & dedicated internet services' },
  });
  const svcCloud = await prisma.service.upsert({
    where: { name: 'Cloud' },
    update: {},
    create: { name: 'Cloud', description: 'Cloud hosting, storage, and compute' },
  });
  const svcSoftware = await prisma.service.upsert({
    where: { name: 'Software' },
    update: {},
    create: { name: 'Software', description: 'Business software and SaaS solutions' },
  });
  const svcSecurity = await prisma.service.upsert({
    where: { name: 'Security' },
    update: {},
    create: { name: 'Security', description: 'Cybersecurity and network protection' },
  });

  console.log('  ✅ Services seeded (4)');

  /* ── 3. Categories (2 per service = 8) ───────────────────────────────── */
  const catBroadband = await upsertCategory(svcInternet.id, 'Broadband');
  const catLeased    = await upsertCategory(svcInternet.id, 'Leased Line');
  const catVps       = await upsertCategory(svcCloud.id,    'VPS Hosting');
  const catStorage   = await upsertCategory(svcCloud.id,    'Cloud Storage');
  const catErp       = await upsertCategory(svcSoftware.id, 'ERP Solutions');
  const catCrm       = await upsertCategory(svcSoftware.id, 'CRM Solutions');
  const catFirewall  = await upsertCategory(svcSecurity.id, 'Firewall');
  const catEndpoint  = await upsertCategory(svcSecurity.id, 'Endpoint Security');

  console.log('  ✅ Categories seeded (8)');

  /* ── 4. Products (2 per category = 16) ───────────────────────────────── */
  // Internet — Broadband
  const pBb10  = await upsertProduct(catBroadband.id, svcInternet.id, 'Broadband 10 Mbps',  'Mbps');
  const pBb50  = await upsertProduct(catBroadband.id, svcInternet.id, 'Broadband 50 Mbps',  'Mbps');
  // Internet — Leased Line
  const pLl10  = await upsertProduct(catLeased.id,    svcInternet.id, 'Leased Line 10 Mbps','Mbps');
  const pLl100 = await upsertProduct(catLeased.id,    svcInternet.id, 'Leased Line 100 Mbps','Mbps');
  // Cloud — VPS
  const pVpsS  = await upsertProduct(catVps.id,       svcCloud.id,    'VPS Small (2vCPU/4GB)', 'Instance');
  const pVpsL  = await upsertProduct(catVps.id,       svcCloud.id,    'VPS Large (8vCPU/16GB)','Instance');
  // Cloud — Storage
  const pSt100 = await upsertProduct(catStorage.id,   svcCloud.id,    'Cloud Storage 100 GB',  'GB');
  const pSt1T  = await upsertProduct(catStorage.id,   svcCloud.id,    'Cloud Storage 1 TB',    'TB');
  // Software — ERP
  const pErpS  = await upsertProduct(catErp.id,       svcSoftware.id, 'ERP Starter (10 users)',  'User');
  const pErpE  = await upsertProduct(catErp.id,       svcSoftware.id, 'ERP Enterprise (50 users)','User');
  // Software — CRM
  const pCrmB  = await upsertProduct(catCrm.id,       svcSoftware.id, 'CRM Basic (5 users)',     'User');
  const pCrmP  = await upsertProduct(catCrm.id,       svcSoftware.id, 'CRM Pro (20 users)',      'User');
  // Security — Firewall
  const pFwSMB = await upsertProduct(catFirewall.id,  svcSecurity.id, 'Firewall SMB',   'Device');
  const pFwEnt = await upsertProduct(catFirewall.id,  svcSecurity.id, 'Firewall Enterprise','Device');
  // Security — Endpoint
  const pEpS   = await upsertProduct(catEndpoint.id,  svcSecurity.id, 'Endpoint 10 Seats', 'Seat');
  const pEpL   = await upsertProduct(catEndpoint.id,  svcSecurity.id, 'Endpoint 50 Seats', 'Seat');

  console.log('  ✅ Products seeded (16)');

  /* ── 5. Active product prices (1 per product = 16) ───────────────────── */
  const priceData: Array<{
    product: { id: string };
    regular: number; selling: number; minimum: number;
    billing: BillingType;
  }> = [
    { product: pBb10,  regular: 2000,  selling: 1800,  minimum: 1500,  billing: 'MONTHLY' },
    { product: pBb50,  regular: 5000,  selling: 4500,  minimum: 4000,  billing: 'MONTHLY' },
    { product: pLl10,  regular: 8000,  selling: 7500,  minimum: 6500,  billing: 'MONTHLY' },
    { product: pLl100, regular: 35000, selling: 32000, minimum: 28000, billing: 'MONTHLY' },
    { product: pVpsS,  regular: 3000,  selling: 2800,  minimum: 2500,  billing: 'MONTHLY' },
    { product: pVpsL,  regular: 9000,  selling: 8500,  minimum: 7500,  billing: 'MONTHLY' },
    { product: pSt100, regular: 1200,  selling: 1000,  minimum: 800,   billing: 'MONTHLY' },
    { product: pSt1T,  regular: 5000,  selling: 4500,  minimum: 4000,  billing: 'MONTHLY' },
    { product: pErpS,  regular: 15000, selling: 13500, minimum: 12000, billing: 'YEARLY'  },
    { product: pErpE,  regular: 50000, selling: 46000, minimum: 42000, billing: 'YEARLY'  },
    { product: pCrmB,  regular: 8000,  selling: 7200,  minimum: 6500,  billing: 'MONTHLY' },
    { product: pCrmP,  regular: 22000, selling: 20000, minimum: 18000, billing: 'MONTHLY' },
    { product: pFwSMB, regular: 12000, selling: 11000, minimum: 9500,  billing: 'ONE_TIME' },
    { product: pFwEnt, regular: 40000, selling: 37000, minimum: 34000, billing: 'ONE_TIME' },
    { product: pEpS,   regular: 6000,  selling: 5500,  minimum: 5000,  billing: 'YEARLY'  },
    { product: pEpL,   regular: 25000, selling: 23000, minimum: 20000, billing: 'YEARLY'  },
  ];

  const productPrices: Record<string, { id: string; sellingPrice: number; minimumPrice: number }> = {};

  for (const pd of priceData) {
    const existing = await prisma.productPrice.findFirst({
      where: { productId: pd.product.id, status: 'ACTIVE' },
    });
    if (!existing) {
      const pp = await prisma.productPrice.create({
        data: {
          productId:    pd.product.id,
          regularPrice: pd.regular,
          sellingPrice: pd.selling,
          minimumPrice: pd.minimum,
          billingType:  pd.billing,
          effectiveDate: today(),
          status:       'ACTIVE',
          createdById:  admin.id,
        },
      });
      productPrices[pd.product.id] = { id: pp.id, sellingPrice: pd.selling, minimumPrice: pd.minimum };
    } else {
      productPrices[pd.product.id] = {
        id: existing.id,
        sellingPrice: Number(existing.sellingPrice),
        minimumPrice: Number(existing.minimumPrice),
      };
    }
  }

  console.log('  ✅ Product prices seeded (16)');

  /* ── 6. Leads (10 total, distributed across A1×3, A2×3, B1×2, B2×2) ─── */
  const leadOwners: Array<{ mkt: { id: string }; mgr: { id: string } }> = [
    { mkt: mktA1, mgr: managerA }, // lead 1
    { mkt: mktA1, mgr: managerA }, // lead 2
    { mkt: mktA1, mgr: managerA }, // lead 3
    { mkt: mktA2, mgr: managerA }, // lead 4
    { mkt: mktA2, mgr: managerA }, // lead 5
    { mkt: mktA2, mgr: managerA }, // lead 6
    { mkt: mktB1, mgr: managerB }, // lead 7
    { mkt: mktB1, mgr: managerB }, // lead 8
    { mkt: mktB2, mgr: managerB }, // lead 9
    { mkt: mktB2, mgr: managerB }, // lead 10
  ];

  const leadDefs: Array<{
    name: string; company: string; phone: string;
    source: LeadSource; status: LeadStatus; priority: Priority;
    serviceId: string; categoryId: string; productId: string;
    estimatedValue: number; daysAgoCreated: number;
  }> = [
    { name: 'Acme Corp',         company: 'Acme Corp Ltd',         phone: '01711000001', source: 'WEBSITE',          status: 'NEW',         priority: 'HIGH',   serviceId: svcInternet.id, categoryId: catBroadband.id, productId: pBb50.id,  estimatedValue: 54000,  daysAgoCreated: 30 },
    { name: 'TechnoVision',      company: 'TechnoVision BD',       phone: '01711000002', source: 'FACEBOOK',         status: 'CONTACTED',   priority: 'MEDIUM', serviceId: svcCloud.id,    categoryId: catVps.id,       productId: pVpsL.id,  estimatedValue: 102000, daysAgoCreated: 25 },
    { name: 'GreenField Farms',  company: 'GreenField Agro Ltd',   phone: '01711000003', source: 'REFERRAL',         status: 'QUALIFIED',   priority: 'HIGH',   serviceId: svcSoftware.id, categoryId: catErp.id,       productId: pErpS.id,  estimatedValue: 162000, daysAgoCreated: 20 },
    { name: 'Nexus Solutions',   company: 'Nexus IT Solutions',    phone: '01711000004', source: 'GOOGLE',           status: 'PROPOSAL',    priority: 'HIGH',   serviceId: svcSecurity.id, categoryId: catFirewall.id,  productId: pFwEnt.id, estimatedValue: 444000, daysAgoCreated: 45 },
    { name: 'BlueStar Trading',  company: 'BlueStar Trading Co',   phone: '01711000005', source: 'PHONE',            status: 'NEGOTIATION', priority: 'MEDIUM', serviceId: svcInternet.id, categoryId: catLeased.id,    productId: pLl10.id,  estimatedValue: 90000,  daysAgoCreated: 40 },
    { name: 'SolarCity BD',      company: 'SolarCity Bangladesh',  phone: '01711000006', source: 'EMAIL',            status: 'WON',         priority: 'HIGH',   serviceId: svcCloud.id,    categoryId: catStorage.id,   productId: pSt1T.id,  estimatedValue: 54000,  daysAgoCreated: 60 },
    { name: 'Metro Finance',     company: 'Metro Finance Ltd',     phone: '01711000007', source: 'DIGITAL_MARKETING',status: 'NEW',         priority: 'LOW',    serviceId: svcSoftware.id, categoryId: catCrm.id,       productId: pCrmB.id,  estimatedValue: 96000,  daysAgoCreated: 15 },
    { name: 'EduTech BD',        company: 'EduTech Bangladesh',    phone: '01711000008', source: 'PARTNER',          status: 'CONTACTED',   priority: 'MEDIUM', serviceId: svcSecurity.id, categoryId: catEndpoint.id,  productId: pEpL.id,   estimatedValue: 276000, daysAgoCreated: 10 },
    { name: 'Horizon Group',     company: 'Horizon Exports Ltd',   phone: '01711000009', source: 'EXISTING_CUSTOMER',status: 'QUALIFIED',   priority: 'HIGH',   serviceId: svcInternet.id, categoryId: catBroadband.id, productId: pBb10.id,  estimatedValue: 24000,  daysAgoCreated: 35 },
    { name: 'Delta Logistics',   company: 'Delta Logistics BD',    phone: '01711000010', source: 'REFERRAL',         status: 'PROPOSAL',    priority: 'MEDIUM', serviceId: svcCloud.id,    categoryId: catVps.id,       productId: pVpsS.id,  estimatedValue: 33600,  daysAgoCreated: 22 },
  ];

  const leads = [];
  for (let i = 0; i < leadDefs.length; i++) {
    const def  = leadDefs[i]!;
    const own  = leadOwners[i]!;
    const lead = await prisma.lead.upsert({
      where: {
        // no natural unique — use a sentinel name + company combo check
        id: (await prisma.lead.findFirst({ where: { leadName: def.name, marketingPersonId: own.mkt.id } }))?.id ?? '00000000-0000-0000-0000-000000000000',
      },
      update: {},
      create: {
        leadName:         def.name,
        companyName:      def.company,
        phone:            def.phone,
        leadSource:       def.source,
        status:           def.status,
        priority:         def.priority,
        serviceId:        def.serviceId,
        categoryId:       def.categoryId,
        productId:        def.productId,
        estimatedValue:   def.estimatedValue,
        managerId:        own.mgr.id,
        marketingPersonId: own.mkt.id,
        nextFollowUp:     daysFromNow(7),
        createdAt:        daysAgo(def.daysAgoCreated),
      },
    });
    leads.push(lead);
  }

  console.log('  ✅ Leads seeded (10)');

  /* ── 7. Opportunities (2) ─────────────────────────────────────────────── */
  const opp1 = await prisma.opportunity.upsert({
    where: {
      id: (await prisma.opportunity.findFirst({ where: { name: 'GreenField ERP Implementation', marketingPersonId: mktA1.id } }))?.id ?? '00000000-0000-0000-0000-000000000001',
    },
    update: {},
    create: {
      name:               'GreenField ERP Implementation',
      leadId:             leads[2]!.id,   // GreenField Farms lead
      serviceId:          svcSoftware.id,
      categoryId:         catErp.id,
      productId:          pErpS.id,
      estimatedValue:     162000,
      expectedClosingDate: daysFromNow(30),
      managerId:          managerA.id,
      marketingPersonId:  mktA1.id,
      stage:              OpportunityStage.PROPOSAL,
      notes:              'Client interested in full ERP rollout for 10 branches.',
    },
  });

  const opp2 = await prisma.opportunity.upsert({
    where: {
      id: (await prisma.opportunity.findFirst({ where: { name: 'Nexus Firewall Upgrade', marketingPersonId: mktB1.id } }))?.id ?? '00000000-0000-0000-0000-000000000002',
    },
    update: {},
    create: {
      name:               'Nexus Firewall Upgrade',
      leadId:             leads[6]!.id,   // Metro Finance lead
      serviceId:          svcSecurity.id,
      categoryId:         catFirewall.id,
      productId:          pFwEnt.id,
      estimatedValue:     444000,
      expectedClosingDate: daysFromNow(15),
      managerId:          managerB.id,
      marketingPersonId:  mktB1.id,
      stage:              OpportunityStage.NEGOTIATION,
      notes:              'Upgrading from competitor solution. Decision expected within 2 weeks.',
    },
  });

  console.log('  ✅ Opportunities seeded (2)');

  /* ── 8. Customer (for quotation & order demo) ─────────────────────────── */
  const demoCustomer = await prisma.customer.upsert({
    where: {
      id: (await prisma.customer.findFirst({ where: { contactPerson: 'GreenField Agro Ltd', marketingPersonId: mktA1.id } }))?.id ?? '00000000-0000-0000-0000-000000000003',
    },
    update: {},
    create: {
      customerType:      CustomerType.CORPORATE,
      companyName:       'GreenField Agro Ltd',
      contactPerson:     'Mr. Raihan Khan',
      phone:             '01812000001',
      email:             'raihan@greenfield.bd',
      address:           '45, Gulshan Avenue, Dhaka 1212',
      billingAddress:    '45, Gulshan Avenue, Dhaka 1212',
      managerId:         managerA.id,
      marketingPersonId: mktA1.id,
      status:            'ACTIVE',
    },
  });

  console.log('  ✅ Demo customer seeded');

  /* ── 9. Quotation (APPROVED, linked to opp1) ──────────────────────────── */
  const quoNumber = 'QUO-SEED-0001';
  const existingQuo = await prisma.quotation.findFirst({ where: { quotationNumber: quoNumber } });

  let demoQuotation = existingQuo;
  if (!existingQuo) {
    // product: pErpS (selling 13500, minimum 12000) — price ABOVE minimum
    const unitPrice = productPrices[pErpS.id]!.sellingPrice;  // 13500
    const qty = 10;
    const lineTotal = unitPrice * qty;  // 135000

    demoQuotation = await prisma.quotation.create({
      data: {
        quotationNumber:  quoNumber,
        customerId:       demoCustomer.id,
        opportunityId:    opp1.id,
        managerId:        managerA.id,
        marketingPersonId: mktA1.id,
        quotationDate:    daysAgo(5),
        expiryDate:       daysFromNow(25),
        discountTotal:    0,
        taxTotal:         0,
        grandTotal:       lineTotal,
        paymentTerms:     'Net 30 days',
        notes:            'Annual ERP subscription for 10 users.',
        status:           QuotationStatus.APPROVED,
        items: {
          create: {
            productId: pErpS.id,
            quantity:  qty,
            unitPrice: unitPrice,
            discount:  0,
            tax:       0,
            lineTotal: lineTotal,
          },
        },
      },
    });
  }

  console.log('  ✅ Quotation seeded (QUO-SEED-0001, APPROVED)');

  /* ── 10. Sales Order (COMPLETED, converted from quotation) ───────────── */
  const orderNumber = 'ORD-SEED-0001';
  const existingOrder = await prisma.salesOrder.findFirst({ where: { orderNumber } });

  if (!existingOrder && demoQuotation) {
    const quo = await prisma.quotation.findUnique({
      where: { id: demoQuotation.id },
      include: { items: true },
    });

    if (quo) {
      const order = await prisma.salesOrder.create({
        data: {
          orderNumber,
          customerId:           demoCustomer.id,
          quotationId:          quo.id,
          managerId:            managerA.id,
          marketingPersonId:    mktA1.id,
          orderDate:            daysAgo(3),
          expectedActivationDate: daysFromNow(7),
          discountTotal:        quo.discountTotal,
          taxTotal:             quo.taxTotal,
          grandTotal:           quo.grandTotal,
          paymentTerms:         quo.paymentTerms ?? undefined,
          status:               SalesOrderStatus.COMPLETED,
          items: {
            create: quo.items.map((item) => ({
              productId: item.productId,
              quantity:  item.quantity,
              unitPrice: item.unitPrice,
              discount:  item.discount,
              tax:       item.tax,
              lineTotal: item.lineTotal,
            })),
          },
          invoice: {
            create: {
              invoiceNumber: 'INV-SEED-0001',
              amount:        quo.grandTotal,
              status:        InvoiceStatus.PAID,
              issuedAt:      daysAgo(3),
              paidAt:        daysAgo(1),
            },
          },
        },
      });

      // Mark quotation as CONVERTED
      await prisma.quotation.update({
        where: { id: quo.id },
        data:  { status: QuotationStatus.CONVERTED },
      });

      console.log(`  ✅ Sales order seeded (ORD-SEED-0001, COMPLETED) — invoice INV-SEED-0001 PAID`);
    }
  } else if (existingOrder) {
    console.log('  ⏭  Sales order already exists, skipping.');
  }

  /* ── 11. DRAFT Quotation for happy-path below-min approval demo ────────── */
  const draftQuoNumber = 'QUO-SEED-HAPPY-PATH';
  const existingDraftQuo = await prisma.quotation.findFirst({ where: { quotationNumber: draftQuoNumber } });

  if (!existingDraftQuo) {
    // Broadband 50 Mbps: selling 4500, minimum 4000. We'll set unitPrice = 3500
    // so it is below the minimum price — triggers approval workflow.
    const bb50Min = productPrices[pBb50.id]!.minimumPrice;      // 4000
    const belowMinUnitPrice = bb50Min - 500;                    // 3500 (below min)
    const qty = 6;
    const lineTotal = belowMinUnitPrice * qty;                   // 21000
    const hpCustomer = await prisma.customer.findFirst({ where: { marketingPersonId: mktA1.id, deletedAt: null } }) ?? demoCustomer;

    await prisma.quotation.create({
      data: {
        quotationNumber:  draftQuoNumber,
        customerId:       hpCustomer.id,
        opportunityId:    opp1.id,
        managerId:        managerA.id,
        marketingPersonId: mktA1.id,
        quotationDate:    today(),
        expiryDate:       daysFromNow(14),
        discountTotal:    0,
        taxTotal:         0,
        grandTotal:       lineTotal,
        paymentTerms:     'Net 30 days',
        notes:            'Happy-path demo: below-minimum Broadband 50 Mbps x 6 quote — needs manager approval.',
        status:           QuotationStatus.DRAFT,
        items: {
          create: {
            productId: pBb50.id,
            quantity:  qty,
            unitPrice: belowMinUnitPrice,
            discount:  0,
            tax:       0,
            lineTotal: lineTotal,
          },
        },
      },
    });
    console.log(`  ✅ Draft below-min quotation seeded (${draftQuoNumber}, DRAFT — unitPrice 3500 < min 4000)`);
  } else {
    console.log('  ⏭  Draft happy-path quotation already exists, skipping.');
  }

  /* ── 12. KPI Targets — current month (MONTHLY) for all 7 users ────────── */
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const targetUsers = [
    { user: admin,    role: 'ADMIN',     targets: { NEW_LEADS: 200, QUALIFIED_LEADS: 80, CALLS: 500, MEETINGS: 80, SURVEYS: 40, FOLLOW_UPS: 400, QUOTATIONS: 60, WON_DEALS: 20, NEW_CUSTOMERS: 40, REVENUE: 5000000, COLLECTION: 4500000, CONVERSION_RATE: 40 } },
    { user: managerA, role: 'MANAGER',   targets: { NEW_LEADS: 100, QUALIFIED_LEADS: 40, CALLS: 250, MEETINGS: 40, SURVEYS: 20, FOLLOW_UPS: 200, QUOTATIONS: 30, WON_DEALS: 10, NEW_CUSTOMERS: 20, REVENUE: 2500000, COLLECTION: 2200000, CONVERSION_RATE: 35 } },
    { user: managerB, role: 'MANAGER',   targets: { NEW_LEADS: 100, QUALIFIED_LEADS: 40, CALLS: 250, MEETINGS: 40, SURVEYS: 20, FOLLOW_UPS: 200, QUOTATIONS: 30, WON_DEALS: 10, NEW_CUSTOMERS: 20, REVENUE: 2500000, COLLECTION: 2200000, CONVERSION_RATE: 35 } },
    { user: mktA1,    role: 'MARKETING', targets: { NEW_LEADS:  50, QUALIFIED_LEADS: 20, CALLS: 120, MEETINGS: 20, SURVEYS: 10, FOLLOW_UPS: 100, QUOTATIONS: 15, WON_DEALS:  5, NEW_CUSTOMERS: 10, REVENUE: 1200000, COLLECTION: 1100000, CONVERSION_RATE: 30 } },
    { user: mktA2,    role: 'MARKETING', targets: { NEW_LEADS:  50, QUALIFIED_LEADS: 20, CALLS: 120, MEETINGS: 20, SURVEYS: 10, FOLLOW_UPS: 100, QUOTATIONS: 15, WON_DEALS:  5, NEW_CUSTOMERS: 10, REVENUE: 1200000, COLLECTION: 1100000, CONVERSION_RATE: 30 } },
    { user: mktB1,    role: 'MARKETING', targets: { NEW_LEADS:  50, QUALIFIED_LEADS: 20, CALLS: 120, MEETINGS: 20, SURVEYS: 10, FOLLOW_UPS: 100, QUOTATIONS: 15, WON_DEALS:  5, NEW_CUSTOMERS: 10, REVENUE: 1200000, COLLECTION: 1100000, CONVERSION_RATE: 30 } },
    { user: mktB2,    role: 'MARKETING', targets: { NEW_LEADS:  50, QUALIFIED_LEADS: 20, CALLS: 120, MEETINGS: 20, SURVEYS: 10, FOLLOW_UPS: 100, QUOTATIONS: 15, WON_DEALS:  5, NEW_CUSTOMERS: 10, REVENUE: 1200000, COLLECTION: 1100000, CONVERSION_RATE: 30 } },
  ] as const;

  const targetMetrics = Object.keys(targetUsers[0].targets) as Array<keyof typeof targetUsers[0]['targets']>;
  let seededTargets = 0;
  for (const tu of targetUsers) {
    for (const metric of targetMetrics) {
      const existing = await prisma.target.findFirst({
        where: {
          userId: tu.user.id,
          periodType: 'MONTHLY',
          metric,
          periodStart: monthStart,
        },
      });
      if (!existing) {
        await prisma.target.create({
          data: {
            userId: tu.user.id,
            periodType: 'MONTHLY',
            periodStart: monthStart,
            periodEnd: monthEnd,
            metric,
            targetValue: tu.targets[metric],
          },
        });
        seededTargets++;
      }
    }
  }
  console.log(seededTargets > 0
    ? `  ✅ KPI targets seeded (${seededTargets} new MONTHLY rows for current period, 7 users × 12 metrics)`
    : '  ⏭  KPI targets already exist for this month, skipping.');

  console.log('\n🎉 Seed complete!\n');
  console.log('Demo accounts:');
  console.log('  admin@erp.com       / Admin@123    (ADMIN)');
  console.log('  manager-a@erp.com   / Manager@123  (MANAGER — Team A)');
  console.log('  manager-b@erp.com   / Manager@123  (MANAGER — Team B)');
  console.log('  mkt-a1@erp.com      / Mkt@123      (MARKETING — under Manager A)');
  console.log('  mkt-a2@erp.com      / Mkt@123      (MARKETING — under Manager A)');
  console.log('  mkt-b1@erp.com      / Mkt@123      (MARKETING — under Manager B)');
  console.log('  mkt-b2@erp.com      / Mkt@123      (MARKETING — under Manager B)');
}

/* ─────────────────────────────── upsert helpers ─────────────────────────── */
async function upsertCategory(serviceId: string, name: string) {
  return prisma.productCategory.upsert({
    where: { serviceId_name: { serviceId, name } },
    update: {},
    create: { serviceId, name },
  });
}

async function upsertProduct(categoryId: string, serviceId: string, name: string, unit: string) {
  const existing = await prisma.product.findFirst({ where: { categoryId, name } });
  if (existing) return existing;
  return prisma.product.create({
    data: { categoryId, serviceId, name, unit },
  });
}

/* ─────────────────────────────────── run ─────────────────────────────────── */
main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
