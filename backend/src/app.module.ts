import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { TasksModule } from './tasks/tasks.module';
import { InvoicesModule } from './invoices/invoices.module';
import { RecurringModule } from './recurring/recurring.module';
import { TelegramModule } from './telegram/telegram.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CustomersModule } from './customers/customers.module';
import { CompaniesModule } from './companies/companies.module';
import { ItemsModule } from './items/items.module';
import { TaxTypesModule } from './tax-types/tax-types.module';
import { AccountTypesModule } from './account-types/account-types.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { VendorsModule } from './vendors/vendors.module';
import { TransactionsModule } from './transactions/transactions.module';
import { RecurringSchedulesModule } from './recurring-schedules/recurring-schedules.module';
import { MailConfigurationModule } from './mail-configuration/mail-configuration.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InvoiceTemplatesModule } from './invoice-templates/invoice-templates.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { PreferencesModule } from './preferences/preferences.module';
import { PdfModule } from './pdf/pdf.module';
import { PublicInvoicesModule } from './public-invoices/public-invoices.module';
import { TransactionImportsModule } from './transaction-imports/transaction-imports.module';
import { ImportLogsModule } from './import-logs/import-logs.module';
import { RulesModule } from './rules/rules.module';
import { RuleEngineModule } from './rule-engine/rule-engine.module';

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://redis:6379');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
      },
    }),
    PrismaModule,
    TasksModule,
    InvoicesModule,
    RecurringModule,
    TelegramModule,
    DashboardModule,
    CustomersModule,
    CompaniesModule,
    ItemsModule,
    TaxTypesModule,
    AccountTypesModule,
    AccountsModule,
    CategoriesModule,
    VendorsModule,
    TransactionsModule,
    RecurringSchedulesModule,
    MailConfigurationModule,
    NotificationsModule,
    MailModule,
    InvoiceTemplatesModule,
    EmailTemplatesModule,
    PreferencesModule,
    PdfModule,
    PublicInvoicesModule,
    TransactionImportsModule,
    ImportLogsModule,
    RulesModule,
    RuleEngineModule,
  ],
})
export class AppModule {}
