import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { TelegramResolverService } from './telegram-resolver.service';
import { MtprotoModule } from '../telegram-mtproto/mtproto.module';

@Module({
  imports: [MtprotoModule],
  controllers: [ContactsController],
  providers: [ContactsService, TelegramResolverService],
})
export class ContactsModule {}
