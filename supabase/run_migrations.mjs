import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is not set.');
  process.exit(1);
}

async function runMigrations() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL database.');

    // Create migrations tracker table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._vitawise_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    console.log(`Found ${files.length} migration files in ${migrationsDir}:`);

    for (const file of files) {
      const checkRes = await client.query(
        'SELECT id FROM public._vitawise_migrations WHERE name = $1',
        [file]
      );

      if (checkRes.rows.length > 0) {
        console.log(`  [SKIPPED] ${file} (already applied)`);
        continue;
      }

      console.log(`  [APPLYING] ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public._vitawise_migrations (name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`  [SUCCESS]  ${file} applied.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  [FAILED]   ${file}:`, err.message);
        throw err;
      }
    }

    console.log('\nAll migrations executed successfully!');
  } finally {
    await client.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
