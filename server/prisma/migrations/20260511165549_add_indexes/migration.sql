-- CreateIndex
CREATE INDEX "ai_interactions_ticketId_idx" ON "ai_interactions"("ticketId");

-- CreateIndex
CREATE INDEX "replies_ticketId_idx" ON "replies"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_history_ticketId_idx" ON "ticket_history"("ticketId");

-- CreateIndex
CREATE INDEX "tickets_customerEmail_idx" ON "tickets"("customerEmail");

-- CreateIndex
CREATE INDEX "tickets_status_assigneeId_idx" ON "tickets"("status", "assigneeId");
