import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { MailService } from './mail.service';
import { TestEmailDto } from './dto';

@Controller('mail')
export class MailController {
  constructor(private mail: MailService) {}

  // POST /mail/test — actually send a one-off message using the provided SMTP
  // config. Used by both the Mail Configuration settings page and the per-
  // company Custom SMTP block on the Billing Company edit form.
  @Post('test')
  async test(@Body() dto: TestEmailDto) {
    try {
      return await this.mail.sendTest(
        {
          smtpServer: dto.smtpServer,
          port: dto.port,
          encryption: dto.encryption,
          user: dto.user ?? '',
          password: dto.password ?? '',
        },
        dto.to,
      );
    } catch (e: any) {
      // Surface the SMTP-level message to the UI. nodemailer's errors are
      // usually descriptive (e.g. "Greeting never received", "Invalid login").
      throw new BadRequestException(e?.message ?? 'Send failed');
    }
  }
}
