import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { MtprotoModule } from '../telegram-mtproto/mtproto.module';
import { ContactImportProcessorService } from './contact-import-processor.service';

@Module({
  imports: [MtprotoModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactImportProcessorService],
})
export class ContactsModule {}
