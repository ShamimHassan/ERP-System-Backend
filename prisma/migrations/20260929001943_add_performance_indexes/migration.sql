-- CreateIndex
CREATE INDEX "Activity_status_idx" ON "Activity"("status");

-- CreateIndex
CREATE INDEX "Activity_type_idx" ON "Activity"("type");

-- CreateIndex
CREATE INDEX "Activity_nextFollowUp_idx" ON "Activity"("nextFollowUp");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_action_createdAt_idx" ON "AuditLog"("module", "action", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_customerType_idx" ON "Customer"("customerType");

-- CreateIndex
CREATE INDEX "Customer_managerId_idx" ON "Customer"("managerId");

-- CreateIndex
CREATE INDEX "Customer_marketingPersonId_idx" ON "Customer"("marketingPersonId");

-- CreateIndex
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_paidAt_idx" ON "Invoice"("paidAt");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_priority_idx" ON "Lead"("priority");

-- CreateIndex
CREATE INDEX "Lead_serviceId_idx" ON "Lead"("serviceId");

-- CreateIndex
CREATE INDEX "Lead_categoryId_idx" ON "Lead"("categoryId");

-- CreateIndex
CREATE INDEX "Lead_productId_idx" ON "Lead"("productId");

-- CreateIndex
CREATE INDEX "Lead_nextFollowUp_idx" ON "Lead"("nextFollowUp");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Opportunity_stage_idx" ON "Opportunity"("stage");

-- CreateIndex
CREATE INDEX "Opportunity_leadId_idx" ON "Opportunity"("leadId");

-- CreateIndex
CREATE INDEX "Opportunity_customerId_idx" ON "Opportunity"("customerId");

-- CreateIndex
CREATE INDEX "Opportunity_serviceId_idx" ON "Opportunity"("serviceId");

-- CreateIndex
CREATE INDEX "Opportunity_categoryId_idx" ON "Opportunity"("categoryId");

-- CreateIndex
CREATE INDEX "Opportunity_productId_idx" ON "Opportunity"("productId");

-- CreateIndex
CREATE INDEX "Opportunity_managerId_idx" ON "Opportunity"("managerId");

-- CreateIndex
CREATE INDEX "Opportunity_marketingPersonId_idx" ON "Opportunity"("marketingPersonId");

-- CreateIndex
CREATE INDEX "Opportunity_expectedClosingDate_idx" ON "Opportunity"("expectedClosingDate");

-- CreateIndex
CREATE INDEX "Opportunity_createdAt_idx" ON "Opportunity"("createdAt");

-- CreateIndex
CREATE INDEX "PriceApproval_quotationItemId_idx" ON "PriceApproval"("quotationItemId");

-- CreateIndex
CREATE INDEX "PriceApproval_productPriceId_idx" ON "PriceApproval"("productPriceId");

-- CreateIndex
CREATE INDEX "PriceApproval_requestedById_idx" ON "PriceApproval"("requestedById");

-- CreateIndex
CREATE INDEX "PriceApproval_approverId_idx" ON "PriceApproval"("approverId");

-- CreateIndex
CREATE INDEX "PriceApproval_status_idx" ON "PriceApproval"("status");

-- CreateIndex
CREATE INDEX "PriceApproval_requestedAt_idx" ON "PriceApproval"("requestedAt");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_serviceId_idx" ON "Product"("serviceId");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");

-- CreateIndex
CREATE INDEX "ProductCategory_serviceId_idx" ON "ProductCategory"("serviceId");

-- CreateIndex
CREATE INDEX "ProductCategory_status_idx" ON "ProductCategory"("status");

-- CreateIndex
CREATE INDEX "ProductCategory_createdAt_idx" ON "ProductCategory"("createdAt");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_productPriceId_idx" ON "ProductPriceHistory"("productPriceId");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_changedById_idx" ON "ProductPriceHistory"("changedById");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_changedAt_idx" ON "ProductPriceHistory"("changedAt");

-- CreateIndex
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");

-- CreateIndex
CREATE INDEX "Quotation_customerId_idx" ON "Quotation"("customerId");

-- CreateIndex
CREATE INDEX "Quotation_opportunityId_idx" ON "Quotation"("opportunityId");

-- CreateIndex
CREATE INDEX "Quotation_managerId_idx" ON "Quotation"("managerId");

-- CreateIndex
CREATE INDEX "Quotation_marketingPersonId_idx" ON "Quotation"("marketingPersonId");

-- CreateIndex
CREATE INDEX "Quotation_quotationDate_idx" ON "Quotation"("quotationDate");

-- CreateIndex
CREATE INDEX "Quotation_expiryDate_idx" ON "Quotation"("expiryDate");

-- CreateIndex
CREATE INDEX "Quotation_createdAt_idx" ON "Quotation"("createdAt");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationItem_productId_idx" ON "QuotationItem"("productId");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");

-- CreateIndex
CREATE INDEX "SalesOrder_managerId_idx" ON "SalesOrder"("managerId");

-- CreateIndex
CREATE INDEX "SalesOrder_marketingPersonId_idx" ON "SalesOrder"("marketingPersonId");

-- CreateIndex
CREATE INDEX "SalesOrder_orderDate_idx" ON "SalesOrder"("orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_createdAt_idx" ON "SalesOrder"("createdAt");

-- CreateIndex
CREATE INDEX "SalesOrderItem_salesOrderId_idx" ON "SalesOrderItem"("salesOrderId");

-- CreateIndex
CREATE INDEX "SalesOrderItem_productId_idx" ON "SalesOrderItem"("productId");

-- CreateIndex
CREATE INDEX "Service_status_idx" ON "Service"("status");

-- CreateIndex
CREATE INDEX "Service_createdAt_idx" ON "Service"("createdAt");

-- CreateIndex
CREATE INDEX "Survey_status_idx" ON "Survey"("status");

-- CreateIndex
CREATE INDEX "Survey_customerId_idx" ON "Survey"("customerId");

-- CreateIndex
CREATE INDEX "Survey_leadId_idx" ON "Survey"("leadId");

-- CreateIndex
CREATE INDEX "Survey_opportunityId_idx" ON "Survey"("opportunityId");

-- CreateIndex
CREATE INDEX "Survey_serviceId_idx" ON "Survey"("serviceId");

-- CreateIndex
CREATE INDEX "Survey_productId_idx" ON "Survey"("productId");

-- CreateIndex
CREATE INDEX "Survey_surveyDate_idx" ON "Survey"("surveyDate");

-- CreateIndex
CREATE INDEX "Survey_assignedPersonId_idx" ON "Survey"("assignedPersonId");

-- CreateIndex
CREATE INDEX "Survey_createdAt_idx" ON "Survey"("createdAt");

-- CreateIndex
CREATE INDEX "Target_userId_idx" ON "Target"("userId");

-- CreateIndex
CREATE INDEX "Target_metric_idx" ON "Target"("metric");

-- CreateIndex
CREATE INDEX "Target_periodStart_idx" ON "Target"("periodStart");

-- CreateIndex
CREATE INDEX "Target_periodEnd_idx" ON "Target"("periodEnd");
