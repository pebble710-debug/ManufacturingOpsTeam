import { readFileSync } from 'node:fs';
import { createClient } from '../src/lib/db.ts';
import { seed } from '../src/lib/seed.ts';

const url = process.env.NETLIFY_DB_URL ?? (JSON.parse(readFileSync('.netlify/state.json', 'utf8')) as { dbConnectionString: string }).dbConnectionString;
const sql = createClient(url);
console.log(await seed(sql));
await sql.end();
