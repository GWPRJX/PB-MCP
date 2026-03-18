// Seed script: Import Big Blue POSibolt data into local MCP database
import fs from 'fs';
import postgres from 'postgres';
import 'dotenv/config';

const TENANT_ID = '44b39ee7-c582-4550-a6d2-7c960937c6f8';
const TEMP = 'C:/Users/OEM/AppData/Local/Temp';

const sql = postgres(process.env.DATABASE_MIGRATION_URL);

async function main() {
  // Load data files
  const products = JSON.parse(fs.readFileSync(`${TEMP}/pb_productlist.json`, 'utf8'));
  const customers = JSON.parse(fs.readFileSync(`${TEMP}/pb_customers.json`, 'utf8'));
  const sales = JSON.parse(fs.readFileSync(`${TEMP}/pb_sales.json`, 'utf8'));

  console.log(`Loaded: ${products.length} products, ${customers.length} customers, ${sales.length} sales`);

  // Maps from POSibolt IDs to local UUIDs
  const productMap = new Map(); // posibolt productId -> local uuid
  const contactMap = new Map(); // posibolt customerId -> local uuid

  // ── Products ──
  console.log('\nSeeding products...');
  for (const p of products) {
    const [row] = await sql`
      INSERT INTO products (tenant_id, sku, name, description, price, currency, category, is_active, reorder_point)
      VALUES (
        ${TENANT_ID},
        ${p.sku || `PB-${p.productId}`},
        ${(p.name || 'Unknown').trim()},
        ${p.description || null},
        ${p.salesPrice || 0},
        'ZAR',
        ${p.productCategory || null},
        ${p.isActive !== false},
        0
      )
      ON CONFLICT (tenant_id, sku) DO NOTHING
      RETURNING id
    `;
    if (row) {
      productMap.set(p.productId, row.id);
    }
  }
  console.log(`  Inserted ${productMap.size} products`);

  // ── Stock Levels ──
  console.log('\nSeeding stock levels...');
  let stockCount = 0;
  for (const p of products) {
    const localId = productMap.get(p.productId);
    if (!localId || !p.stockQty) continue;
    await sql`
      INSERT INTO stock_levels (tenant_id, product_id, quantity_on_hand, warehouse_location)
      VALUES (${TENANT_ID}, ${localId}, ${Math.round(p.stockQty)}, 'Main Warehouse')
    `;
    stockCount++;
  }
  console.log(`  Inserted ${stockCount} stock levels`);

  // ── Contacts (limit to 200 active customers) ──
  console.log('\nSeeding contacts...');
  const activeCustomers = customers
    .filter(c => c.active && c.customer && c.name && c.name.trim())
    .slice(0, 200);

  for (const c of activeCustomers) {
    const email = c.email || null;
    const [row] = await sql`
      INSERT INTO contacts (tenant_id, name, email, phone, company, type, tags, notes)
      VALUES (
        ${TENANT_ID},
        ${(c.name + (c.name2 ? ' ' + c.name2 : '')).trim()},
        ${email},
        ${c.mobile || c.phone || null},
        ${null},
        'customer',
        ${c.city ? [c.city.trim()] : []},
        ${c.address1 ? [c.address1, c.address2, c.city, c.country].filter(Boolean).join(', ') : null}
      )
      ON CONFLICT (tenant_id, email) DO NOTHING
      RETURNING id
    `;
    if (row) {
      contactMap.set(c.customerId, row.id);
    }
  }
  console.log(`  Inserted ${contactMap.size} contacts`);

  // ── Build a reverse customer name lookup for sales matching ──
  const customerNameToId = new Map();
  for (const c of activeCustomers) {
    const name = (c.name + (c.name2 ? ' ' + c.name2 : '')).trim();
    if (contactMap.has(c.customerId)) {
      customerNameToId.set(name.toUpperCase(), contactMap.get(c.customerId));
    }
  }

  // ── Orders + Line Items + Invoices from Sales History ──
  console.log('\nSeeding orders, line items, and invoices from sales history...');
  let orderCount = 0, lineCount = 0, invoiceCount = 0;

  for (const sale of sales) {
    // Try to match contact by name
    const contactId = sale.customerName
      ? customerNameToId.get(sale.customerName.trim().toUpperCase()) || null
      : null;

    const orderDate = sale.dateCreated ? sale.dateCreated.split(' ')[0] : new Date().toISOString().split('T')[0];

    // Calculate totals from lines
    let subtotal = 0, taxTotal = 0;
    for (const line of (sale.lines || [])) {
      subtotal += (line.exclTotal || 0);
      taxTotal += (line.taxAmount || 0);
    }
    const total = sale.invoiceAmount || (subtotal + taxTotal);

    // Determine status based on order number prefix
    const isCRO = sale.orderNo && sale.orderNo.startsWith('SRO');
    const status = isCRO ? 'cancelled' : 'delivered';

    // Insert order
    const [order] = await sql`
      INSERT INTO orders (tenant_id, contact_id, status, order_date, notes, subtotal, tax_amount, total)
      VALUES (
        ${TENANT_ID},
        ${contactId},
        ${status},
        ${orderDate},
        ${sale.orderNo ? `PB Order: ${sale.orderNo}` : null},
        ${subtotal},
        ${taxTotal},
        ${total}
      )
      RETURNING id
    `;
    orderCount++;

    // Insert line items
    for (const line of (sale.lines || [])) {
      // Try to find product by posibolt ID
      const productLocalId = productMap.get(line.productId);
      if (!productLocalId) continue; // skip if product not in our seed set

      await sql`
        INSERT INTO order_line_items (tenant_id, order_id, product_id, quantity, unit_price, line_total)
        VALUES (
          ${TENANT_ID},
          ${order.id},
          ${productLocalId},
          ${Math.max(1, Math.round(line.quantity || 1))},
          ${line.unitPriceIncl || 0},
          ${line.totalInclTax || 0}
        )
      `;
      lineCount++;
    }

    // Insert invoice
    const invStatus = isCRO ? 'cancelled' : (sale.invoiceAmount > 0 ? 'paid' : 'draft');
    await sql`
      INSERT INTO invoices (tenant_id, order_id, contact_id, status, issued_at, subtotal, tax_amount, total, notes)
      VALUES (
        ${TENANT_ID},
        ${order.id},
        ${contactId},
        ${invStatus},
        ${orderDate},
        ${subtotal},
        ${taxTotal},
        ${total},
        ${sale.invoiceNo ? `PB Invoice: ${sale.invoiceNo}` : null}
      )
    `;
    invoiceCount++;
  }

  console.log(`  Inserted ${orderCount} orders, ${lineCount} line items, ${invoiceCount} invoices`);

  // ── Summary ──
  console.log('\n=== Seed Complete ===');
  console.log(`Tenant: Big Blue (${TENANT_ID})`);
  console.log(`Products: ${productMap.size}`);
  console.log(`Stock levels: ${stockCount}`);
  console.log(`Contacts: ${contactMap.size}`);
  console.log(`Orders: ${orderCount}`);
  console.log(`Line items: ${lineCount}`);
  console.log(`Invoices: ${invoiceCount}`);

  await sql.end();
}

main().catch(err => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});
