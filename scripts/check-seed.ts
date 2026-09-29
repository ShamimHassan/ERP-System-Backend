import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const [users, leads, products, customers, quotations, orders, targets, activities, surveys, opportunities] =
    await Promise.all([
      p.user.count(), p.lead.count(), p.product.count(), p.customer.count(),
      p.quotation.count(), p.salesOrder.count(), p.target.count(),
      p.activity.count(), p.survey.count(), p.opportunity.count(),
    ]);
  console.log('=== Seed Data Counts ===');
  console.log(`users:         ${users}   (expect >= 7)`);
  console.log(`leads:         ${leads}   (expect >= 10)`);
  console.log(`products:      ${products}  (expect >= 16)`);
  console.log(`customers:     ${customers}`);
  console.log(`opportunities: ${opportunities}`);
  console.log(`quotations:    ${quotations}`);
  console.log(`orders:        ${orders}`);
  console.log(`activities:    ${activities}`);
  console.log(`surveys:       ${surveys}`);
  console.log(`targets:       ${targets}  (expect >= 84)`);
  const ok = users >= 7 && leads >= 10 && products >= 16 && targets >= 84;
  console.log(ok ? '\n✅ Seed data is sufficient for demo' : '\n⚠️  Some counts are low — re-run npm run seed');
}
main().finally(() => p.$disconnect());
