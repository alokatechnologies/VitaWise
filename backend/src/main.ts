import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('VitaWiseBackend');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    // Reflect the requesting origin so credentialed browser requests remain valid
    // in development and production without hard-coding a single frontend host.
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = process.env.BACKEND_PORT || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`VitaWise NestJS Engine operational on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start VitaWise NestJS backend:', err);
});
