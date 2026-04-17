import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
  });

  app.use(json({ limit: '100mb' }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
