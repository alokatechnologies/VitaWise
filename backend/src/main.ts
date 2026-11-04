import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('VitaWiseBackend');

  try {
    const app = await NestFactory.create(AppModule);

    // Production and local development frontend URLs
    const allowedOrigins = [
      'https://vita-wise.vercel.app',
      'http://localhost:5173',
    ];

    // Production CORS configuration
    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests without an Origin header (server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked for origin: ${origin}`), false);
        }
      },
      methods: [
        'GET',
        'HEAD',
        'PUT',
        'PATCH',
        'POST',
        'DELETE',
        'OPTIONS',
      ],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
      ],
      credentials: true,
    });

    // Vercel production port configuration
    const port = process.env.PORT || process.env.BACKEND_PORT || 3001;

    await app.listen(port, '0.0.0.0');

    logger.log(`VitaWise Backend running on port ${port}`);
    logger.log('CORS configured successfully');
  } catch (error) {
    logger.error('Failed to start VitaWise Backend', error);
    process.exit(1);
  }
}

bootstrap();
