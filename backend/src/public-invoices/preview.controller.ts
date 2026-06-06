import { Controller, Get, Header, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { applyDynamicFields } from '../common/dynamic-fields';

// Public, unauthenticated preview surface used to eyeball email templates
// straight from the browser. Substitutes the same dynamic-fields tokens that
// the real send pipeline does against a static "sample invoice" so the
// output looks like what the customer would see — without seeding fake data
// or hitting the SMTP path.
@ApiTags('preview')
@Controller('preview')
export class PreviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('email/:templateKey')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async email(@Param('templateKey') templateKey: string, @Res() res: Response) {
    const tpl = await this.prisma.emailTemplate.findUnique({ where: { templateKey } });
    if (!tpl) throw new NotFoundException();

    const ctx = {
      invoiceDate: '2026-05-21',
      dueDate: '2026-06-17',
      invoiceNumber: 'INV-1042',
      customerName: 'Acme Pty Ltd',
      billingCompany: 'SimpleBooks Pty Ltd',
      accountsEmail: 'accounts@simplebooks.com',
      invoiceLink: 'http://localhost:3000/i/PREVIEW_TOKEN',
    };
    const subject = applyDynamicFields(tpl.subject, ctx);
    const body = applyDynamicFields(tpl.body, ctx);

    // Wrap the body so the rendered preview shows the subject + a "this is a
    // preview" banner above the actual email HTML. Sample email clients won't
    // load this page; it's a developer/operator aid only.
    res.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>${tpl.name} preview</title>` +
        `<style>body{margin:0;font-family:Arial,Helvetica,sans-serif}` +
        `.preview-header{background:#1a1a1a;color:#fff;padding:12px 24px;font-size:13px;display:flex;gap:24px;flex-wrap:wrap}` +
        `.preview-header strong{color:#fbbf24}` +
        `</style></head><body>` +
        `<div class="preview-header">` +
        `<span><strong>Preview:</strong> ${tpl.name}</span>` +
        `<span><strong>Subject:</strong> ${escapeHtml(subject)}</span>` +
        `<span><strong>Sample data only</strong> — tokens substituted with fixtures</span>` +
        `</div>` +
        body +
        `</body></html>`,
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
